import type { FilterOptionsDto, MemberDto } from '@adpulse/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { api } from '@/api/client';
import { useOrg } from '@/providers/org';

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useFilterOptions() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'filter-options'],
    queryFn: () => api.get<FilterOptionsDto>('/dashboard/filters'),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'members'],
    queryFn: () => api.get<MemberDto[]>('/memberships'),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });
}

/** Warns before leaving a page (in-app navigation or tab close) while a form has unsaved edits. */
export function useUnsavedChangesWarning(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return blocker;
}
