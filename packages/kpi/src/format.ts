import type { KpiKey } from '@adpulse/types';
import { type Numeric, toDecimal } from './decimal';
import { METRIC_DEFINITIONS } from './definitions';

export interface FormatOptions {
  locale?: string;
  currency?: string;
  decimals?: number;
  compact?: boolean;
  fallback?: string;
}

const DEFAULT_FALLBACK = '—';

function presentationNumber(value: Numeric, decimals: number): number | null {
  const d = toDecimal(value);
  return d === null ? null : d.toDecimalPlaces(decimals).toNumber();
}

export function formatCurrency(value: Numeric, options: FormatOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const n = presentationNumber(value, decimals);
  if (n === null) return options.fallback ?? DEFAULT_FALLBACK;
  return new Intl.NumberFormat(options.locale ?? 'en-US', {
    style: 'currency',
    currency: options.currency ?? 'USD',
    minimumFractionDigits: options.compact ? 0 : decimals,
    maximumFractionDigits: decimals,
    notation: options.compact ? 'compact' : 'standard',
  }).format(n);
}

/** Formats a value that is already expressed in percent units (e.g. 3.25 → "3.25%"). */
export function formatPercent(value: Numeric, options: FormatOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const n = presentationNumber(value, decimals);
  if (n === null) return options.fallback ?? DEFAULT_FALLBACK;
  return `${new Intl.NumberFormat(options.locale ?? 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)}%`;
}

export function formatNumber(value: Numeric, options: FormatOptions = {}): string {
  const decimals = options.decimals ?? (options.compact ? 1 : 0);
  const n = presentationNumber(value, decimals);
  if (n === null) return options.fallback ?? DEFAULT_FALLBACK;
  return new Intl.NumberFormat(options.locale ?? 'en-US', {
    maximumFractionDigits: decimals,
    notation: options.compact ? 'compact' : 'standard',
  }).format(n);
}

export function formatRatio(value: Numeric, options: FormatOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const n = presentationNumber(value, decimals);
  if (n === null) return options.fallback ?? DEFAULT_FALLBACK;
  return `${n.toFixed(decimals)}x`;
}

export function formatMetric(key: KpiKey, value: Numeric, options: FormatOptions = {}): string {
  const def = METRIC_DEFINITIONS[key];
  const opts = { ...options, decimals: options.decimals ?? def.decimals };
  switch (def.format) {
    case 'currency':
      return formatCurrency(value, opts);
    case 'percent':
      return formatPercent(value, opts);
    case 'ratio':
      return formatRatio(value, opts);
    case 'integer':
    case 'decimal':
      return formatNumber(value, opts);
  }
}

export function formatChangePercent(value: Numeric, options: FormatOptions = {}): string {
  const n = presentationNumber(value, options.decimals ?? 1);
  if (n === null) return options.fallback ?? DEFAULT_FALLBACK;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(options.decimals ?? 1)}%`;
}
