import { formatCurrency } from '@adpulse/kpi';
import type { KpiValues } from '@adpulse/types';

export type SearchTermFlag = 'NEGATIVE_CANDIDATE' | 'EXPENSIVE' | 'HIGH_PERFORMER';

export interface SearchTermClassification {
  flag: SearchTermFlag | null;
  reason: string | null;
}

export const SEARCH_TERM_THRESHOLDS = {
  negativeMinClicks: 15,
  expensiveCpaMultiple: 2,
  expensiveMinCostMultiple: 1.5,
  highPerformerCpaMultiple: 0.6,
  highPerformerMinConversions: 3,
};

/**
 * Flags a search term for human review. Flags are suggestions only: negative keywords are never applied
 * automatically, and a term without conversions in the window may still assist conversions elsewhere.
 */
export function classifySearchTerm(
  metrics: KpiValues,
  targetCpa: number,
  currency: string,
): SearchTermClassification {
  const th = SEARCH_TERM_THRESHOLDS;
  const money = (v: number) => formatCurrency(v, { currency });

  if (metrics.conversions === 0 && metrics.clicks >= th.negativeMinClicks) {
    return {
      flag: 'NEGATIVE_CANDIDATE',
      reason: `${metrics.clicks} clicks and ${money(metrics.cost)} spend with no recorded conversions in this period. Review intent before adding as a negative keyword.`,
    };
  }
  if (
    metrics.cpa !== null &&
    metrics.cpa > targetCpa * th.expensiveCpaMultiple &&
    metrics.cost > targetCpa * th.expensiveMinCostMultiple
  ) {
    return {
      flag: 'EXPENSIVE',
      reason: `CPA of ${money(metrics.cpa)} is more than ${th.expensiveCpaMultiple}× the ${money(targetCpa)} target.`,
    };
  }
  if (
    metrics.cpa !== null &&
    metrics.conversions >= th.highPerformerMinConversions &&
    metrics.cpa < targetCpa * th.highPerformerCpaMultiple
  ) {
    return {
      flag: 'HIGH_PERFORMER',
      reason: `CPA of ${money(metrics.cpa)} is well below target with ${metrics.conversions.toFixed(1)} conversions; consider adding as an exact-match keyword.`,
    };
  }
  return { flag: null, reason: null };
}
