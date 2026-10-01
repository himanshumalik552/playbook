import type { Permission } from '@adpulse/types';
import { ForbiddenState } from '@adpulse/ui';
import type { ReactNode } from 'react';
import { useOrg } from '@/providers/org';

/** Page-level gate: shows a clear "no access" state instead of an empty or broken page. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useOrg();
  if (!can(permission)) return <ForbiddenState />;
  return <>{children}</>;
}

/** Inline gate for buttons and controls; renders nothing (or a fallback) when not allowed. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useOrg();
  return <>{can(permission) ? children : fallback}</>;
}
