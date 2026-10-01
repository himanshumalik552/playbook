import type {
  CampaignRowDto,
  DashboardOverviewDto,
  DashboardSummaryDto,
  DimensionRowDto,
} from '@adpulse/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

export function useDashboardOverview(params: Record<string, string | number | boolean>) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'dashboard', 'overview', params],
    queryFn: () => api.get<DashboardOverviewDto>('/dashboard/overview', params),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useDashboardSummary() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummaryDto>('/dashboard/summary'),
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
  });
}

export function useDashboardBreakdown(
  dimension: 'campaign' | 'adAccount' | 'device' | 'location' | 'objective',
  params: Record<string, string | number | boolean>,
) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'dashboard', 'breakdown', dimension, params],
    queryFn: () => api.get<DimensionRowDto[]>(`/dashboard/breakdown/${dimension}`, params),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useTopCampaigns(params: Record<string, string | number | boolean>) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'campaigns', 'top', params],
    queryFn: () =>
      api.page<CampaignRowDto>('/campaigns', {
        ...params,
        page: 1,
        pageSize: 8,
        sortBy: 'cost',
        sortDir: 'desc',
      }),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}
