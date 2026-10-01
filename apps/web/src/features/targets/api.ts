import type { AlertRuleDto, ChangeLogDto, TargetDto, TargetMetric } from '@adpulse/types';
import type { TargetPayload } from '@adpulse/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

export interface TargetsResponse {
  targets: TargetDto[];
  defaults: Record<TargetMetric, number>;
}

export const TARGET_METRIC_INFO: Record<
  TargetMetric,
  { label: string; unit: 'currency' | 'ratio' | 'percent'; help: string }
> = {
  CPA: { label: 'Target CPA', unit: 'currency', help: 'Maximum acceptable cost per conversion' },
  ROAS: {
    label: 'Target ROAS',
    unit: 'ratio',
    help: 'Minimum conversion value per unit of spend, e.g. 4 = 400%',
  },
  CTR: { label: 'Minimum CTR', unit: 'percent', help: 'Click-through rate threshold for CTR alerts' },
  CONVERSION_RATE: {
    label: 'Minimum conversion rate',
    unit: 'percent',
    help: 'Conversions per click threshold',
  },
  SPEND_PACING_TOLERANCE: {
    label: 'Spend pacing tolerance',
    unit: 'percent',
    help: 'Allowed deviation from the expected spend pace before alerting',
  },
};

export function unitAdornment(metric: TargetMetric, currencyCode: string) {
  const unit = TARGET_METRIC_INFO[metric].unit;
  return unit === 'currency' ? currencyCode : unit === 'percent' ? '%' : '×';
}

export function useTargets() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'targets'],
    queryFn: () => api.get<TargetsResponse>('/targets'),
  });
}

export function useTargetHistory(page: number, pageSize: number) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'targets', 'history', page, pageSize],
    queryFn: () => api.page<ChangeLogDto>('/targets/history', { page, pageSize }),
    placeholderData: keepPreviousData,
  });
}

export function useAlertRules() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'alert-rules'],
    queryFn: () => api.get<AlertRuleDto[]>('/alert-rules'),
  });
}

export function useTargetMutations() {
  const { organizationId } = useOrg();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'targets'] });
  return {
    upsert: useMutation({
      mutationFn: (t: TargetPayload) =>
        api.put<TargetDto>('/targets', {
          scope: t.scope,
          metric: t.metric,
          value: t.value,
          ...(t.scope === 'AD_ACCOUNT' && t.adAccountId ? { adAccountId: t.adAccountId } : {}),
          ...(t.scope === 'CAMPAIGN' && t.campaignId ? { campaignId: t.campaignId } : {}),
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/targets/${id}`), onSuccess: invalidate }),
  };
}

export function useAlertRuleMutations() {
  const { organizationId } = useOrg();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'alert-rules'] });
  return {
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Partial<Pick<AlertRuleDto, 'enabled' | 'severity' | 'thresholds'>>;
      }) => api.patch<AlertRuleDto>(`/alert-rules/${id}`, body),
      onSuccess: invalidate,
    }),
    reset: useMutation({
      mutationFn: (id: string) => api.post<AlertRuleDto>(`/alert-rules/${id}/reset`),
      onSuccess: invalidate,
    }),
  };
}
