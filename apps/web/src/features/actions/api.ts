import type { ActionDetailDto, ActionListItemDto, ActionStatus } from '@adpulse/types';
import type { ActionPayload } from '@adpulse/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

export type ActionBoard = Record<ActionStatus, ActionListItemDto[]>;

export type CreateActionBody = ActionPayload & { alertId?: string; recommendationId?: string };

export function useActionKeys() {
  const { organizationId } = useOrg();
  return { all: ['org', organizationId, 'actions'] as const, organizationId };
}

export function useActionList(params: Record<string, string | number | boolean>, enabled = true) {
  const { all, organizationId } = useActionKeys();
  return useQuery({
    queryKey: [...all, 'list', params],
    queryFn: () => api.page<ActionListItemDto>('/actions', params),
    enabled: Boolean(organizationId) && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useActionBoard(enabled = true) {
  const { all, organizationId } = useActionKeys();
  return useQuery({
    queryKey: [...all, 'board'],
    queryFn: () => api.get<ActionBoard>('/actions/board'),
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useAction(id: string | null) {
  const { all, organizationId } = useActionKeys();
  return useQuery({
    queryKey: [...all, 'detail', id],
    queryFn: () => api.get<ActionDetailDto>(`/actions/${id}`),
    enabled: Boolean(organizationId && id),
  });
}

function useInvalidateActions() {
  const queryClient = useQueryClient();
  const { all, organizationId } = useActionKeys();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: all }),
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'dashboard', 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'recommendations'] }),
    ]);
}

export function useCreateAction() {
  const invalidate = useInvalidateActions();
  return useMutation({
    mutationFn: (body: CreateActionBody) => api.post<ActionDetailDto>('/actions', body),
    onSuccess: invalidate,
  });
}

export function useUpdateAction(id: string) {
  const invalidate = useInvalidateActions();
  return useMutation({
    mutationFn: (body: Partial<ActionPayload>) => api.patch<ActionDetailDto>(`/actions/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useTransitionAction() {
  const invalidate = useInvalidateActions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<ActionDetailDto>(`/actions/${id}/transition`, body),
    onSuccess: invalidate,
  });
}

export function useCommentAction(id: string) {
  const invalidate = useInvalidateActions();
  return useMutation({
    mutationFn: (body: string) => api.post(`/actions/${id}/comments`, { body }),
    onSuccess: invalidate,
  });
}

export function useDeleteAction() {
  const invalidate = useInvalidateActions();
  return useMutation({ mutationFn: (id: string) => api.delete(`/actions/${id}`), onSuccess: invalidate });
}
