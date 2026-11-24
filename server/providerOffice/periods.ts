import { ProviderOfficeError } from './errors.js';

/** England and Wales bank holidays used for the OddsPapi reporting deadlines. */
const UK_HOLIDAYS = new Set([
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-05-04',
  '2026-05-25',
  '2026-08-31',
  '2026-12-25',
  '2026-12-28',
  '2027-01-01',
  '2027-03-26',
  '2027-03-29',
  '2027-05-03',
  '2027-05-31',
  '2027-08-30',
  '2027-12-27',
  '2027-12-28',
]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ReportingPeriod {
  start: string;
  end: string;
}

export function assertIsoDate(value: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) throw new ProviderOfficeError('PERIOD_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ProviderOfficeError('PERIOD_INVALID');
  }
  return value;
}

export function addDays(iso: string, days: number): string {
  const date = utcDate(assertIsoDate(iso));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodContaining(iso: string, startDay = 23): ReportingPeriod {
  if (!Number.isInteger(startDay) || startDay < 2 || startDay > 28) {
    throw new ProviderOfficeError('PERIOD_INVALID');
  }
  const date = assertIsoDate(iso);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  let startYear = year;
  let startMonth = month;
  if (day < startDay) {
    startMonth -= 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear -= 1;
    }
  }
  const endMonth = startMonth === 12 ? 1 : startMonth + 1;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;
  return {
    start: isoDate(startYear, startMonth, startDay),
    end: isoDate(endYear, endMonth, startDay - 1),
  };
}

export function periodsThrough(commencement: string, asOf: string, startDay = 23): ReportingPeriod[] {
  const start = assertIsoDate(commencement);
  const end = assertIsoDate(asOf);
  if (end < start) return [];
  const periods: ReportingPeriod[] = [];
  let cursor = start;
  for (let guard = 0; guard < 36; guard += 1) {
    const period = periodContaining(cursor, startDay);
    if (period.start > end) break;
    if (period.end >= start) periods.push(period);
    const next = addDays(period.end, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return periods;
}

export function isUkBusinessDay(iso: string): boolean {
  const date = assertIsoDate(iso);
  const year = Number(date.slice(0, 4));
  if (year < 2026 || year > 2027) throw new ProviderOfficeError('UK_HOLIDAY_CALENDAR_EXHAUSTED');
  const weekday = utcDate(date).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !UK_HOLIDAYS.has(date);
}

/** Count business days strictly after `iso`. */
export function addUkBusinessDays(iso: string, count: number): string {
  if (!Number.isInteger(count) || count < 1 || count > 40) {
    throw new ProviderOfficeError('PERIOD_INVALID');
  }
  let cursor = assertIsoDate(iso);
  let left = count;
  for (let guard = 0; guard < 80 && left > 0; guard += 1) {
    cursor = addDays(cursor, 1);
    if (isUkBusinessDay(cursor)) left -= 1;
  }
  if (left !== 0) throw new ProviderOfficeError('UK_HOLIDAY_CALENDAR_EXHAUSTED');
  return cursor;
}

export function exclusiveEnd(period: ReportingPeriod): string {
  return `${addDays(period.end, 1)}T00:00:00.000Z`;
}

export function periodStartInstant(period: ReportingPeriod): string {
  return `${period.start}T00:00:00.000Z`;
}

function utcDate(iso: string): Date {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
