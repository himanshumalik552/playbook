import {
  hasPermission,
  type MembershipSummary,
  type OrganizationSettings,
  type Permission,
} from '@adpulse/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { api, setActiveOrganizationId } from '@/api/client';
import { ME_QUERY_KEY, useAuth } from './auth';
import { OrgContext, type OrgValue } from './org';

const ORG_KEY = 'adpulse.activeOrganization';
const accountKey = (orgId: string) => `adpulse.activeAccount.${orgId}`;

function pickMembership(
  memberships: MembershipSummary[],
  preferred: string | null,
): MembershipSummary | null {
  return memberships.find((m) => m.organizationId === preferred) ?? memberships[0] ?? null;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [preferred, setPreferred] = useState<string | null>(() => localStorage.getItem(ORG_KEY));
  const membership = useMemo(() => pickMembership(user?.memberships ?? [], preferred), [user, preferred]);
  const organizationId = membership?.organizationId ?? null;

  // Set synchronously during render so child queries issued in the same pass carry the right header.
  setActiveOrganizationId(organizationId);

  const [accountByOrg, setAccountByOrg] = useState<Record<string, string | null>>({});
  const adAccountId = organizationId
    ? (accountByOrg[organizationId] ?? localStorage.getItem(accountKey(organizationId)))
    : null;

  const settingsQuery = useQuery({
    queryKey: ['org', organizationId, 'settings'],
    queryFn: () => api.get<OrganizationSettings>('/organizations/current'),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
  });

  const switchOrganization = useCallback(
    (id: string) => {
      localStorage.setItem(ORG_KEY, id);
      setActiveOrganizationId(id);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      setPreferred(id);
    },
    [queryClient],
  );

  const setAdAccountId = useCallback(
    (id: string | null) => {
      if (!organizationId) return;
      if (id) localStorage.setItem(accountKey(organizationId), id);
      else localStorage.removeItem(accountKey(organizationId));
      setAccountByOrg((prev) => ({ ...prev, [organizationId]: id }));
    },
    [organizationId],
  );

  const role = membership?.role ?? null;
  const can = useCallback((permission: Permission) => hasPermission(role, permission), [role]);

  const value = useMemo<OrgValue>(
    () => ({
      membership,
      organizationId,
      role,
      settings: settingsQuery.data ?? null,
      settingsLoading: settingsQuery.isPending && Boolean(organizationId),
      can,
      switchOrganization,
      adAccountId,
      setAdAccountId,
    }),
    [
      membership,
      organizationId,
      role,
      settingsQuery.data,
      settingsQuery.isPending,
      can,
      switchOrganization,
      adAccountId,
      setAdAccountId,
    ],
  );
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
