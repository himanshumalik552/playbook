import {
  formatChangePercent,
  formatCurrency,
  formatMetric,
  formatNumber,
  formatPercent,
  METRIC_DEFINITIONS,
} from '@adpulse/kpi';
import type { KpiKey, MetricChange } from '@adpulse/types';
import type { KpiChange } from '@adpulse/ui';
import { format as formatDateFns, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { useOrg } from '@/providers/OrgProvider';

export const LOCALE = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US';

export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—';
  return formatDateFns(parseISO(iso.slice(0, 10)), pattern);
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86_400), 'day');
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toKpiChange(change: MetricChange | undefined | null): KpiChange | null {
  if (!change || change.percent === null) return null;
  const direction = change.percent > 0.05 ? 'up' : change.percent < -0.05 ? 'down' : 'flat';
  return { label: formatChangePercent(change.percent), direction, isImprovement: change.isImprovement };
}

export interface Formatters {
  currencyCode: string;
  timeZone: string;
  metric: (key: KpiKey, value: number | null | undefined, compact?: boolean) => string;
  currency: (value: number | null | undefined, compact?: boolean) => string;
  number: (value: number | null | undefined, decimals?: number) => string;
  percent: (value: number | null | undefined, decimals?: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}

export function createFormatters(currencyCode: string, timeZone: string): Formatters {
  const base = { locale: LOCALE, currency: currencyCode };
  return {
    currencyCode,
    timeZone,
    metric: (key, value, compact = false) => {
      const def = METRIC_DEFINITIONS[key];
      const useCompact =
        compact && (def.format === 'currency' || def.format === 'integer') && Math.abs(value ?? 0) >= 10_000;
      return formatMetric(key, value ?? null, {
        ...base,
        compact: useCompact,
        ...(useCompact ? { decimals: 1 } : {}),
      });
    },
    currency: (value, compact = false) => formatCurrency(value ?? null, { ...base, compact }),
    number: (value, decimals) =>
      formatNumber(value ?? null, { ...base, ...(decimals === undefined ? {} : { decimals }) }),
    percent: (value, decimals) =>
      formatPercent(value ?? null, { ...base, ...(decimals === undefined ? {} : { decimals }) }),
    dateTime: (iso) => formatDateTime(iso, timeZone),
  };
}

/** Formatters bound to the active organization's currency and reporting timezone. */
export function useFormat(): Formatters {
  const { settings } = useOrg();
  const currency = settings?.currencyCode ?? 'USD';
  const timeZone = settings?.timezone ?? 'UTC';
  return useMemo(() => createFormatters(currency, timeZone), [currency, timeZone]);
}
