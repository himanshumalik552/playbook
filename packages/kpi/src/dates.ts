import type { DateRange } from '@adpulse/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Parses a calendar date (YYYY-MM-DD) as UTC midnight. */
export function parseIsoDate(value: string): Date {
  if (!isIsoDate(value)) throw new RangeError(`Invalid ISO date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * DAY_MS));
}

export function daysInRange(range: DateRange): number {
  return Math.round((parseIsoDate(range.to).getTime() - parseIsoDate(range.from).getTime()) / DAY_MS) + 1;
}

/** The equally long period that ends the day before `range.from`. */
export function previousPeriod(range: DateRange): DateRange {
  const length = daysInRange(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Calendar date of `instant` in the given IANA timezone. */
export function isoDateInTimezone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hour (0-23) and ISO weekday (1 = Monday) of `instant` in the given timezone. */
export function localClock(
  instant: Date,
  timeZone: string,
): { hour: number; weekday: number; dayOfMonth: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    hour: Number(get('hour')),
    weekday: weekdays.indexOf(get('weekday')) + 1,
    dayOfMonth: Number(get('day')),
  };
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function daysInMonth(value: string): number {
  const d = parseIsoDate(startOfMonth(value));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
