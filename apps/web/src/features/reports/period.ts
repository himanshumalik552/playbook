import { addDays, parseIsoDate, startOfMonth } from '@adpulse/kpi';
import type { DateRange, ReportFrequency } from '@adpulse/types';
import { lastCompleteDay } from '@/lib/dates';

/** Mirrors the API default: the most recent complete period for the frequency, in the reporting timezone. */
export function defaultReportPeriod(
  frequency: ReportFrequency,
  timeZone: string,
  weekStartsOn: 0 | 1,
  now = new Date(),
): DateRange {
  const yesterday = lastCompleteDay(timeZone, now);
  switch (frequency) {
    case 'DAILY':
      return { from: yesterday, to: yesterday };
    case 'WEEKLY': {
      const today = addDays(yesterday, 1);
      const weekday = parseIsoDate(today).getUTCDay();
      const offset = (weekday - weekStartsOn + 7) % 7;
      const thisWeekStart = addDays(today, -offset);
      return { from: addDays(thisWeekStart, -7), to: addDays(thisWeekStart, -1) };
    }
    case 'MONTHLY': {
      const today = addDays(yesterday, 1);
      const lastOfPrevious = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastOfPrevious), to: lastOfPrevious };
    }
    case 'CUSTOM':
      return { from: addDays(yesterday, -29), to: yesterday };
  }
}
