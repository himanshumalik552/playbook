import { CAMPAIGN_OBJECTIVES, type CampaignObjective, DEVICES, type Device } from '@adpulse/types';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toParams } from '@/api/client';
import { defaultRange, isValidRange } from '@/lib/dates';
import { useOrg } from '@/providers/org';

export interface MetricFilters {
  from: string;
  to: string;
  compare: boolean;
  adAccountId: string | null;
  campaignIds: string[];
  device: Device | null;
  locationId: string | null;
  objective: CampaignObjective | null;
}

export type MetricFilterPatch = Partial<MetricFilters>;

const FILTER_KEYS = ['from', 'to', 'compare', 'campaignIds', 'device', 'locationId', 'objective'] as const;

/**
 * Metric filters live in the URL so views are shareable and survive reloads. The ad account comes from the
 * header switcher so it follows the user across pages.
 */
export function useMetricFilters() {
  const [params, setParams] = useSearchParams();
  const { settings, adAccountId, setAdAccountId } = useOrg();
  const timeZone = settings?.timezone ?? 'UTC';
  const prefs = settings?.reportingPreferences;

  const filters = useMemo<MetricFilters>(() => {
    const from = params.get('from');
    const to = params.get('to');
    const range = isValidRange(from, to)
      ? { from: from as string, to: to as string }
      : defaultRange(timeZone, prefs?.defaultDateRangeDays ?? 30);
    const compareParam = params.get('compare');
    const device = params.get('device');
    const objective = params.get('objective');
    const location = params.get('locationId');
    return {
      ...range,
      compare: compareParam === null ? (prefs?.compareByDefault ?? true) : compareParam === 'true',
      adAccountId,
      campaignIds: (params.get('campaignIds') ?? '').split(',').filter((id) => /^[a-z0-9]{20,40}$/.test(id)),
      device: DEVICES.includes(device as Device) ? (device as Device) : null,
      locationId: location && /^\d{1,12}$/.test(location) ? location : null,
      objective: CAMPAIGN_OBJECTIVES.includes(objective as CampaignObjective)
        ? (objective as CampaignObjective)
        : null,
    };
  }, [params, timeZone, prefs, adAccountId]);

  const setFilters = useCallback(
    (patch: MetricFilterPatch) => {
      if ('adAccountId' in patch) setAdAccountId(patch.adAccountId ?? null);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of FILTER_KEYS) {
            if (!(key in patch)) continue;
            const value = patch[key];
            const serialized = Array.isArray(value)
              ? value.join(',')
              : value === null || value === undefined
                ? ''
                : String(value);
            if (serialized === '') next.delete(key);
            else next.set(key, serialized);
          }
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams, setAdAccountId],
  );

  const resetFilters = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of FILTER_KEYS) next.delete(key);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const apiParams = useMemo(
    () =>
      toParams({
        from: filters.from,
        to: filters.to,
        compare: filters.compare,
        adAccountId: filters.adAccountId,
        campaignIds: filters.campaignIds,
        device: filters.device,
        locationId: filters.locationId,
        objective: filters.objective,
      }),
    [filters],
  );

  const activeCount = [
    filters.campaignIds.length > 0,
    filters.device,
    filters.locationId,
    filters.objective,
  ].filter(Boolean).length;

  return { filters, setFilters, resetFilters, apiParams, activeCount };
}

/** Page/sort/search state for server-paginated tables, synchronized with the URL. */
export function useTableParams(
  defaults: { sortBy?: string; sortDir?: 'asc' | 'desc'; pageSize?: number } = {},
) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : (defaults.pageSize ?? 25);
  const sortBy = params.get('sortBy') ?? defaults.sortBy ?? '';
  const sortDir =
    params.get('sortDir') === 'asc'
      ? 'asc'
      : params.get('sortDir') === 'desc'
        ? 'desc'
        : (defaults.sortDir ?? 'desc');
  const search = params.get('q') ?? '';

  const update = useCallback(
    (patch: Record<string, string | number | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    page,
    pageSize,
    sortBy,
    sortDir: sortDir as 'asc' | 'desc',
    search,
    setPage: (p: number) => update({ page: p }, false),
    setPageSize: (s: number) => update({ pageSize: s }),
    setSort: (s: { by: string; dir: 'asc' | 'desc' }) => update({ sortBy: s.by, sortDir: s.dir }),
    setSearch: (q: string) => update({ q }),
    getParam: (key: string) => params.get(key),
    setParam: (key: string, value: string | null, resetPage = true) => update({ [key]: value }, resetPage),
    params: { page, pageSize, ...(sortBy ? { sortBy } : {}), sortDir, ...(search ? { search } : {}) },
  };
}
