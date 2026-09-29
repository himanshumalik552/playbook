import type { KpiValues } from '@adpulse/types';

export const KPI_SORT_KEYS = [
  'impressions',
  'clicks',
  'cost',
  'conversions',
  'conversionValue',
  'ctr',
  'cpc',
  'cpm',
  'conversionRate',
  'cpa',
  'roas',
] as const;

/**
 * Sorts rows by a KPI or by a whitelisted text field. Null KPI values (e.g. CPA with zero conversions)
 * always sort last, regardless of direction, so undefined ratios never appear as "best".
 */
export function sortRows<T>(
  rows: T[],
  sortBy: string | undefined,
  dir: 'asc' | 'desc',
  metrics: (row: T) => KpiValues,
  textFields: Record<string, (row: T) => string> = {},
  fallback = 'cost',
): T[] {
  const key = sortBy ?? fallback;
  const text = textFields[key];
  const factor = dir === 'asc' ? 1 : -1;
  if (text) return [...rows].sort((a, b) => factor * text(a).localeCompare(text(b)));
  const metric = (KPI_SORT_KEYS as readonly string[]).includes(key)
    ? (key as keyof KpiValues)
    : (fallback as keyof KpiValues);
  return [...rows].sort((a, b) => {
    const va = metrics(a)[metric];
    const vb = metrics(b)[metric];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return factor * (va - vb);
  });
}

export function matchesSearch(value: string, search: string | undefined): boolean {
  return !search || value.toLowerCase().includes(search.trim().toLowerCase());
}
