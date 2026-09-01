export const THEORETICAL_CONTROLLED_GAME_RTP = 0.875;

export const DEFAULT_REPORT_TIMEZONE = 'Asia/Ashgabat';

export const GAME_RTP_PERIODS = ['today', '7d', '30d', 'custom'] as const;

export type GameRtpPeriod = (typeof GAME_RTP_PERIODS)[number];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calendarDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('TIMEZONE_INVALID');
  }
  return `${year}-${month}-${day}`;
}

export function parseReportDate(value: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(value.trim());
  if (!match) throw new Error('PERIOD_INVALID');
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y
    || probe.getUTCMonth() !== m - 1
    || probe.getUTCDate() !== d
  ) {
    throw new Error('PERIOD_INVALID');
  }
  return { y, m, d };
}

/** Inclusive calendar-day UTC bounds for a YYYY-MM-DD in `timeZone`. */
export function zonedDayUtcRange(date: string, timeZone: string): { start: Date; end: Date } {
  parseReportDate(date);
  const start = zonedCivilToUtc(date, timeZone);
  const next = addUtcDays(date, 1);
  const end = zonedCivilToUtc(next, timeZone);
  return { start, end };
}

function addUtcDays(date: string, days: number): string {
  const { y, m, d } = parseReportDate(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function zonedCivilToUtc(date: string, timeZone: string): Date {
  const { y, m, d } = parseReportDate(date);
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 4; i += 1) {
    const shown = calendarDateInZone(new Date(guess), timeZone);
    const shownParts = parseReportDate(shown);
    const shownUtc = Date.UTC(shownParts.y, shownParts.m - 1, shownParts.d);
    const wantedUtc = Date.UTC(y, m - 1, d);
    const delta = wantedUtc - shownUtc;
    if (delta === 0) {
      const hour = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(guess));
      const minute = new Intl.DateTimeFormat('en-US', {
        timeZone,
        minute: '2-digit',
      }).format(new Date(guess));
      const driftMs = (Number(hour) * 60 + Number(minute)) * 60_000;
      if (driftMs === 0) return new Date(guess);
      guess -= driftMs;
      continue;
    }
    guess += delta;
  }
  return new Date(guess);
}

export function rtpMetrics(wagered: number, payouts: number, rounds: number, winningRounds: number) {
  const totalWagered = Number(wagered.toFixed(2));
  const totalPayouts = Number(payouts.toFixed(2));
  const ggr = Number((totalWagered - totalPayouts).toFixed(2));
  return {
    totalWagered,
    totalPayouts,
    rounds,
    winningRounds,
    ggr,
    realizedRtp: totalWagered > 0 ? Number((totalPayouts / totalWagered).toFixed(6)) : null,
    realizedHold: totalWagered > 0 ? Number((ggr / totalWagered).toFixed(6)) : null,
  };
}
