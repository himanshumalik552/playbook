import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { safeEqual } from '@adpulse/core';
import { hasPermission, type Permission } from '@adpulse/types';
import { PrismaService } from '../infra/prisma.service';
import { bearerToken, CSRF_COOKIE, CSRF_HEADER, readCookie } from '../modules/auth/auth-cookies';
import { IS_PUBLIC, PERMISSIONS, SKIP_CSRF, SKIP_ORG, SUPER_ADMIN } from './decorators';
import type { AppRequest } from './request-context';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ORG_ID = /^[a-z0-9]{20,40}$/;

function flag(reflector: Reflector, key: string, context: ExecutionContext): boolean {
  return reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) === true;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (flag(this.reflector, IS_PUBLIC, context)) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    if (error || !user) throw new UnauthorizedException('Authentication required');
    return user;
  }
}

/**
 * Double-submit CSRF protection for cookie-authenticated, state-changing requests. Requests authenticated
 * with an explicit bearer token are not exposed to CSRF and are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method) || flag(this.reflector, SKIP_CSRF, context) || bearerToken(req))
      return true;
    const cookie = readCookie(req, CSRF_COOKIE);
    const header = req.get(CSRF_HEADER);
    if (!cookie || !header || !safeEqual(cookie, header)) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Missing or invalid CSRF token' });
    }
    return true;
  }
}

/**
 * Resolves the active organization from the X-Organization-Id header and verifies membership.
 * The client-supplied id is never trusted on its own: a membership row must exist (or the user is a super admin).
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      flag(this.reflector, IS_PUBLIC, context) ||
      flag(this.reflector, SKIP_ORG, context) ||
      flag(this.reflector, SUPER_ADMIN, context)
    ) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AppRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const organizationId = req.get('x-organization-id');
    if (!organizationId || !ORG_ID.test(organizationId)) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_REQUIRED',
        message: 'Select an organization (X-Organization-Id header)',
      });
    }

    const membership = await this.db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: { organization: true },
    });
    if (membership && !membership.organization.deletedAt) {
      const org = membership.organization;
      req.org = {
        organizationId: org.id,
        organizationName: org.name,
        currencyCode: org.currencyCode,
        timezone: org.timezone,
        role: membership.role,
      };
      return true;
    }
    if (user.systemRole === 'SUPER_ADMIN') {
      const org = await this.db.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
      if (org) {
        req.org = {
          organizationId: org.id,
          organizationName: org.name,
          currencyCode: org.currencyCode,
          timezone: org.timezone,
          role: 'SUPER_ADMIN',
        };
        return true;
      }
    }
    throw new ForbiddenException({
      code: 'NOT_A_MEMBER',
      message: 'You are not a member of this organization',
    });
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (flag(this.reflector, SUPER_ADMIN, context)) {
      if (req.user?.systemRole !== 'SUPER_ADMIN')
        throw new ForbiddenException('Platform administrator access required');
      return true;
    }
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const role = req.org?.role;
    const missing = required.filter((p) => !hasPermission(role, p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Your role does not allow this action',
        details: { missing },
      });
    }
    return true;
  }
}
