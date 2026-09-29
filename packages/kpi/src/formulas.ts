import type { KpiValues, MetricTotals } from '@adpulse/types';
import { type DecimalValue, type Numeric, safeDivide, toDecimal, toDecimalOrZero, toNumber } from './decimal';

export interface RawTotals {
  impressions: Numeric;
  clicks: Numeric;
  cost: Numeric;
  conversions: Numeric;
  conversionValue: Numeric;
}

export interface DecimalTotals {
  impressions: DecimalValue;
  clicks: DecimalValue;
  cost: DecimalValue;
  conversions: DecimalValue;
  conversionValue: DecimalValue;
}

export interface DecimalKpis extends DecimalTotals {
  ctr: DecimalValue | null;
  cpc: DecimalValue | null;
  cpm: DecimalValue | null;
  conversionRate: DecimalValue | null;
  cpa: DecimalValue | null;
  roas: DecimalValue | null;
}

export const cpc = (cost: Numeric, clicks: Numeric) => safeDivide(cost, clicks);

export const ctr = (clicks: Numeric, impressions: Numeric) =>
  safeDivide(clicks, impressions)?.times(100) ?? null;

export const cpm = (cost: Numeric, impressions: Numeric) =>
  safeDivide(cost, impressions)?.times(1000) ?? null;

export const conversionRate = (conversions: Numeric, clicks: Numeric) =>
  safeDivide(conversions, clicks)?.times(100) ?? null;

export const cpa = (cost: Numeric, conversions: Numeric) => safeDivide(cost, conversions);

export const roas = (conversionValue: Numeric, cost: Numeric) => safeDivide(conversionValue, cost);

export const averageConversionValue = (conversionValue: Numeric, conversions: Numeric) =>
  safeDivide(conversionValue, conversions);

export function estimatedCost(cpcValue: Numeric, clicks: Numeric): DecimalValue | null {
  const c = toDecimal(cpcValue);
  const k = toDecimal(clicks);
  return c === null || k === null ? null : c.times(k);
}

export function estimatedConversionValue(
  conversions: Numeric,
  avgConversionValue: Numeric,
): DecimalValue | null {
  const c = toDecimal(conversions);
  const v = toDecimal(avgConversionValue);
  return c === null || v === null ? null : c.times(v);
}

export function normalizeTotals(totals: RawTotals): DecimalTotals {
  return {
    impressions: toDecimalOrZero(totals.impressions),
    clicks: toDecimalOrZero(totals.clicks),
    cost: toDecimalOrZero(totals.cost),
    conversions: toDecimalOrZero(totals.conversions),
    conversionValue: toDecimalOrZero(totals.conversionValue),
  };
}

export function sumTotals(rows: readonly RawTotals[]): DecimalTotals {
  return rows.reduce<DecimalTotals>(
    (acc, row) => {
      const n = normalizeTotals(row);
      return {
        impressions: acc.impressions.plus(n.impressions),
        clicks: acc.clicks.plus(n.clicks),
        cost: acc.cost.plus(n.cost),
        conversions: acc.conversions.plus(n.conversions),
        conversionValue: acc.conversionValue.plus(n.conversionValue),
      };
    },
    normalizeTotals({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }),
  );
}

export function computeKpis(totals: RawTotals): DecimalKpis {
  const t = normalizeTotals(totals);
  return {
    ...t,
    ctr: ctr(t.clicks, t.impressions),
    cpc: cpc(t.cost, t.clicks),
    cpm: cpm(t.cost, t.impressions),
    conversionRate: conversionRate(t.conversions, t.clicks),
    cpa: cpa(t.cost, t.conversions),
    roas: roas(t.conversionValue, t.cost),
  };
}

/** Converts precise Decimal KPIs to JSON-safe numbers at the API boundary (no rounding applied). */
export function toKpiValues(totals: RawTotals): KpiValues {
  const k = computeKpis(totals);
  const totalsOut: MetricTotals = {
    impressions: k.impressions.toNumber(),
    clicks: k.clicks.toNumber(),
    cost: k.cost.toNumber(),
    conversions: k.conversions.toNumber(),
    conversionValue: k.conversionValue.toNumber(),
  };
  return {
    ...totalsOut,
    ctr: toNumber(k.ctr),
    cpc: toNumber(k.cpc),
    cpm: toNumber(k.cpm),
    conversionRate: toNumber(k.conversionRate),
    cpa: toNumber(k.cpa),
    roas: toNumber(k.roas),
  };
}

export const EMPTY_TOTALS: RawTotals = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  conversionValue: 0,
};
