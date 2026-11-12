import type { NormalizedEvent } from './types.js';

export const PREMATCH_REQUEST_BUDGET = 8;
export const PREMATCH_DAY_SPAN = 6;
export const UPCOMING_PAGE_SIZE = 50;

const MAJOR_LEAGUES: Array<[RegExp, number]> = [
  [/nations league/i, 0],
  [/world cup|european championship|copa america/i, 1],
  [/champions league/i, 2],
  [/europa league|conference league/i, 3],
  [/premier league|la liga|serie a|bundesliga|ligue 1/i, 4],
  [/friendly|friendlies/i, 5],
];

export interface UpcomingPager {
  page: number;
  perPage: number;
  total: number;
}

export function coverageDays(nowMs: number, span = PREMATCH_DAY_SPAN): string[] {
  const start = new Date(nowMs);
  const days: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset));
    const month = String(day.getUTCMonth() + 1).padStart(2, '0');
    const date = String(day.getUTCDate()).padStart(2, '0');
    days.push(`${day.getUTCFullYear()}${month}${date}`);
  }
  return days;
}

export function readUpcomingPager(payload: unknown): UpcomingPager | null {
  if (!payload || typeof payload !== 'object') return null;
  const pager = (payload as { pager?: unknown }).pager;
  if (!pager || typeof pager !== 'object') return null;
  const record = pager as { page?: unknown; per_page?: unknown; total?: unknown };
  const page = Number(record.page);
  const perPage = Number(record.per_page);
  const total = Number(record.total);
  if (!Number.isInteger(page) || !Number.isInteger(perPage) || !Number.isInteger(total)) return null;
  if (page < 1 || perPage < 1 || total < 0) return null;
  return { page, perPage, total };
}

export function isEsoccerLeague(name: string | null | undefined): boolean {
  return /\besoccer\b|\be-soccer\b/i.test(name ?? '');
}

export function prematchPriority(name: string | null | undefined): number {
  const label = name ?? '';
  for (const [pattern, rank] of MAJOR_LEAGUES) {
    if (pattern.test(label)) return rank;
  }
  return 100;
}

export function upcomingHasAnotherPage(pager: UpcomingPager | null, eventCount: number): boolean {
  if (pager) return pager.page * pager.perPage < pager.total;
  return eventCount >= UPCOMING_PAGE_SIZE;
}

export function preparePrematch(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  const byId = new Map<string, NormalizedEvent>();
  for (const event of events) {
    if (event.status !== 'prematch' || isEsoccerLeague(event.league.name)) continue;
    if (!byId.has(event.eventId)) byId.set(event.eventId, event);
  }
  return [...byId.values()].sort((left, right) => {
    const rank = prematchPriority(left.league.name) - prematchPriority(right.league.name);
    if (rank !== 0) return rank;
    return (left.kickoff ?? '').localeCompare(right.kickoff ?? '');
  });
}
