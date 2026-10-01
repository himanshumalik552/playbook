import type {
  AccessibleCustomerDto,
  AdAccountDto,
  IntegrationConnectionDto,
  IntegrationOverviewDto,
  IntegrationProvider,
  SyncJobDto,
} from '@adpulse/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

export type AccessibleAccount = AccessibleCustomerDto & { selected: boolean };

export interface AvailableProperty {
  propertyId: string;
  name: string;
  timezone: string;
  linked: boolean;
  adAccountId: string | null;
}

export function useIntegrationsOverview() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'integrations'],
    queryFn: () => api.get<IntegrationOverviewDto>('/integrations'),
    enabled: Boolean(organizationId),
  });
}

export function useAdAccounts() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'ad-accounts'],
    queryFn: () => api.get<AdAccountDto[]>('/ad-accounts'),
    enabled: Boolean(organizationId),
  });
}

export function useAccessibleAccounts(connectionId: string | null) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'integrations', connectionId, 'accounts'],
    queryFn: () => api.get<AccessibleAccount[]>(`/integrations/${connectionId}/accounts`),
    enabled: Boolean(organizationId && connectionId),
  });
}

export function useAvailableProperties(connectionId: string | null) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'integrations', connectionId, 'properties'],
    queryFn: () => api.get<AvailableProperty[]>(`/integrations/${connectionId}/properties`),
    enabled: Boolean(organizationId && connectionId),
  });
}

function useInvalidateIntegrations() {
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'integrations'] }),
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'ad-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'filter-options'] }),
    ]);
}

export function useConnectDemo() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      api.post<IntegrationConnectionDto>('/integrations/demo', { provider }),
    onSuccess: invalidate,
  });
}

/** Starts Google consent; the browser leaves the app and returns via the API callback. */
export function useConnectGoogle() {
  return useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      api.post<{ url: string }>('/integrations/google/connect', { provider }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useSelectAccounts(connectionId: string | null) {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (customerIds: string[]) =>
      api.put<{ accounts: AdAccountDto[]; initialSyncsQueued: number }>(
        `/integrations/${connectionId}/accounts`,
        { customerIds },
      ),
    onSuccess: invalidate,
  });
}

export function useSelectProperties(connectionId: string | null) {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (links: { propertyId: string; adAccountId: string | null }[]) =>
      api.put(`/integrations/${connectionId}/properties`, { links }),
    onSuccess: invalidate,
  });
}

export function useDisconnect() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (connectionId: string) => api.delete(`/integrations/${connectionId}`),
    onSuccess: invalidate,
  });
}

export function useSetAccountActive() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<AdAccountDto>(`/ad-accounts/${id}`, { isActive }),
    onSuccess: invalidate,
  });
}

export function useSyncJobs(page: number, pageSize: number) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'sync-jobs', page, pageSize],
    queryFn: () => api.page<SyncJobDto>('/sync/jobs', { page, pageSize }),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ? 3000 : false,
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();
  return useMutation({
    mutationFn: (adAccountIds?: string[]) =>
      api.post<{ created: boolean; jobs: SyncJobDto[] }>('/sync', adAccountIds ? { adAccountIds } : {}, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'sync-jobs'] }),
  });
}
