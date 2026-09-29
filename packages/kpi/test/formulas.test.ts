import { describe, expect, it } from 'vitest';
import {
  averageConversionValue,
  computeKpis,
  conversionRate,
  cpa,
  cpc,
  cpm,
  ctr,
  D,
  estimatedConversionValue,
  estimatedCost,
  roas,
  roundTo,
  safeDivide,
  sumTotals,
  toDecimal,
  toKpiValues,
  toNumber,
} from '../src';

describe('decimal helpers', () => {
  it('parses numbers, strings and decimal-like objects', () => {
    expect(toDecimal(1.5)?.toString()).toBe('1.5');
    expect(toDecimal(' 2.25 ')?.toString()).toBe('2.25');
    expect(toDecimal(new D('3.1'))?.toString()).toBe('3.1');
    expect(toDecimal({ toString: () => '10.01' })?.toString()).toBe('10.01');
  });

  it('rejects missing, blank, non-finite and malformed values', () => {
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal('')).toBeNull();
    expect(toDecimal(Number.NaN)).toBeNull();
    expect(toDecimal(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toDecimal('abc')).toBeNull();
    expect(toDecimal('Infinity')).toBeNull();
  });

  it('safeDivide returns null for zero or missing denominators', () => {
    expect(safeDivide(10, 0)).toBeNull();
    expect(safeDivide(10, null)).toBeNull();
    expect(safeDivide(null, 10)).toBeNull();
    expect(safeDivide(10, 4)?.toString()).toBe('2.5');
  });

  it('converts and rounds only for presentation', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(new D('1.25'))).toBe(1.25);
    expect(roundTo('2.345', 2)).toBe(2.35);
    expect(roundTo(null, 2)).toBeNull();
  });
});

describe('KPI formulas', () => {
  it('calculates CPC', () => {
    expect(cpc(250, 100)?.toNumber()).toBe(2.5);
    expect(cpc(250, 0)).toBeNull();
  });

  it('calculates CTR as a percentage', () => {
    expect(ctr(50, 1000)?.toNumber()).toBe(5);
    expect(ctr(1, 3)?.toDecimalPlaces(4).toNumber()).toBe(33.3333);
    expect(ctr(10, 0)).toBeNull();
  });

  it('calculates CPM', () => {
    expect(cpm(20, 4000)?.toNumber()).toBe(5);
    expect(cpm(20, 0)).toBeNull();
  });

  it('calculates conversion rate', () => {
    expect(conversionRate(5, 200)?.toNumber()).toBe(2.5);
    expect(conversionRate(5, 0)).toBeNull();
  });

  it('calculates CPA', () => {
    expect(cpa(300, 12)?.toNumber()).toBe(25);
    expect(cpa(300, 0)).toBeNull();
  });

  it('calculates ROAS', () => {
    expect(roas(1200, 300)?.toNumber()).toBe(4);
    expect(roas(1200, 0)).toBeNull();
  });

  it('calculates estimated cost and conversion value', () => {
    expect(estimatedCost(1.25, 80)?.toNumber()).toBe(100);
    expect(estimatedCost(null, 80)).toBeNull();
    expect(estimatedConversionValue(12, 45.5)?.toNumber()).toBe(546);
    expect(estimatedConversionValue(12, undefined)).toBeNull();
    expect(averageConversionValue(546, 12)?.toNumber()).toBe(45.5);
  });

  it('avoids floating point drift on money', () => {
    const totals = sumTotals([
      { impressions: 1, clicks: 1, cost: '0.1', conversions: 0, conversionValue: 0 },
      { impressions: 1, clicks: 1, cost: '0.2', conversions: 0, conversionValue: 0 },
    ]);
    expect(totals.cost.toString()).toBe('0.3');
  });
});

describe('computeKpis / toKpiValues', () => {
  it('derives all KPIs from totals', () => {
    const k = toKpiValues({
      impressions: 10000,
      clicks: 400,
      cost: '800',
      conversions: '20',
      conversionValue: '3200',
    });
    expect(k).toEqual({
      impressions: 10000,
      clicks: 400,
      cost: 800,
      conversions: 20,
      conversionValue: 3200,
      ctr: 4,
      cpc: 2,
      cpm: 80,
      conversionRate: 5,
      cpa: 40,
      roas: 4,
    });
  });

  it('returns null ratios for empty totals rather than NaN or Infinity', () => {
    const k = toKpiValues({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 });
    for (const key of ['ctr', 'cpc', 'cpm', 'conversionRate', 'cpa', 'roas'] as const) {
      expect(k[key]).toBeNull();
    }
  });

  it('treats missing totals as zero', () => {
    const k = computeKpis({
      impressions: null,
      clicks: undefined,
      cost: '10',
      conversions: null,
      conversionValue: null,
    });
    expect(k.impressions.toNumber()).toBe(0);
    expect(k.cpa).toBeNull();
    expect(k.roas?.toNumber()).toBe(0);
  });

  it('keeps spend with zero conversions distinguishable', () => {
    const k = toKpiValues({ impressions: 1000, clicks: 50, cost: 120, conversions: 0, conversionValue: 0 });
    expect(k.cpa).toBeNull();
    expect(k.conversionRate).toBe(0);
    expect(k.roas).toBe(0);
  });
});
