import { tournamentLine } from './betTicket';
import { isUnixClock, liveMinuteLabel, mapBetsApiEvent, parseSsScore, tournamentPriority, type LiveEventSnapshot, type NormalizedMatch } from './betsapi';
import { groupsFromLiveOdds, orderPriorityMarkets } from './marketOrder';
import { groupsFromParsedMarkets, type ParsedMarket } from './odds-parser';
import { isFullTime1x2 } from './matchOdds';
import { isLsportsDisplayEvent, lsportsCardMarkets } from './lsportsFeed';
import type { EventState } from '../stores/sportsStore';
import type { MarketCategory, MarketGroup, MatchEvent, SportId } from '../types';

const SPORT_IDS: SportId[] = [
  'all',
  'football',
  'tennis',
  'basketball',
  'hockey',
  'volleyball',
  'esports',
  'table-tennis',
  'badminton',
  'baseball',
  'polo',
  'cricket',
  'beach-volleyball',
  'snooker',
  'futsal',
  'elections',
  'pickleball',
  'fifa',
  'mk',
  'polybet',
  'ufc',
  'mma',
  'filter',
];

const TEAM_COLORS = [
  '#6CABDD',
  '#EF0107',
  '#552583',
  '#007A33',
  '#E5A00D',
  '#EF4444',
  '#1D4ED8',
  '#111827',
];

type OddRow = {
  outcome?: string;
  name?: string;
  label?: string;
  value?: number | string;
  coefficient?: number | string;
  odd?: number | string;
  price?: number | string;
};

type MarketRow = {
  id?: string;
  name?: string;
  type?: string;
  odds?: OddRow[] | null;
};

type TournamentRow = {
  name?: string;
  country?: string;
  sport?: string;
};

type MatchRow = {
  id: string;
  team1?: string;
  team2?: string;
  home_team?: string;
  away_team?: string;
  team1_color?: string;
  team2_color?: string;
  start_time?: string;
  is_live?: boolean;
  live_status?: string;
  score_team1?: number | string;
  score_team2?: number | string;
  extra_markets?: number | string;
  featured?: boolean;
  tournaments?: TournamentRow | TournamentRow[] | null;
  markets?: MarketRow[] | null;
};

function colorFromName(name: string, fallbackIndex: number): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TEAM_COLORS[(hash || fallbackIndex) % TEAM_COLORS.length];
}

function toSportId(value: string | undefined): SportId {
  const normalized = (value ?? 'football').toLowerCase().replace(/\s+/g, '-') as SportId;
  return SPORT_IDS.includes(normalized) ? normalized : 'football';
}

function sportFromBetsId(sportId?: string): SportId | undefined {
  const id = String(sportId ?? '');
  if (id === '1') return 'football';
  if (id === '13') return 'tennis';
  if (id === '17') return 'hockey';
  if (id === '18') return 'basketball';
  if (id === '91' || id === '151') return 'esports';
  return undefined;
}

function oddValue(row: OddRow): number {
  return Number(row.value ?? row.coefficient ?? row.odd ?? row.price ?? 0);
}

function oddLabel(row: OddRow): string {
  return String(row.outcome ?? row.label ?? row.name ?? '').trim();
}

function mapMainMarkets(odds: OddRow[]): MatchEvent['markets'] {
  const markets = { '1': 0, x: 0, '2': 0 };
  for (const row of odds) {
    const key = oddLabel(row).toUpperCase().replace('Х', 'X');
    const value = oddValue(row);
    if (key === '1' || key === 'П1' || key === 'HOME' || key === 'W1') markets['1'] = value;
    else if (key === 'X' || key === 'DRAW') markets.x = value;
    else if (key === '2' || key === 'П2' || key === 'AWAY' || key === 'W2') markets['2'] = value;
  }
  return markets;
}

function pickTournament(row: MatchRow): TournamentRow {
  const raw = row.tournaments;
  if (Array.isArray(raw)) return raw[0] ?? {};
  return raw ?? {};
}

