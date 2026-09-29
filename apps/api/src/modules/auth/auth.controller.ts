import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppEnv } from '@adpulse/config';
import { generateToken, type Logger, redactSecrets } from '@adpulse/core';
import type { Response } from 'express';
import { CurrentUser, Public, Req, SkipCsrf, SkipOrg } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser } from '../../common/request-context';
import { APP_ENV, LOGGER } from '../../infra/tokens';
import {
  clearSessionCookies,
  type CookieSettings,
  CSRF_COOKIE,
  OAUTH_STATE_COOKIE,
  readCookie,
  REFRESH_COOKIE,
  setCsrfCookie,
  setSessionCookies,
} from './auth-cookies';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './auth.dto';
import { AuthService, type ClientMeta } from './auth.service';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

function meta(req: AppRequest): ClientMeta {
  return { userAgent: req.get('user-agent')?.slice(0, 500) ?? null, ipAddress: req.ip ?? null };
}

@ApiTags('auth')
@Controller('auth')
@SkipOrg()
export class AuthController {
  private readonly cookies: CookieSettings;

  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.cookies = { secure: env.COOKIE_SECURE, ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) };
  }

  @Public()
  @Get('csrf')
  @ApiOperation({
    summary: 'Issue a CSRF token (double-submit cookie) for subsequent state-changing requests',
  })
  csrf(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const existing = readCookie(req, CSRF_COOKIE);
    const token = existing ?? generateToken(24);
    if (!existing) setCsrfCookie(res, this.cookies, token);
    return { csrfToken: token };
  }

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @ApiOperation({ summary: 'Create an account with email and password' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(dto, meta(req));
    setSessionCookies(res, this.cookies, session);
    return { userId: session.userId };
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto.email, dto.password, meta(req));
    setSessionCookies(res, this.cookies, session);
    return { userId: session.userId };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(readCookie(req, REFRESH_COOKIE), meta(req));
      setSessionCookies(res, this.cookies, session);
      return { userId: session.userId };
    } catch (error) {
      clearSessionCookies(res, this.cookies);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out of the current session' })
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    clearSessionCookies(res, this.cookies);
    return { loggedOut: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out of every session for this user' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessions = await this.auth.logoutAll(user.id, auditContext(req));
    clearSessionCookies(res, this.cookies);
    return { sessions };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Email a password reset link if the account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: AppRequest) {
    await this.auth.forgotPassword(dto.email, meta(req));
    return { accepted: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token; signs out all sessions' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: AppRequest) {
    await this.auth.resetPassword(dto.token, dto.password, meta(req));
    return { reset: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a new verification email' })
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.sendVerificationFor(user.id);
    return { accepted: true };
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start Google sign-in (redirects to Google)' })
  googleStart(@Query('next') next: string | undefined, @Res() res: Response) {
    try {
      const { url, cookie } = this.auth.googleSignInStart(next);
      res.cookie(OAUTH_STATE_COOKIE, cookie, {
        ...this.cookies,
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth/google',
        maxAge: 600_000,
      });
      res.redirect(url);
    } catch {
      res.redirect(`${this.env.WEB_URL}/sign-in?error=google_unavailable`);
    }
  }

  @Public()
  @SkipCsrf()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google sign-in callback' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: AppRequest,
    @Res() res: Response,
  ) {
    res.clearCookie(OAUTH_STATE_COOKIE, { ...this.cookies, path: '/api/v1/auth/google' });
    if (error)
      return res.redirect(
        `${this.env.WEB_URL}/auth/callback?status=error&reason=${encodeURIComponent(error.slice(0, 50))}`,
      );
    try {
      const { session, next } = await this.auth.googleSignInComplete(
        code,
        state,
        readCookie(req, OAUTH_STATE_COOKIE),
        meta(req),
      );
      setSessionCookies(res, this.cookies, session);
      const target = new URL('/auth/callback', this.env.WEB_URL);
      target.searchParams.set('status', 'success');
      if (next) target.searchParams.set('next', next);
      return res.redirect(target.toString());
    } catch (err) {
      this.logger.warn(
        { requestId: req.requestId, err: { message: redactSecrets((err as Error).message) } },
        'Google sign-in failed',
      );
      return res.redirect(`${this.env.WEB_URL}/auth/callback?status=error&reason=google_signin_failed`);
    }
  }
}
