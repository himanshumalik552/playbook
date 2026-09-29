import type { OrgRole, Role } from './enums';

export const PERMISSIONS = [
  'analytics:read',
  'reports:read',
  'reports:generate',
  'reports:commentary',
  'reports:schedule',
  'alerts:update',
  'alerts:bulk',
  'alert-rules:manage',
  'targets:manage',
  'recommendations:create',
  'recommendations:decide',
  'actions:create',
  'actions:update',
  'actions:assign',
  'search-terms:review',
  'integrations:manage',
  'sync:trigger',
  'members:manage',
  'organization:manage',
  'audit:read',
  'admin:system',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = ['analytics:read', 'reports:read'];

const ANALYST: Permission[] = [
  ...VIEWER,
  'reports:generate',
  'reports:commentary',
  'alerts:update',
  'recommendations:create',
  'actions:create',
  'actions:update',
  'search-terms:review',
];

const MARKETING_MANAGER: Permission[] = [
  ...ANALYST,
  'reports:schedule',
  'alerts:bulk',
  'alert-rules:manage',
  'targets:manage',
  'recommendations:decide',
  'actions:assign',
  'sync:trigger',
  'audit:read',
];

const ORGANIZATION_ADMIN: Permission[] = [
  ...MARKETING_MANAGER,
  'integrations:manage',
  'members:manage',
  'organization:manage',
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  VIEWER: new Set(VIEWER),
  ANALYST: new Set(ANALYST),
  MARKETING_MANAGER: new Set(MARKETING_MANAGER),
  ORGANIZATION_ADMIN: new Set(ORGANIZATION_ADMIN),
  SUPER_ADMIN: new Set(PERMISSIONS),
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ORGANIZATION_ADMIN: 'Organization admin',
  MARKETING_MANAGER: 'Marketing manager',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

/** Ordered from most to least privileged; used to prevent privilege escalation on invites/role changes. */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  ORGANIZATION_ADMIN: 4,
  MARKETING_MANAGER: 3,
  ANALYST: 2,
  VIEWER: 1,
};
