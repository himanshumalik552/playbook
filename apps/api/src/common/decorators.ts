import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Permission } from '@adpulse/types';
import type { AppRequest, AuthUser, OrgContext } from './request-context';

export const IS_PUBLIC = 'adpulse:public';
export const SKIP_ORG = 'adpulse:skip-org';
export const SKIP_CSRF = 'adpulse:skip-csrf';
export const PERMISSIONS = 'adpulse:permissions';
export const SUPER_ADMIN = 'adpulse:super-admin';

/** Route does not require authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is authenticated but not scoped to an organization (profile, organization list, onboarding). */
export const SkipOrg = () => SetMetadata(SKIP_ORG, true);

/** Safe only for endpoints that are reached by top-level navigation from a third party (OAuth callbacks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

/** Requires every listed permission in the active organization. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

/** Restricted to platform super administrators. Implies SkipOrg. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});

export const CurrentOrg = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrgContext => {
  const org = ctx.switchToHttp().getRequest<AppRequest>().org;
  if (!org) throw new UnauthorizedException('Organization context required');
  return org;
});

export const Req = createParamDecorator((_data: unknown, ctx: ExecutionContext): AppRequest =>
  ctx.switchToHttp().getRequest<AppRequest>(),
);
