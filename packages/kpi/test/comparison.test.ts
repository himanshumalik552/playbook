import { describe, expect, it } from 'vitest';
import {
  calculateChange,
  compareKpis,
  deviationFromTarget,
  KPI_KEYS,
  meetsTarget,
  METRIC_DEFINITIONS,
  toKpiValues,
} from '../src';

describe('calculateChange', () => {
  it('computes absolute and percent change', () => {
    expect(calculateChange(120, 100, 'higher')).toEqual({ absolute: 20, percent: 20, isImprovement: true });
  });

  it('treats decreases as improvements for lower-is-better metrics', () => {
    expect(calculateChange(8, 10, 'lower')).toEqual({ absolute: -2, percent: -20, isImprovement: true });
    expect(calculateChange(12, 10, 'lower').isImprovement).toBe(false);
  });

  it('never judges neutral metrics', () => {
    expect(calculateChange(200, 100, 'neutral').isImprovement).toBeNull();
  });

  it('returns null percent when previous is zero', () => {
    expect(calculateChange(50, 0, 'higher')).toEqual({ absolute: 50, percent: null, isImprovement: true });
  });

  it('returns null when either side is missing', () => {
    expect(calculateChange(null, 10, 'higher')).toEqual({
      absolute: null,
      percent: null,
      isImprovement: null,
    });
    expect(calculateChange(10, undefined, 'higher').percent).toBeNull();
  });

  it('reports no improvement when unchanged', () => {
    expect(calculateChange(10, 10, 'higher')).toEqual({ absolute: 0, percent: 0, isImprovement: null });
  });

  it('uses the absolute previous value as denominator for negative baselines', () => {
    expect(calculateChange(-5, -10, 'higher').percent).toBe(50);
  });
});

describe('compareKpis', () => {
  it('compares every KPI with its configured direction', () => {
    const current = toKpiValues({
      impressions: 1000,
      clicks: 60,
      cost: 90,
      conversions: 6,
      conversionValue: 600,
    });
    const previous = toKpiValues({
      impressions: 1000,
      clicks: 50,
      cost: 100,
      conversions: 4,
      conversionValue: 400,
    });
    const change = compareKpis(current, previous);
    expect(Object.keys(change).sort()).toEqual([...KPI_KEYS].sort());
    expect(change.cpa.isImprovement).toBe(true);
    expect(change.cpc.isImprovement).toBe(true);
    expect(change.roas.isImprovement).toBe(true);
    expect(change.cost.isImprovement).toBeNull();
    expect(change.impressions.percent).toBe(0);
  });

  it('yields null changes when the previous ratio is undefined', () => {
    const current = toKpiValues({
      impressions: 100,
      clicks: 10,
      cost: 10,
      conversions: 1,
      conversionValue: 10,
    });
    const previous = toKpiValues({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 });
    expect(compareKpis(current, previous).cpa).toEqual({
      absolute: null,
      percent: null,
      isImprovement: null,
    });
  });
});

describe('targets', () => {
  it('evaluates higher-is-better targets', () => {
    expect(meetsTarget(4.2, 4, 'higher')).toBe(true);
    expect(meetsTarget(3.9, 4, 'higher')).toBe(false);
  });

  it('evaluates lower-is-better targets', () => {
    expect(meetsTarget(45, 50, 'lower')).toBe(true);
    expect(meetsTarget(55, 50, 'lower')).toBe(false);
    expect(meetsTarget(null, 50, 'lower')).toBeNull();
  });

  it('computes deviation from target', () => {
    expect(deviationFromTarget(60, 50)).toBe(20);
    expect(deviationFromTarget(60, 0)).toBeNull();
    expect(deviationFromTarget(null, 50)).toBeNull();
  });

  it('marks CPC and CPA as lower-is-better', () => {
    expect(METRIC_DEFINITIONS.cpc.direction).toBe('lower');
    expect(METRIC_DEFINITIONS.cpa.direction).toBe('lower');
    expect(METRIC_DEFINITIONS.roas.direction).toBe('higher');
  });
});
