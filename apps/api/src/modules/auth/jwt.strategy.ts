import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { AppEnv } from '@adpulse/config';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV } from '../../infra/tokens';
import { ACCESS_COOKIE, readCookie } from './auth-cookies';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(APP_ENV) env: AppEnv,
    private readonly db: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readCookie(req, ACCESS_COOKIE) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: env.JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
      issuer: 'adpulse',
      audience: 'adpulse-api',
      ignoreExpiration: false,
    });
  }

  /** Access tokens are short-lived, but the session is still checked so logout-everywhere takes effect at once. */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const session = await this.db.userSession.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, email: true, name: true, systemRole: true, deletedAt: true } } },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.deletedAt
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      systemRole: session.user.systemRole,
      sessionId: session.id,
    };
  }
}
