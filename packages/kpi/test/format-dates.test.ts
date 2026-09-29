import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  daysInRange,
  eachDay,
  formatChangePercent,
  formatCurrency,
  formatMetric,
  formatNumber,
  formatPercent,
  formatRatio,
  isIsoDate,
  isoDateInTimezone,
  localClock,
  parseIsoDate,
  previousPeriod,
  startOfMonth,
  toIsoDate,
} from '../src';

describe('formatting', () => {
  it('formats currency with the configured code', () => {
    expect(formatCurrency(1234.567, { currency: 'USD' })).toBe('$1,234.57');
    expect(formatCurrency(1234.5, { currency: 'EUR', locale: 'en-US' })).toBe('€1,234.50');
    expect(formatCurrency(1500000, { currency: 'USD', compact: true })).toBe('$1.5M');
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined, { fallback: 'n/a' })).toBe('n/a');
  });

  it('formats percentages already expressed in percent units', () => {
    expect(formatPercent(3.14159)).toBe('3.14%');
    expect(formatPercent(3.14159, { decimals: 1 })).toBe('3.1%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats numbers and ratios', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1234567, { compact: true })).toBe('1.2M');
    expect(formatNumber(null)).toBe('—');
    expect(formatRatio(4.256)).toBe('4.26x');
    expect(formatRatio(null)).toBe('—');
  });

  it('formats metrics according to their definition', () => {
    expect(formatMetric('cpa', 42.1, { currency: 'USD' })).toBe('$42.10');
    expect(formatMetric('ctr', 2.5)).toBe('2.50%');
    expect(formatMetric('roas', 3)).toBe('3.00x');
    expect(formatMetric('clicks', 1500)).toBe('1,500');
    expect(formatMetric('conversions', 12.34)).toBe('12.3');
  });

  it('formats signed percent change', () => {
    expect(formatChangePercent(12.345)).toBe('+12.3%');
    expect(formatChangePercent(-4)).toBe('-4.0%');
    expect(formatChangePercent(0)).toBe('0.0%');
    expect(formatChangePercent(null)).toBe('—');
  });
});

describe('dates', () => {
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26-02-01')).toBe(false);
    expect(() => parseIsoDate('bad')).toThrow(RangeError);
  });

  it('adds days and counts inclusive ranges', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysInRange({ from: '2026-01-01', to: '2026-01-31' })).toBe(31);
    expect(toIsoDate(parseIsoDate('2026-05-05'))).toBe('2026-05-05');
  });

  it('computes the previous period of equal length', () => {
    expect(previousPeriod({ from: '2026-03-08', to: '2026-03-14' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-07',
    });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('enumerates days', () => {
    expect(eachDay({ from: '2026-01-30', to: '2026-02-02' })).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('resolves dates and clocks in organization timezones', () => {
    const instant = new Date('2026-06-01T02:30:00.000Z');
    expect(isoDateInTimezone(instant, 'UTC')).toBe('2026-06-01');
    expect(isoDateInTimezone(instant, 'America/Los_Angeles')).toBe('2026-05-31');
    expect(localClock(instant, 'Asia/Kolkata')).toEqual({ hour: 8, weekday: 1, dayOfMonth: 1 });
  });

  it('handles month boundaries', () => {
    expect(startOfMonth('2026-02-17')).toBe('2026-02-01');
    expect(daysInMonth('2026-02-17')).toBe(28);
    expect(daysInMonth('2028-02-01')).toBe(29);
  });
});
