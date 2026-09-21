import { isUnixClock, liveMinuteLabel, mapBetsApiEvent, parseSsScore, tournamentPriority, type LiveEventSnapshot, type NormalizedMatch } from './betsapi';
import { groupsFromLiveOdds } from './marketOrder';
import { groupsFromParsedMarkets, type ParsedMarket } from './odds-parser';
import { isFullTime1x2 } from './matchOdds';
import { isLsportsDisplayEvent, lsportsCardMarkets } from './lsportsFeed';
import type { EventState } from '../stores/sportsStore';
import type { MatchEvent, SportId } from '../types';

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

export function sortCatalog(matches: MatchEvent[]): MatchEvent[] {
  return [...matches].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    const pa = tournamentPriority(a.league, a.sport);
    const pb = tournamentPriority(b.league, b.sport);
    if (pa !== pb) return pb - pa;
    return a.startTime - b.startTime;
  });
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
  const projected = lsportsCardMarkets(rawMarkets);
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

export async function fetchLiveMatches(): Promise<MatchEvent[]> {
  return [];
}

export async function fetchUpcomingMatches(): Promise<MatchEvent[]> {
  return [];
}