function marketCategory(name: string): MarketCategory {
  const value = name.toLowerCase();
  if (/1-й тайм|1st.?half/.test(value)) return '1st-half';
  if (/2-й тайм|2nd.?half/.test(value)) return '2nd-half';
  if (/четверт|период|сет/.test(value)) return 'intervals';
  if (/тотал|total/.test(value)) return 'totals';
  if (/фора|handicap|spread/.test(value)) return 'handicaps';
  if (/угл|corner/.test(value)) return 'corners';
  return 'main';
}

function toMarketGroups(markets: MarketRow[]): MarketGroup[] {
  const groups = markets.map((market, index) => ({
    id: market.id ?? `m-${index}`,
    name: market.name || market.type || '1X2',
    category: marketCategory(market.name || market.type || ''),
    outcomes: (market.odds ?? []).map((odd) => ({
      label: oddLabel(odd) || '—',
      odds: oddValue(odd),
    })),
  }));
  return orderPriorityMarkets(groups);
}

export function sortCatalog(matches: MatchEvent[]): MatchEvent[] {
  return [...matches].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    const pa = tournamentPriority(a.league, a.sport);
    const pb = tournamentPriority(b.league, b.sport);
    if (pa !== pb) return pb - pa;
    return a.startTime - b.startTime;
  });
}

function extraMarketCount(markets: MarketRow[], allOdds: OddRow[]): number {
  return Math.max(0, markets.length > 1 ? markets.length - 1 : allOdds.length - 3);
}

export function matchEventFromNormalized(match: NormalizedMatch): MatchEvent {
  const extra = match.extraMarkets ?? [];
  const marketGroups = groupsFromLiveOdds(match.odds, extra, match.sport);
  return {
    id: match.externalId,
    sport: toSportId(match.sport),
    league: match.league,
    leagueId: match.leagueId,
    country: match.country || '',
    team1: match.homeTeam,
    team2: match.awayTeam,
    team1Color: colorFromName(match.homeTeam, 0),
    team2Color: colorFromName(match.awayTeam, 1),
    startTime: match.startTime ? new Date(match.startTime).getTime() : Date.now(),
    isLive: match.status === 'live',
    liveStatus: match.liveStatus || (match.status === 'live' ? 'LIVE' : undefined),
    liveScore: { team1: match.homeScore, team2: match.awayScore },
    markets: { '1': match.odds.p1, x: match.odds.x, '2': match.odds.p2 },
    extraMarkets: extra.length,
    featured: Boolean(match.featured),
    marketGroups,
  };
}

export function matchEventFromLiveSnapshot(
  matchId: string,
  live: LiveEventSnapshot,
  fallback?: MatchEvent,
): MatchEvent {
  const sport = toSportId(live.sport || fallback?.sport);
  const groups = groupsFromLiveOdds(live.odds, live.extraMarkets, sport);
  return {
    id: matchId,
    sport,
    league: live.league || fallback?.league || '',
    country: fallback?.country || '',
    team1: live.homeTeam || fallback?.team1 || '',
    team2: live.awayTeam || fallback?.team2 || '',
    team1Color: fallback?.team1Color || colorFromName(live.homeTeam || fallback?.team1 || '', 0),
    team2Color: fallback?.team2Color || colorFromName(live.awayTeam || fallback?.team2 || '', 1),
    startTime: fallback?.startTime ?? Date.now(),
    isLive: live.isLive,
    liveStatus: [live.period, live.clock].filter(Boolean).join(' ') || live.liveStatus || fallback?.liveStatus,
    liveScore: { team1: live.homeScore, team2: live.awayScore },
    extraMarkets: live.extraMarkets.length,
    featured: fallback?.featured,
    markets: { '1': live.odds.p1, x: live.odds.x, '2': live.odds.p2 },
    marketGroups: groups.length ? groups : fallback?.marketGroups,
  };
}

