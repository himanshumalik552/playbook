import { addDays, isoDateInTimezone, localClock, startOfMonth } from '@adpulse/kpi';
import type { DateRange, ReportingPreferences } from '@adpulse/types';

export interface ScheduledReportState {
  daily?: string;
  weekly?: string;
  monthly?: string;
}

export interface OrganizationScheduleState {
  timezone: string;
  lastScheduledSyncDate: string | null;
  lastScheduledReport: ScheduledReportState;
  preferences: ReportingPreferences;
}

export interface ScheduleHours {
  syncHour: number;
  reportHour: number;
}

export interface DueWork {
  localDate: string;
  sync: boolean;
  dailySummary: DateRange | null;
  weeklyReport: DateRange | null;
  monthlyReport: DateRange | null;
}

/**
 * Decides what is due for an organization at `now`, evaluated in the organization's timezone.
 * Each item runs at most once per local date: once the configured hour has passed and the
 * last-run marker is older than today. Running the tick hourly therefore tolerates missed ticks.
 */
export function dueWork(state: OrganizationScheduleState, hours: ScheduleHours, now: Date): DueWork {
  const localDate = isoDateInTimezone(now, state.timezone);
  const clock = localClock(now, state.timezone);
  const yesterday = addDays(localDate, -1);
  const reportsDue = clock.hour >= hours.reportHour;
  const notYet = (key: keyof ScheduledReportState) => state.lastScheduledReport[key] !== localDate;

  return {
    localDate,
    sync: clock.hour >= hours.syncHour && state.lastScheduledSyncDate !== localDate,
    dailySummary:
      reportsDue && state.preferences.dailySummaryEnabled && notYet('daily')
        ? { from: yesterday, to: yesterday }
        : null,
    weeklyReport:
      reportsDue && clock.weekday === 1 && state.preferences.weeklyReportEnabled && notYet('weekly')
        ? { from: addDays(localDate, -7), to: yesterday }
        : null,
    monthlyReport:
      reportsDue && clock.dayOfMonth === 1 && state.preferences.monthlyReportEnabled && notYet('monthly')
        ? { from: startOfMonth(yesterday), to: yesterday }
        : null,
  };
}
