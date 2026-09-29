import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AppEnv } from '@adpulse/config';
import {
  type AuditContext,
  generateToken,
  GOOGLE_SCOPES,
  hashPassword,
  hashToken,
  JobQueues,
  type OAuthIdentity,
  passwordResetEmail,
  ProviderFactory,
  recordAudit,
  verificationEmail,
  verifyPassword,
} from '@adpulse/core';
import type { User } from '@adpulse/database';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, JOB_QUEUES, PROVIDERS } from '../../infra/tokens';
import type { AccessTokenPayload } from './jwt.strategy';
import { createOAuthState, type OAuthStatePayload, safeNextPath, verifyOAuthState } from './oauth-state';

const DAY_MS = 86_400_000;
const RESET_TTL_MS = 60 * 60_000;
const VERIFY_TTL_MS = 2 * DAY_MS;
/** Parallel refreshes from several tabs can legitimately reuse a just-rotated token. */
const ROTATION_GRACE_MS = 10_000;
export interface ClientMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedSession {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessTtlSeconds: number;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  /** Verified against for unknown emails so failed logins take the same time either way (no enumeration by timing). */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(PROVIDERS) private readonly providers: ProviderFactory,
  ) {}

  private audit(ctx: AuditContext, action: string, metadata: Record<string, unknown> = {}) {
    return recordAudit(this.db, ctx, {
      action,
      entityType: 'User',
      ...(ctx.actorId ? { entityId: ctx.actorId } : {}),
      metadata,
    });
  }

  async issueSession(userId: string, meta: ClientMeta, familyId?: string): Promise<IssuedSession> {
    const refreshSecret = generateToken(32);
    const refreshExpiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL_DAYS * DAY_MS);
    const session = await this.db.userSession.create({
      data: {
        userId,
        familyId: familyId ?? generateToken(16),
        refreshTokenHash: hashToken(refreshSecret),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt: refreshExpiresAt,
      },
    });
    const payload: AccessTokenPayload = { sub: userId, sid: session.id };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      issuer: 'adpulse',
      audience: 'adpulse-api',
      algorithm: 'HS256',
    });
    return {
      userId,
      sessionId: session.id,
      accessToken,
      refreshToken: refreshSecret,
      csrfToken: generateToken(24),
      accessTtlSeconds: this.env.JWT_ACCESS_TTL_SECONDS,
      refreshExpiresAt,
    };
  }

  async register(
    input: { name: string; email: string; password: string },
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new HttpException(
        { code: 'EMAIL_IN_USE', message: 'An account with this email already exists' },
        HttpStatus.CONFLICT,
      );
    }
    const user = await this.db.user.create({
      data: { name: input.name.trim(), email: input.email, passwordHash: await hashPassword(input.password) },
    });
    await this.sendVerification(user);
    await this.audit({ actorId: user.id, ...meta }, 'auth.registered');
    return this.issueSession(user.id, meta);
  }

  async login(email: string, password: string, meta: ClientMeta): Promise<IssuedSession> {
    const user = await this.db.user.findUnique({ where: { email } });
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
    if (!user || !user.passwordHash || user.deletedAt) {
      this.dummyHash ??= hashPassword(generateToken());
      await verifyPassword(await this.dummyHash, password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed attempts. Try again later or reset your password.',
        },
        HttpStatus.LOCKED,
      );
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      const attempts = user.failedLoginCount + 1;
      const lock = attempts >= this.env.LOGIN_MAX_ATTEMPTS;
      await this.db.user.update({
        where: { id: user.id },
        data: lock
          ? {
              failedLoginCount: 0,
              lockedUntil: new Date(Date.now() + this.env.LOGIN_LOCKOUT_MINUTES * 60_000),
            }
          : { failedLoginCount: attempts },
      });
      await this.audit({ actorId: user.id, ...meta }, lock ? 'auth.locked' : 'auth.login_failed', {
        attempts,
      });
      throw invalid;
    }
    await this.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit({ actorId: user.id, ...meta }, 'auth.login');
    return this.issueSession(user.id, meta);
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole session family. */
  async refresh(refreshToken: string | undefined, meta: ClientMeta): Promise<IssuedSession> {
    const unauthorized = new UnauthorizedException({
      code: 'SESSION_EXPIRED',
      message: 'Please sign in again',
    });
    if (!refreshToken) throw unauthorized;
    const session = await this.db.userSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!session || session.user.deletedAt) throw unauthorized;

    if (session.revokedAt) {
      const withinGrace =
        session.revokedReason === 'rotated' && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!withinGrace && session.revokedReason === 'rotated') {
        await this.db.userSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'reuse_detected' },
        });
        await this.audit({ actorId: session.userId, ...meta }, 'auth.refresh_reuse_detected', {
          familyId: session.familyId,
        });
      }
      throw unauthorized;
    }
    if (session.expiresAt < new Date()) throw unauthorized;

    const next = await this.issueSession(session.userId, meta, session.familyId);
    await this.db.userSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedById: next.sessionId,
        lastUsedAt: new Date(),
      },
    });
    return next;
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async logoutAll(userId: string, ctx: AuditContext): Promise<number> {
    const { count } = await this.db.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout_all' },
    });
    await this.audit(ctx, 'auth.logout_all', { sessions: count });
    return count;
  }

  /** Always succeeds from the caller's perspective so the endpoint cannot be used to discover accounts. */
  async forgotPassword(email: string, meta: ClientMeta): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return;
    const token = generateToken(32);
    await this.db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const url = `${this.env.WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.queues.enqueueEmail(passwordResetEmail(user.email, user.name, url));
    await this.audit({ actorId: user.id, ...meta }, 'auth.password_reset_requested');
  }

  async resetPassword(token: string, password: string, meta: ClientMeta): Promise<void> {
    const record = await this.db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpException(
        { code: 'TOKEN_INVALID', message: 'This reset link is invalid or has expired' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const passwordHash = await hashPassword(password);
    await this.db.$transaction([
      this.db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      this.db.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);
    await this.audit({ actorId: record.userId, ...meta }, 'auth.password_reset');
  }

  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    keepSessionId: string,
    ctx: AuditContext,
  ) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (
      user.passwordHash &&
      !(currentPassword && (await verifyPassword(user.passwordHash, currentPassword)))
    ) {
      throw new HttpException(
        { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
      this.db.userSession.updateMany({
        where: { userId, revokedAt: null, id: { not: keepSessionId } },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
    await this.audit(ctx, 'auth.password_changed');
  }

  async sendVerificationFor(userId: string): Promise<void> {
    await this.sendVerification(await this.db.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  private async sendVerification(
    user: Pick<User, 'id' | 'email' | 'name' | 'emailVerifiedAt'>,
  ): Promise<void> {
    if (user.emailVerifiedAt) return;
    const token = generateToken(32);
    await this.db.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    });
    const url = `${this.env.WEB_URL}/verify-email?token=${encodeURIComponent(token)}`;
    await this.queues.enqueueEmail(verificationEmail(user.email, user.name, url));
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.db.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpException(
        { code: 'TOKEN_INVALID', message: 'This verification link is invalid or has expired' },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.db.$transaction([
      this.db.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
  }

  googleSignInStart(next: unknown): { url: string; cookie: string } {
    const redirectUri = this.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!this.providers.googleConfigured || !redirectUri) {
      throw new HttpException(
        { code: 'GOOGLE_UNAVAILABLE', message: 'Google sign-in is not configured' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const nextPath = safeNextPath(next);
    const { state, cookie, codeChallenge } = createOAuthState(this.env.JWT_REFRESH_SECRET, {
      purpose: 'signin',
      ...(nextPath ? { next: nextPath } : {}),
    });
    const url = this.providers
      .oauth()
      .buildAuthUrl({ redirectUri, scopes: GOOGLE_SCOPES.signIn, state, codeChallenge, offline: false });
    return { url, cookie };
  }

  async googleSignInComplete(
    code: string | undefined,
    state: string | undefined,
    stateCookie: string | undefined,
    meta: ClientMeta,
  ): Promise<{ session: IssuedSession; next: string | undefined }> {
    const payload: OAuthStatePayload | null = verifyOAuthState(
      this.env.JWT_REFRESH_SECRET,
      state,
      stateCookie,
      'signin',
    );
    const redirectUri = this.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!payload || !code || !redirectUri) {
      throw new HttpException(
        { code: 'OAUTH_STATE_INVALID', message: 'Sign-in request expired or was tampered with' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const oauth = this.providers.oauth();
    const tokens = await oauth.exchangeCode(code, redirectUri, payload.verifier);
    if (!tokens.idToken) throw new UnauthorizedException('Google did not return an identity token');
    const identity = await oauth.verifyIdToken(tokens.idToken);
    const user = await this.findOrCreateGoogleUser(identity);
    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0 },
    });
    await this.audit({ actorId: user.id, ...meta }, 'auth.login_google');
    return { session: await this.issueSession(user.id, meta), next: payload.next };
  }

  /** Links by Google subject first; an existing email account is linked only when Google verified the address. */
  private async findOrCreateGoogleUser(identity: OAuthIdentity): Promise<User> {
    const bySubject = await this.db.user.findUnique({ where: { googleSubject: identity.subject } });
    if (bySubject) {
      if (bySubject.deletedAt) throw new UnauthorizedException('This account has been deactivated');
      return bySubject;
    }
    if (!identity.emailVerified) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Your Google email address is not verified',
      });
    }
    const byEmail = await this.db.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      if (byEmail.deletedAt) throw new UnauthorizedException('This account has been deactivated');
      return this.db.user.update({
        where: { id: byEmail.id },
        data: { googleSubject: identity.subject, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
    }
    return this.db.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        googleSubject: identity.subject,
        emailVerifiedAt: new Date(),
      },
    });
  }
}