export function matchEventFromStore(state: EventState): MatchEvent {
  const ev = state.event;
  const mapped = mapBetsApiEvent({
    id: ev.id,
    sport_id: ev.sport_id,
    time: ev.start_time,
    time_status: ev.time_status,
    league: ev.league,
    home: ev.home,
    away: ev.away,
    ss: state.score !== '-' ? state.score : ev.ss,
  });
  const parsedGroups = groupsFromParsedMarkets(Object.values(state.markets));
  const marketCount = Object.keys(state.markets).length;
  const minute = liveMinuteLabel(ev, state.matchTime);
  const liveCaption = minute || undefined;
  const base = mapped ? matchEventFromNormalized(mapped) : {
    id: ev.id,
    sport: toSportId('football'),
    league: ev.league?.name ?? '',
    leagueId: ev.league?.id,
    country: ev.league?.cc || '',
    team1: ev.home?.name ?? '',
    team2: ev.away?.name ?? '',
    team1Color: colorFromName(ev.home?.name ?? '', 0),
    team2Color: colorFromName(ev.away?.name ?? '', 1),
    startTime: Number(ev.start_time) ? Number(ev.start_time) * 1000 : Date.now(),
    isLive: ev.time_status === '1',
    liveStatus: liveCaption,
    liveScore: { team1: 0, team2: 0 },
    markets: { '1': 0, x: 0, '2': 0 },
    extraMarkets: marketCount,
    marketGroups: parsedGroups,
  };
  const score = parseSsScore(state.score) ?? parseSsScore(ev.ss);
  const latestOdds = latestMainOdds(state.markets);
  const status = liveCaption && !isUnixClock(liveCaption)
    ? liveCaption
    : base.liveStatus && !isUnixClock(base.liveStatus)
      ? base.liveStatus
      : undefined;
  const rawMarkets = latestOdds ?? base.markets;
  const lsports = isLsportsDisplayEvent(ev);
  const projected = lsports
    ? lsportsCardMarkets(rawMarkets)
    : {
      markets: {
        '1': rawMarkets['1'] > 1 ? rawMarkets['1'] : 2.1,
        x: rawMarkets.x > 1 ? rawMarkets.x : 3.25,
        '2': rawMarkets['2'] > 1 ? rawMarkets['2'] : 2.8,
      },
      marketsLocked: false,
    };
  return {
    ...base,
    sport: sportFromBetsId(ev.sport_id) ?? base.sport,
    leagueId: ev.league?.id || base.leagueId,
    isLive: ev.time_status === '1',
    liveStatus: status,
    liveScore: score ? { team1: score.home, team2: score.away } : base.liveScore,
    markets: projected.markets,
    extraMarkets: lsports
      ? Object.values(state.markets).filter((market) => market.marketId !== '1' && market.key !== '1_1').length
      : Math.max(marketCount, parsedGroups.length),
    marketGroups: parsedGroups.length ? parsedGroups : base.marketGroups,
    marketsEstimated: false,
    marketsLocked: projected.marketsLocked,
    feedTag: lsports ? 'lsports' : undefined,
  };
}

function latestMainOdds(markets: Record<string, ParsedMarket>): MatchEvent['markets'] | null {
  const list = Object.values(markets);
  const main = list.find((market) => market.key === '1_1')
    ?? list.find((market) => isFullTime1x2(market))
    ?? list.find((market) => market.marketId === '1' || /^1x2$|^победитель$/i.test(market.name));
  if (!main?.entries.length) return null;
  const entry = [...main.entries].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? main.entries[0];
  const odds = { '1': 0, x: 0, '2': 0 };
  for (const row of entry.outcomes) {
    const key = row.key.toLowerCase();
    if (key === 'home' || key === '1' || key === 'p1' || key === 'w1') odds['1'] = row.odds;
    else if (key === 'draw' || key === 'x' || key === 'tie') odds.x = row.odds;
    else if (key === 'away' || key === '2' || key === 'p2' || key === 'w2') odds['2'] = row.odds;
  }
  if (!odds['1'] && !odds['2']) return null;
  return odds;
}

