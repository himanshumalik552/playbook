import type { AuditContext } from '@adpulse/core';
import type { Role, SystemRole } from '@adpulse/types';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  sessionId: string;
}

export interface OrgContext {
  organizationId: string;
  organizationName: string;
  currencyCode: string;
  timezone: string;
  /** SUPER_ADMIN when a platform administrator accesses an organization without membership. */
  role: Role;
}

export interface AppRequest extends Request {
  requestId: string;
  user?: AuthUser;
  org?: OrgContext;
}

export function auditContext(req: AppRequest): AuditContext {
  return {
    actorId: req.user?.id ?? null,
    organizationId: req.org?.organizationId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
    requestId: req.requestId,
  };
}
