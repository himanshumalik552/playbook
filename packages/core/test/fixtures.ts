import { toKpiValues } from '@adpulse/kpi';
import type { KpiValues } from '@adpulse/types';

export function kpis(
  totals: Partial<Record<'impressions' | 'clicks' | 'cost' | 'conversions' | 'conversionValue', number>>,
): KpiValues {
  return toKpiValues({
    impressions: totals.impressions ?? 0,
    clicks: totals.clicks ?? 0,
    cost: totals.cost ?? 0,
    conversions: totals.conversions ?? 0,
    conversionValue: totals.conversionValue ?? 0,
  });
}
