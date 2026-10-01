import type { GeneratedReportDto, ReportData, ReportTemplateDto } from '@adpulse/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

const ACTIVE = new Set(['QUEUED', 'PROCESSING']);

export function useReportHistory(page: number, pageSize: number) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'reports', 'history', page, pageSize],
    queryFn: () => api.page<GeneratedReportDto>('/reports', { page, pageSize }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((r) => ACTIVE.has(r.status)) ? 3000 : false),
  });
}

export function useReportTemplates() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'reports', 'templates'],
    queryFn: () => api.get<ReportTemplateDto[]>('/reports/templates'),
  });
}

export function useReportPreview(params: Record<string, string | number | boolean> | null) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'reports', 'preview', params],
    queryFn: () => api.get<ReportData>('/reports/preview', params ?? undefined),
    enabled: Boolean(params),
  });
}

export function useReportMutations() {
  const { organizationId } = useOrg();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'reports'] });
  return {
    generate: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api.post<GeneratedReportDto>('/reports', body, {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),
      onSuccess: invalidate,
    }),
    retry: useMutation({
      mutationFn: (id: string) => api.post<GeneratedReportDto>(`/reports/${id}/retry`),
      onSuccess: invalidate,
    }),
    saveTemplate: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
        id
          ? api.patch<ReportTemplateDto>(`/reports/templates/${id}`, body)
          : api.post<ReportTemplateDto>('/reports/templates', body),
      onSuccess: invalidate,
    }),
    deleteTemplate: useMutation({
      mutationFn: (id: string) => api.delete(`/reports/templates/${id}`),
      onSuccess: invalidate,
    }),
  };
}
