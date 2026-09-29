import { addDays, daysInRange, isIsoDate, isoDateInTimezone, startOfMonth } from '@adpulse/kpi';
import type { DateRange } from '@adpulse/types';

export type DatePreset = 'last7' | 'last14' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'Month to date' },
  { value: 'lastMonth', label: 'Last month' },
];

/** Yesterday in the reporting timezone: the last day with complete data. */
export function lastCompleteDay(timeZone: string, now = new Date()): string {
  return addDays(isoDateInTimezone(now, timeZone), -1);
}

export function presetRange(preset: DatePreset, timeZone: string, now = new Date()): DateRange {
  const end = lastCompleteDay(timeZone, now);
  switch (preset) {
    case 'last7':
      return { from: addDays(end, -6), to: end };
    case 'last14':
      return { from: addDays(end, -13), to: end };
    case 'last30':
      return { from: addDays(end, -29), to: end };
    case 'last90':
      return { from: addDays(end, -89), to: end };
    case 'thisMonth':
      return { from: startOfMonth(end), to: end };
    case 'lastMonth': {
      const lastOfPrevious = addDays(startOfMonth(end), -1);
      return { from: startOfMonth(lastOfPrevious), to: lastOfPrevious };
    }
  }
}

export function defaultRange(timeZone: string, days: number, now = new Date()): DateRange {
  const end = lastCompleteDay(timeZone, now);
  return { from: addDays(end, -(days - 1)), to: end };
}

export function matchPreset(range: DateRange, timeZone: string, now = new Date()): DatePreset | null {
  return (
    DATE_PRESETS.find((p) => {
      const r = presetRange(p.value, timeZone, now);
      return r.from === range.from && r.to === range.to;
    })?.value ?? null
  );
}

export function isValidRange(from: string | null, to: string | null): boolean {
  return Boolean(
    from && to && isIsoDate(from) && isIsoDate(to) && from <= to && daysInRange({ from, to }) <= 731,
  );
}
