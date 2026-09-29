import { DomainError } from '@adpulse/core';
import {
  defaultReportPeriod,
  MAX_REPORT_DAYS,
  resolveReportPeriod,
} from '../../src/modules/reports/report-period';

// Wednesday 2026-09-30 09:00 UTC.
const now = new Date('2026-09-30T09:00:00.000Z');

describe('defaultReportPeriod', () => {
  it('uses yesterday for daily reports', () => {
    expect(defaultReportPeriod('DAILY', 'UTC', now)).toEqual({ from: '2026-09-29', to: '2026-09-29' });
  });

  it('uses the previous full week, honoring the week start', () => {
    expect(defaultReportPeriod('WEEKLY', 'UTC', now, 1)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(defaultReportPeriod('WEEKLY', 'UTC', now, 0)).toEqual({ from: '2026-09-20', to: '2026-09-26' });
  });

  it('treats a Monday as the start of a new week', () => {
    const monday = new Date('2026-09-28T12:00:00.000Z');
    expect(defaultReportPeriod('WEEKLY', 'UTC', monday, 1)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('uses the previous calendar month', () => {
    expect(defaultReportPeriod('MONTHLY', 'UTC', now)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('uses the last 30 completed days for custom reports', () => {
    expect(defaultReportPeriod('CUSTOM', 'UTC', now)).toEqual({ from: '2026-08-31', to: '2026-09-29' });
  });

  it('evaluates "today" in the organization timezone', () => {
    // 23:30 UTC is already 1 October in Tokyo but still 30 September in Los Angeles.
    const lateUtc = new Date('2026-09-30T23:30:00.000Z');
    expect(defaultReportPeriod('DAILY', 'Asia/Tokyo', lateUtc)).toEqual({
      from: '2026-09-30',
      to: '2026-09-30',
    });
    expect(defaultReportPeriod('DAILY', 'America/Los_Angeles', lateUtc)).toEqual({
      from: '2026-09-29',
      to: '2026-09-29',
    });
  });
});

describe('resolveReportPeriod', () => {
  it('falls back to the frequency default when no dates are given', () => {
    expect(resolveReportPeriod('DAILY', 'UTC', {}, now)).toEqual({ from: '2026-09-29', to: '2026-09-29' });
  });

  it('accepts a valid explicit range', () => {
    expect(resolveReportPeriod('CUSTOM', 'UTC', { from: '2026-09-01', to: '2026-09-15' }, now)).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
  });

  it.each([
    [{ from: '2026-09-01' }, 'both'],
    [{ from: '2026-9-1', to: '2026-09-15' }, 'both'],
    [{ from: '2026-09-15', to: '2026-09-01' }, 'on or before'],
    [{ from: '2026-09-01', to: '2026-09-30' }, 'completed days'],
    [{ from: '2025-01-01', to: '2026-09-01' }, `${MAX_REPORT_DAYS} days`],
  ])('rejects %j', (requested, message) => {
    expect(() => resolveReportPeriod('CUSTOM', 'UTC', requested, now)).toThrow(DomainError);
    expect(() => resolveReportPeriod('CUSTOM', 'UTC', requested, now)).toThrow(message);
  });
});
