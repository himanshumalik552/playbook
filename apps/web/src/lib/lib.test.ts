import { describe, expect, it } from 'vitest';
import { safeNext } from '@/features/auth/safeNext';
import { defaultReportPeriod } from '@/features/reports/period';
import { defaultRange, isValidRange, lastCompleteDay, matchPreset, presetRange } from './dates';
import { createFormatters, formatBytes, humanize, toKpiChange } from './format';

const NOW = new Date('2026-09-28T10:00:00Z');

describe('date helpers', () => {
  it('ends ranges on the last complete day in the reporting timezone', () => {
    expect(lastCompleteDay('UTC', NOW)).toBe('2026-09-27');
    expect(lastCompleteDay('Pacific/Kiritimati', new Date('2026-09-28T23:30:00Z'))).toBe('2026-09-28');
  });

  it('builds preset ranges', () => {
    expect(presetRange('last7', 'UTC', NOW)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(presetRange('thisMonth', 'UTC', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-27' });
    expect(presetRange('lastMonth', 'UTC', NOW)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(defaultRange('UTC', 30, NOW)).toEqual(presetRange('last30', 'UTC', NOW));
  });

  it('recognizes presets and validates custom ranges', () => {
    expect(matchPreset({ from: '2026-09-21', to: '2026-09-27' }, 'UTC', NOW)).toBe('last7');
    expect(matchPreset({ from: '2026-09-20', to: '2026-09-27' }, 'UTC', NOW)).toBeNull();
    expect(isValidRange('2026-09-01', '2026-09-27')).toBe(true);
    expect(isValidRange('2026-09-27', '2026-09-01')).toBe(false);
    expect(isValidRange('2020-01-01', '2026-09-01')).toBe(false);
    expect(isValidRange('not-a-date', '2026-09-01')).toBe(false);
    expect(isValidRange(null, '2026-09-01')).toBe(false);
  });

  it('derives the previous complete report period', () => {
    expect(defaultReportPeriod('DAILY', 'UTC', 1, NOW)).toEqual({ from: '2026-09-27', to: '2026-09-27' });
    expect(defaultReportPeriod('WEEKLY', 'UTC', 1, NOW)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(defaultReportPeriod('WEEKLY', 'UTC', 0, NOW)).toEqual({ from: '2026-09-20', to: '2026-09-26' });
    expect(defaultReportPeriod('MONTHLY', 'UTC', 1, NOW)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(defaultReportPeriod('CUSTOM', 'UTC', 1, NOW)).toEqual({ from: '2026-08-29', to: '2026-09-27' });
  });
});

describe('formatting', () => {
  const f = createFormatters('EUR', 'UTC');

  it('formats metrics with the organization currency', () => {
    expect(f.metric('cost', 1234.5)).toContain('1,234.50');
    expect(f.metric('cost', 1234.5)).toContain('€');
    expect(f.metric('ctr', 3.456)).toBe('3.46%');
    expect(f.metric('cpa', null)).toBe('—');
    expect(f.metric('impressions', 1_250_000, true)).toMatch(/1\.3M/);
  });

  it('maps metric changes to KPI card changes', () => {
    expect(toKpiChange({ absolute: 5, percent: 12.5, isImprovement: true })).toEqual({
      label: '+12.5%',
      direction: 'up',
      isImprovement: true,
    });
    expect(toKpiChange({ absolute: 0, percent: 0, isImprovement: null })?.direction).toBe('flat');
    expect(toKpiChange({ absolute: 1, percent: null, isImprovement: null })).toBeNull();
    expect(toKpiChange(undefined)).toBeNull();
  });

  it('humanizes enum values and byte sizes', () => {
    expect(humanize('NEEDS_ATTENTION')).toBe('Needs attention');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(null)).toBe('—');
  });
});

describe('safeNext', () => {
  it('only allows same-origin relative redirects', () => {
    expect(safeNext('/campaigns?from=2026-09-01')).toBe('/campaigns?from=2026-09-01');
    expect(safeNext('https://evil.example')).toBe('/dashboard');
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext('/\\evil.example')).toBe('/dashboard');
    expect(safeNext(null, '/onboarding')).toBe('/onboarding');
  });
});
