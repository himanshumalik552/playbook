import type { KpiKey, KpiValues, MetricChange } from '@adpulse/types';
import { type Numeric, safeDivide, toDecimal } from './decimal';
import { KPI_KEYS, METRIC_DEFINITIONS, type MetricDirection } from './definitions';

export interface ChangeResult {
  absolute: number | null;
  percent: number | null;
  isImprovement: boolean | null;
}

/**
 * Period-over-period change. Percent change is null when the previous value is zero or missing,
 * because a relative change from zero is undefined.
 */
export function calculateChange(
  current: Numeric,
  previous: Numeric,
  direction: MetricDirection,
): ChangeResult {
  const c = toDecimal(current);
  const p = toDecimal(previous);
  if (c === null || p === null) return { absolute: null, percent: null, isImprovement: null };

  const absolute = c.minus(p);
  const percent = safeDivide(absolute, p.abs())?.times(100) ?? null;

  let isImprovement: boolean | null = null;
  if (!absolute.isZero() && direction !== 'neutral') {
    isImprovement = direction === 'higher' ? absolute.isPositive() : absolute.isNegative();
  }

  return { absolute: absolute.toNumber(), percent: percent?.toNumber() ?? null, isImprovement };
}

export function compareKpis(current: KpiValues, previous: KpiValues): Record<KpiKey, MetricChange> {
  const result = {} as Record<KpiKey, MetricChange>;
  for (const key of KPI_KEYS) {
    result[key] = calculateChange(current[key], previous[key], METRIC_DEFINITIONS[key].direction);
  }
  return result;
}

/** True when the value meets the target, respecting whether lower values are better for the metric. */
export function meetsTarget(value: Numeric, target: Numeric, direction: Exclude<MetricDirection, 'neutral'>) {
  const v = toDecimal(value);
  const t = toDecimal(target);
  if (v === null || t === null) return null;
  return direction === 'higher' ? v.gte(t) : v.lte(t);
}

/** Relative deviation of a value from its target, expressed as a percentage of the target. */
export function deviationFromTarget(value: Numeric, target: Numeric): number | null {
  const v = toDecimal(value);
  const t = toDecimal(target);
  if (v === null || t === null) return null;
  return safeDivide(v.minus(t), t.abs())?.times(100).toNumber() ?? null;
}
