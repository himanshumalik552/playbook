import { Prisma } from '@adpulse/database';
import type { CampaignObjective, CampaignStatus, ChannelType, Device, MatchType } from '@adpulse/types';
import type { ProviderMetrics, ProviderStatus } from '../providers/types';

export function mapStatus(status: ProviderStatus): CampaignStatus {
  return status === 'ENABLED' || status === 'PAUSED' || status === 'REMOVED' ? status : 'PAUSED';
}

export function mapChannelType(value: string): ChannelType {
  switch (value) {
    case 'SEARCH':
      return 'SEARCH';
    case 'DISPLAY':
      return 'DISPLAY';
    case 'SHOPPING':
      return 'SHOPPING';
    case 'PERFORMANCE_MAX':
      return 'PERFORMANCE_MAX';
    case 'VIDEO':
    case 'DEMAND_GEN':
      return 'VIDEO';
    default:
      return 'SEARCH';
  }
}

const OBJECTIVES: CampaignObjective[] = ['SEARCH', 'DISPLAY', 'REMARKETING', 'LEAD_GENERATION', 'ECOMMERCE'];

/**
 * Google Ads has no single "objective" field, so it is inferred from channel type and naming conventions.
 * Users can override it later; subsequent syncs never overwrite an existing objective.
 */
export function inferObjective(channelType: ChannelType, name: string, hint?: string): CampaignObjective {
  if (hint && (OBJECTIVES as string[]).includes(hint)) return hint as CampaignObjective;
  const n = name.toLowerCase();
  if (/remarket|retarget|rlsa|past (buyers|visitors)/.test(n)) return 'REMARKETING';
  if (/lead|quote|signup|sign-up|form/.test(n)) return 'LEAD_GENERATION';
  if (channelType === 'SHOPPING' || channelType === 'PERFORMANCE_MAX' || /shop|ecom|product/.test(n))
    return 'ECOMMERCE';
  if (channelType === 'DISPLAY' || channelType === 'VIDEO') return 'DISPLAY';
  return 'SEARCH';
}

export function mapDevice(value: string): Device {
  if (value === 'DESKTOP' || value === 'MOBILE' || value === 'TABLET') return value;
  return 'OTHER';
}

export function mapMatchType(value: string): MatchType {
  if (value === 'EXACT' || value === 'PHRASE') return value;
  return 'BROAD';
}

export function microsToDecimal(micros: string | null | undefined): Prisma.Decimal {
  if (!micros) return new Prisma.Decimal(0);
  return new Prisma.Decimal(micros).div(1_000_000);
}

export function shareToDecimal(value: number | null): Prisma.Decimal | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(Math.min(1, Math.max(0, value)).toFixed(4));
}

/** Normalizes a URL or GA4 landing page to a join key: lower-case path without query or trailing slash. */
export function normalizePath(urlOrPath: string): string {
  let path = urlOrPath;
  try {
    path = new URL(urlOrPath).pathname;
  } catch {
    path = urlOrPath.split('?')[0] ?? urlOrPath;
  }
  path = path.toLowerCase().replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return url.trim();
  }
}

export interface DbMetricValues {
  impressions: number;
  clicks: number;
  cost: Prisma.Decimal;
  conversions: Prisma.Decimal;
  conversionValue: Prisma.Decimal;
}

export function toDbMetrics(row: ProviderMetrics): DbMetricValues {
  return {
    impressions: row.impressions,
    clicks: row.clicks,
    cost: microsToDecimal(row.costMicros),
    conversions: new Prisma.Decimal(row.conversions.toString()),
    conversionValue: new Prisma.Decimal(row.conversionsValue.toString()),
  };
}

/** Sums provider rows that collapse onto the same internal key (e.g. CONNECTED_TV and OTHER → OTHER). */
export function aggregateRows<T extends ProviderMetrics>(
  rows: T[],
  key: (row: T) => string | null,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const existing = out.get(k);
    if (!existing) {
      out.set(k, { ...row });
      continue;
    }
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.costMicros = (BigInt(existing.costMicros || '0') + BigInt(row.costMicros || '0')).toString();
    existing.conversions += row.conversions;
    existing.conversionsValue += row.conversionsValue;
  }
  return out;
}

export function splitRange(from: string, to: string, days: number): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  const DAY = 86_400_000;
  let start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (start <= end) {
    const chunkEnd = Math.min(end, start + (days - 1) * DAY);
    ranges.push({
      from: new Date(start).toISOString().slice(0, 10),
      to: new Date(chunkEnd).toISOString().slice(0, 10),
    });
    start = chunkEnd + DAY;
  }
  return ranges;
}
