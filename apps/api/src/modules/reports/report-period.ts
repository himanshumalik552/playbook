import { DomainError } from '@adpulse/core';
import { addDays, daysInRange, isIsoDate, isoDateInTimezone, localClock, startOfMonth } from '@adpulse/kpi';
import type { DateRange, ReportFrequency } from '@adpulse/types';

export const MAX_REPORT_DAYS = 366;

/**
 * Default reporting period for a frequency, in the organization's timezone. Periods always end
 * yesterday or earlier, because today's Google Ads data is incomplete.
 */
export function defaultReportPeriod(
  frequency: ReportFrequency,
  timezone: string,
  now = new Date(),
  weekStartsOn: 0 | 1 = 1,
): DateRange {
  const today = isoDateInTimezone(now, timezone);
  const yesterday = addDays(today, -1);
  switch (frequency) {
    case 'DAILY':
      return { from: yesterday, to: yesterday };
    case 'WEEKLY': {
      const jsWeekday = localClock(now, timezone).weekday % 7;
      const daysSinceStart = (jsWeekday - weekStartsOn + 7) % 7;
      const thisWeekStart = addDays(today, -daysSinceStart);
      return { from: addDays(thisWeekStart, -7), to: addDays(thisWeekStart, -1) };
    }
    case 'MONTHLY': {
      const lastMonthEnd = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastMonthEnd), to: lastMonthEnd };
    }
    case 'CUSTOM':
      return { from: addDays(yesterday, -29), to: yesterday };
  }
}

/** Uses the explicit range when both ends are given, otherwise the frequency default. */
export function resolveReportPeriod(
  frequency: ReportFrequency,
  timezone: string,
  requested: { from?: string; to?: string },
  now = new Date(),
  weekStartsOn: 0 | 1 = 1,
): DateRange {
  if (!requested.from && !requested.to) return defaultReportPeriod(frequency, timezone, now, weekStartsOn);
  if (!requested.from || !requested.to || !isIsoDate(requested.from) || !isIsoDate(requested.to)) {
    throw new DomainError('VALIDATION_FAILED', 'Provide both "from" and "to" as YYYY-MM-DD, or neither');
  }
  const range = { from: requested.from, to: requested.to };
  if (range.from > range.to) throw new DomainError('VALIDATION_FAILED', '"from" must be on or before "to"');
  if (range.to >= isoDateInTimezone(now, timezone))
    throw new DomainError('VALIDATION_FAILED', 'Reports can only cover completed days (up to yesterday)');
  if (daysInRange(range) > MAX_REPORT_DAYS)
    throw new DomainError('VALIDATION_FAILED', `A report can cover at most ${MAX_REPORT_DAYS} days`);
  return range;
}
