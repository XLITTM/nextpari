import type { NormalizedEvent } from './types.js';

export const PREMATCH_REQUEST_BUDGET = 8;
export const PREMATCH_DAY_SPAN = 6;
export const UPCOMING_PAGE_SIZE = 50;

const TOP_LEAGUE_NAMES = new Set([
  'uefa nations league',
  'uefa champions league',
  'uefa europa league',
  'uefa conference league',
  'uefa europa conference league',
  'uefa european championship',
  'fifa world cup',
  'copa america',
  'england premier league',
  'premier league',
  'spain la liga',
  'la liga',
  'italy serie a',
  'serie a',
  'germany bundesliga',
  'bundesliga',
  'france ligue 1',
  'ligue 1',
]);

const LOWER_LEAGUE_NAMES = new Set([
  'efl championship',
  'england championship',
  'sky bet championship',
  'efl league one',
  'england league one',
  'efl league two',
  'england league two',
  '2. bundesliga',
  'germany 2. bundesliga',
  '3. liga',
  'germany 3. liga',
  'la liga 2',
  'spain segunda division',
  'segunda division',
  'serie b',
  'italy serie b',
  'ligue 2',
  'france ligue 2',
]);

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

function leagueName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isEsoccerLeague(name: string | null | undefined): boolean {
  const first = leagueName(name).split(' ')[0] ?? '';
  return first === 'esoccer' || first === 'e-soccer';
}

export function isSimulatedLeague(name: string | null | undefined): boolean {
  const first = leagueName(name).split(' ')[0] ?? '';
  return first === 'virtual' || first === 'simulated';
}

export function footballTier(league: { id?: string | null; name?: string | null }): 0 | 1 | 2 {
  const name = leagueName(league.name);
  if (TOP_LEAGUE_NAMES.has(name)) return 0;
  if (LOWER_LEAGUE_NAMES.has(name)) return 2;
  return 1;
}

export function upcomingHasAnotherPage(pager: UpcomingPager | null, eventCount: number): boolean {
  if (pager) return pager.page * pager.perPage < pager.total;
  return eventCount >= UPCOMING_PAGE_SIZE;
}

const majorCompetitions: Readonly<Record<string, ReadonlySet<string>>> = {
  tennis: new Set(['australian open', 'roland garros', 'french open', 'wimbledon', 'us open', 'atp finals', 'wta finals']),
  basketball: new Set(['nba', 'usa nba', 'euroleague', 'fiba world cup']),
  hockey: new Set(['nhl', 'usa nhl', 'iihf world championship']),
  volleyball: new Set(['volleyball nations league', 'fivb world championship']),
  handball: new Set(['ehf champions league', 'ihf world championship']),
  baseball: new Set(['mlb', 'usa mlb', 'world baseball classic']),
  'table-tennis': new Set(['world table tennis championships', 'ittf world championships']),
};

export function eventTier(event: NormalizedEvent): number {
  const name = leagueName(event.league.name);
  if (event.sport === 'esports' || isEsoccerLeague(name) || isSimulatedLeague(name)) return 3;
  if (event.sport === 'football') {
    const tier = footballTier(event.league);
    return tier === 1 && /\b(?:reserves?|u[- ]?[12][0-9]|under[- ]?[12][0-9]|youth|academy|amateur|club friendl(?:y|ies))\b/.test(name) ? 2 : tier;
  }
  return majorCompetitions[event.sport]?.has(name) ? 0 : 1;
}

export function rankFeaturedFootball(events: readonly NormalizedEvent[], includeVirtual = false): NormalizedEvent[] {
  const byId = new Map<string, NormalizedEvent>();
  for (const event of events) {
    if (!includeVirtual && eventTier(event) === 3) continue;
    const key = `${event.sportId}:${event.eventId}`;
    const previous = byId.get(key);
    if (!previous || (event.status === 'live' && previous.status !== 'live')) byId.set(key, event);
  }
  return [...byId.values()].sort((left, right) => {
    const tier = eventTier(left) - eventTier(right);
    if (tier !== 0) return tier;
    if (left.status === 'live' && right.status !== 'live') return -1;
    if (right.status === 'live' && left.status !== 'live') return 1;
    const kickoff = (left.kickoff ?? '').localeCompare(right.kickoff ?? '');
    if (kickoff !== 0) return kickoff;
    return left.eventId.localeCompare(right.eventId);
  });
}

export function preparePrematch(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  return rankFeaturedFootball(events.filter((event) => event.status === 'prematch'));
}