function mapMatch(row: MatchRow): MatchEvent {
  const tournament = pickTournament(row);
  const team1 = row.team1 || row.home_team || '';
  const team2 = row.team2 || row.away_team || '';
  const marketRows = row.markets ?? [];
  const allOdds = marketRows.flatMap((market) => market.odds ?? []);
  const mainMarket =
    marketRows.find((market) => {
      const name = (market.name || market.type || '').toLowerCase();
      return name.includes('1x2') || name.includes('исход') || name.includes('winner') || name.includes('победитель');
    }) ?? marketRows[0];

  return {
    id: String(row.id),
    sport: toSportId(tournament.sport),
    league: tournament.name || 'Турнир',
    country: tournament.country || '',
    team1,
    team2,
    team1Color: row.team1_color || colorFromName(team1, 0),
    team2Color: row.team2_color || colorFromName(team2, 1),
    startTime: row.start_time ? new Date(row.start_time).getTime() : Date.now(),
    isLive: Boolean(row.is_live),
    liveStatus: row.live_status || 'LIVE',
    liveScore: {
      team1: Number(row.score_team1 ?? 0),
      team2: Number(row.score_team2 ?? 0),
    },
    markets: mapMainMarkets(mainMarket?.odds ?? allOdds),
    extraMarkets: Number(row.extra_markets ?? extraMarketCount(marketRows, allOdds)),
    featured: Boolean(row.featured),
    marketGroups: toMarketGroups(marketRows),
  };
}

function isFinishedMatch(row: MatchRow): boolean {
  return /заверш|ended|finished|отмен|демо/i.test(row.live_status ?? '');
}

function upcomingSince(): string {
  return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
}

export async function fetchLiveMatches(): Promise<MatchEvent[]> {
  return [];
}

export async function fetchUpcomingMatches(): Promise<MatchEvent[]> {
  return [];
}

export interface MatchLiveSnapshot {
  id: string;
  homeTeam: string;
  awayTeam: string;
  scoreHome: number;
  scoreAway: number;
  isLive: boolean;
  liveStatus: string;
  sport: SportId;
  league: string;
  country: string;
  tournament: string;
}

function snapshotFromRow(row: MatchRow & { tournament_id?: string }): MatchLiveSnapshot {
  const tournament = pickTournament(row);
  const sport = toSportId(tournament.sport);
  const league = tournament.name || '';
  const country = tournament.country || '';
  const homeTeam = row.team1 || row.home_team || '';
  const awayTeam = row.team2 || row.away_team || '';
  return {
    id: String(row.id),
    homeTeam,
    awayTeam,
    scoreHome: Number(row.score_team1 ?? 0),
    scoreAway: Number(row.score_team2 ?? 0),
    isLive: Boolean(row.is_live),
    liveStatus: row.live_status || (row.is_live ? 'LIVE' : ''),
    sport,
    league,
    country,
    tournament: tournamentLine({ sport, country, league }),
  };
}

export function snapshotFromMatch(match: MatchEvent): MatchLiveSnapshot {
  return {
    id: match.id,
    homeTeam: match.team1,
    awayTeam: match.team2,
    scoreHome: match.liveScore?.team1 ?? 0,
    scoreAway: match.liveScore?.team2 ?? 0,
    isLive: match.isLive,
    liveStatus: match.liveStatus || (match.isLive ? 'LIVE' : ''),
    sport: match.sport,
    league: match.league,
    country: match.country,
    tournament: tournamentLine({
      sport: match.sport,
      country: match.country,
      league: match.league,
    }),
  };
}

export async function fetchMatchSnapshots(ids: string[]): Promise<MatchLiveSnapshot[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { getEndedCatalog, getLiveCatalog } = await import('../services/sportsWorker');
  const { live, upcoming } = getLiveCatalog();
  const byId = new Map(
    [...live, ...upcoming, ...getEndedCatalog()].map((match) => [match.externalId, match]),
  );
  return unique.flatMap((id) => {
    const match = byId.get(id);
    return match ? [snapshotFromMatch(matchEventFromNormalized(match))] : [];
  });
}
