import { DEFAULT_REPORTING_PREFERENCES } from '@adpulse/types';
import { describe, expect, it } from 'vitest';
import { dueWork, type OrganizationScheduleState } from '../src/scheduler/schedule';

const hours = { syncHour: 6, reportHour: 7 };

function state(overrides: Partial<OrganizationScheduleState> = {}): OrganizationScheduleState {
  return {
    timezone: 'America/New_York',
    lastScheduledSyncDate: null,
    lastScheduledReport: {},
    preferences: DEFAULT_REPORTING_PREFERENCES,
    ...overrides,
  };
}

describe('dueWork', () => {
  it('waits until the local sync hour', () => {
    // 09:30 UTC = 05:30 in New York (EDT)
    const result = dueWork(state(), hours, new Date('2026-09-28T09:30:00Z'));
    expect(result).toEqual({
      localDate: '2026-09-28',
      sync: false,
      dailySummary: null,
      weeklyReport: null,
      monthlyReport: null,
    });
  });

  it('schedules the morning sync once per local day', () => {
    const now = new Date('2026-09-28T10:30:00Z');
    expect(dueWork(state(), hours, now).sync).toBe(true);
    expect(dueWork(state({ lastScheduledSyncDate: '2026-09-28' }), hours, now).sync).toBe(false);
  });

  it('uses the organization timezone for the local date', () => {
    const now = new Date('2026-09-28T02:00:00Z');
    expect(dueWork(state({ timezone: 'America/Los_Angeles' }), hours, now).localDate).toBe('2026-09-27');
    expect(dueWork(state({ timezone: 'Asia/Tokyo' }), hours, now)).toMatchObject({
      localDate: '2026-09-28',
      sync: true,
    });
  });

  it('produces the weekly report on Monday for the previous seven days', () => {
    const monday = new Date('2026-09-28T12:00:00Z');
    const result = dueWork(state(), hours, monday);
    expect(result.dailySummary).toEqual({ from: '2026-09-27', to: '2026-09-27' });
    expect(result.weeklyReport).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(result.monthlyReport).toBeNull();
    const tuesday = dueWork(state(), hours, new Date('2026-09-29T12:00:00Z'));
    expect(tuesday.weeklyReport).toBeNull();
  });

  it('produces the monthly report on the 1st for the previous month', () => {
    const result = dueWork(state(), hours, new Date('2026-10-01T12:00:00Z'));
    expect(result.monthlyReport).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('respects last-run markers and disabled preferences', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const ran = state({ lastScheduledReport: { daily: '2026-10-05', weekly: '2026-10-05' } });
    expect(dueWork(ran, hours, now)).toMatchObject({ dailySummary: null, weeklyReport: null });
    const disabled = state({
      preferences: {
        ...DEFAULT_REPORTING_PREFERENCES,
        dailySummaryEnabled: false,
        weeklyReportEnabled: false,
      },
    });
    expect(dueWork(disabled, hours, now)).toMatchObject({ dailySummary: null, weeklyReport: null });
  });
});
