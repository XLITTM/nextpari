import type { NormalizedEvent } from './types.js';

export const PREMATCH_REQUEST_BUDGET = 8;
export const PREMATCH_DAY_SPAN = 6;
export const UPCOMING_PAGE_SIZE = 50;

/** BetsAPI Events league id verified in the canonical catalog. */
export const VERIFIED_FOOTBALL_LEAGUE_IDS: Readonly<Record<string, 0 | 1>> = {
  '94': 1,
};

const INTERNATIONAL_LEAGUE_NAMES = new Set([
  'uefa nations league',
  'uefa champions league',
  'uefa europa league',
  'uefa conference league',
  'uefa europa conference league',
  'uefa european championship',
  'fifa world cup',
  'copa america',
  'copa libertadores',
]);

const DOMESTIC_LEAGUE_NAMES = new Set([
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
  'netherlands eredivisie',
  'eredivisie',
  'portugal primeira liga',
  'primeira liga',
  'turkey super lig',
  'super lig',
  'turkey super league',
  'brazil serie a',
  'argentina primera division',
  'argentina liga profesional',
  'england championship',
  'efl championship',
  'sky bet championship',
  'england fa cup',
  'fa cup',
  'spain copa del rey',
  'copa del rey',
  'italy coppa italia',
  'coppa italia',
  'germany dfb pokal',
  'dfb-pokal',
  'france coupe de france',
  'coupe de france',
]);

const LOWER_LEAGUE_NAMES = new Set([
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

const YOUTH_OR_FRIENDLY = /\b(?:reserves?|u[- ]?[12][0-9]|under[- ]?[12][0-9]|youth|academy|amateur|friendl(?:y|ies))\b/;

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

export function isNationsLeagueName(name: string | null | undefined): boolean {
  return /^uefa nations league(?: [a-d])?$/.test(leagueName(name));
}

export function isPriorityInternationalLeague(name: string | null | undefined): boolean {
  const normalized = leagueName(name);
  return INTERNATIONAL_LEAGUE_NAMES.has(normalized) || isNationsLeagueName(normalized);
}

export interface CoverageJob {
  page: number;
  day?: string;
  leagueId?: string;
}

export function coverageJobKey(job: CoverageJob): string {
  return `${job.day ?? ''}:${job.leagueId ?? ''}:${job.page}`;
}

/** Major leagues already seen, then later pages of today, before the rest of the week. */
export function planCoverageJobs(nowMs: number, majorLeagueIds: readonly string[]): CoverageJob[] {
  const days = coverageDays(nowMs);
  const today = days[0];
  const jobs: CoverageJob[] = [];
  const seen = new Set<string>();
  const add = (job: CoverageJob) => {
    const key = coverageJobKey(job);
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push(job);
  };
  for (const leagueId of majorLeagueIds) {
    if (/^\d{1,12}$/.test(leagueId)) add({ page: 1, day: today, leagueId });
  }
  for (const page of [1, 2, 3]) add({ page, day: today });
  add({ page: 1, day: today, leagueId: '94' });
  for (const day of days.slice(1)) add({ page: 1, day });
  add({ page: 1 });
  return jobs;
}

export function footballTier(league: { id?: string | null; name?: string | null }): 0 | 1 | 3 | 4 {
  const verified = league.id ? VERIFIED_FOOTBALL_LEAGUE_IDS[league.id] : undefined;
  if (verified !== undefined) return verified;
  const name = leagueName(league.name);
  if (isNationsLeagueName(name) || INTERNATIONAL_LEAGUE_NAMES.has(name)) return 0;
  if (DOMESTIC_LEAGUE_NAMES.has(name)) return 1;
  if (LOWER_LEAGUE_NAMES.has(name) || YOUTH_OR_FRIENDLY.test(name)) return 4;
  return 3;
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
  if (event.sport === 'esports' || isEsoccerLeague(name) || isSimulatedLeague(name)) return 5;
  if (event.sport === 'football') return footballTier(event.league);
  return majorCompetitions[event.sport]?.has(name) ? 2 : 3;
}

export const POPULAR_LINE_WINDOW_MS = 24 * 60 * 60 * 1000;

function dedupeEvents(events: readonly NormalizedEvent[], includeVirtual: boolean): NormalizedEvent[] {
  const byId = new Map<string, NormalizedEvent>();
  for (const event of events) {
    if (!includeVirtual && eventTier(event) === 5) continue;
    const key = `${event.sportId}:${event.eventId}`;
    const previous = byId.get(key);
    if (!previous || (event.status === 'live' && previous.status !== 'live')) byId.set(key, event);
  }
  return [...byId.values()];
}

function hasOpenPrice(event: NormalizedEvent): boolean {
  return event.markets.some((market) => market.status === 'open');
}

function byCompetition(left: NormalizedEvent, right: NormalizedEvent): number {
  const tier = eventTier(left) - eventTier(right);
  if (tier !== 0) return tier;
  const priced = Number(!hasOpenPrice(left)) - Number(!hasOpenPrice(right));
  if (priced !== 0) return priced;
  const kickoff = (left.kickoff ?? '').localeCompare(right.kickoff ?? '');
  if (kickoff !== 0) return kickoff;
  return left.eventId.localeCompare(right.eventId);
}

export function rankFeaturedFootball(events: readonly NormalizedEvent[], includeVirtual = false): NormalizedEvent[] {
  return dedupeEvents(events, includeVirtual).sort((left, right) => {
    const tier = eventTier(left) - eventTier(right);
    if (tier !== 0) return tier;
    if (left.status === 'live' && right.status !== 'live') return -1;
    if (right.status === 'live' && left.status !== 'live') return 1;
    return byCompetition(left, right);
  });
}

export function selectFeaturedLive(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  return dedupeEvents(events, false).filter((event) => event.status === 'live').sort(byCompetition);
}

export function selectFeaturedLine(events: readonly NormalizedEvent[], nowMs: number): NormalizedEvent[] {
  const until = nowMs + POPULAR_LINE_WINDOW_MS;
  return dedupeEvents(events, false).filter((event) => {
    if (event.status !== 'prematch' || !event.kickoff) return false;
    const kickoff = Date.parse(event.kickoff);
    return Number.isFinite(kickoff) && kickoff >= nowMs && kickoff < until;
  }).sort(byCompetition);
}

export function selectSchedule(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  return dedupeEvents(events, false).sort((left, right) => {
    const kickoff = (left.kickoff ?? '9999').localeCompare(right.kickoff ?? '9999');
    if (kickoff !== 0) return kickoff;
    return left.eventId.localeCompare(right.eventId);
  });
}

export function preparePrematch(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  return rankFeaturedFootball(events.filter((event) => event.status === 'prematch'));
}
