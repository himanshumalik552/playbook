import type { MembershipSummary, OrganizationSettings, OrgRole, Permission } from '@adpulse/types';
import { createContext, useContext } from 'react';

export interface OrgValue {
  membership: MembershipSummary | null;
  organizationId: string | null;
  role: OrgRole | null;
  settings: OrganizationSettings | null;
  settingsLoading: boolean;
  can: (permission: Permission) => boolean;
  switchOrganization: (organizationId: string) => void;
  /** Header account switcher; null means all accounts. */
  adAccountId: string | null;
  setAdAccountId: (id: string | null) => void;
}

export const OrgContext = createContext<OrgValue | null>(null);

export function useOrg(): OrgValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
