import type { BetsEvent, NormalizedMatch, NormalizedOdds } from './betsapi';
import type { ParsedMarket } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';

export const USE_MOCK = false;

export interface MockSportMatch {
  id: string;
  sportId: string;
  sport: string;
  league: string;
  country: string;
  cc: string;
  home: string;
  away: string;
  live: boolean;
  homeScore: number;
  awayScore: number;
  minute: string;
  elapsed: number;
  odds: NormalizedOdds;
}

export const MOCK_SPORT_MATCHES: MockSportMatch[] = [
  {
    id: 'mock-epl-mci-ars',
    sportId: '1',
    sport: 'football',
    league: 'Премьер-лига',
    country: 'Англия',
    cc: 'gb',
    home: 'Манчестер Сити',
    away: 'Арсенал',
    live: true,
    homeScore: 2,
    awayScore: 1,
    minute: '24:18',
    elapsed: 24,
    odds: { p1: 1.42, x: 4.35, p2: 6.2, tb25: 1.71, tm25: 2.12, totalLine: 2.5, handicapHome: 1.88, handicapAway: 1.94, handicapLine: -1.0 },
  },
  {
    id: 'mock-epl-liv-che',
    sportId: '1',
    sport: 'football',
    league: 'Премьер-лига',
    country: 'Англия',
    cc: 'gb',
    home: 'Ливерпуль',
    away: 'Челси',
    live: true,
    homeScore: 1,
    awayScore: 1,
    minute: '67:05',
    elapsed: 67,
    odds: { p1: 2.15, x: 3.25, p2: 3.4, tb25: 1.83, tm25: 1.97, totalLine: 2.5, handicapHome: 1.9, handicapAway: 1.92, handicapLine: 0 },
  },
  {
    id: 'mock-sa-int-mil',
    sportId: '1',
    sport: 'football',
    league: 'Серия А',
    country: 'Италия',
    cc: 'it',
    home: 'Интер',
    away: 'Милан',
    live: true,
    homeScore: 0,
    awayScore: 0,
    minute: '12:40',
    elapsed: 12,
    odds: { p1: 2.05, x: 3.15, p2: 3.7, tb25: 2.02, tm25: 1.8, totalLine: 2.5, handicapHome: 1.86, handicapAway: 1.96, handicapLine: -0.5 },
  },
  {
    id: 'mock-sa-juv-nap',
    sportId: '1',
    sport: 'football',
    league: 'Серия А',
    country: 'Италия',
    cc: 'it',
    home: 'Ювентус',
    away: 'Наполи',
    live: true,
    homeScore: 2,
    awayScore: 2,
    minute: '81:22',
    elapsed: 81,
    odds: { p1: 2.7, x: 3.05, p2: 2.75, tb25: 1.64, tm25: 2.25, totalLine: 2.5, handicapHome: 1.91, handicapAway: 1.91, handicapLine: 0 },
  },
  {
    id: 'mock-nba-lal-bos',
    sportId: '18',
    sport: 'basketball',
    league: 'NBA',
    country: 'США',
    cc: 'us',
    home: 'Лейкерс',
    away: 'Бостон',
    live: true,
    homeScore: 88,
    awayScore: 91,
    minute: '3-я четверть, 04:12',
    elapsed: 36,
    odds: { p1: 2.18, x: 0, p2: 1.72, tb25: 1.9, tm25: 1.9, totalLine: 224.5, handicapHome: 1.87, handicapAway: 1.95, handicapLine: 2.5 },
  },
  {
    id: 'mock-atp-alc-sin',
    sportId: '13',
    sport: 'tennis',
    league: 'ATP Masters',
    country: 'Испания',
    cc: 'es',
    home: 'Алькарас',
    away: 'Синнер',
    live: true,
    homeScore: 1,
    awayScore: 1,
    minute: '3-й сет, 4:3',
    elapsed: 22,
    odds: { p1: 1.87, x: 0, p2: 1.95, tb25: 1.78, tm25: 2.05, totalLine: 22.5, handicapHome: 1.84, handicapAway: 1.98, handicapLine: -1.5 },
  },
  {
    id: 'mock-cs2-navi-vit',
    sportId: '91',
    sport: 'esports',
    league: 'BLAST Premier · CS2',
    country: 'Киберспорт',
    cc: 'eu',
    home: 'Natus Vincere',
    away: 'Vitality',
    live: true,
    homeScore: 1,
    awayScore: 0,
    minute: 'Карта 2, 12:8',
    elapsed: 28,
    odds: { p1: 1.62, x: 0, p2: 2.28, tb25: 1.88, tm25: 1.92, totalLine: 2.5, handicapHome: 1.85, handicapAway: 1.95, handicapLine: -1.5 },
  },
  {
    id: 'mock-dota-ts-gg',
    sportId: '91',
    sport: 'esports',
    league: 'ESL One · Dota 2',
    country: 'Киберспорт',
    cc: 'eu',
    home: 'Team Spirit',
    away: 'Gaimin Gladiators',
    live: true,
    homeScore: 1,
    awayScore: 1,
    minute: 'Карта 3, 32:14',
    elapsed: 40,
    odds: { p1: 1.74, x: 0, p2: 2.1, tb25: 1.81, tm25: 2.0, totalLine: 2.5, handicapHome: 1.89, handicapAway: 1.93, handicapLine: -1.5 },
  },
  {
    id: 'mock-epl-tot-mun',
    sportId: '1',
    sport: 'football',
    league: 'Премьер-лига',
    country: 'Англия',
    cc: 'gb',
    home: 'Тоттенхэм',
    away: 'Манчестер Юнайтед',
    live: false,
    homeScore: 0,
    awayScore: 0,
    minute: '21:45',
    elapsed: 0,
    odds: { p1: 2.35, x: 3.4, p2: 2.9, tb25: 1.76, tm25: 2.08, totalLine: 2.5, handicapHome: 1.9, handicapAway: 1.92, handicapLine: 0 },
  },
];

const TWO_WAY = new Set(['basketball', 'tennis', 'esports']);

function outcome(key: string, odds: number) {
  return { key, odds, raw: odds.toFixed(2) };
}

export function mockMarketsFor(match: MockSportMatch): ParsedMarket[] {
  const twoWay = TWO_WAY.has(match.sport);
  const mainOutcomes = twoWay
    ? [outcome('home', match.odds.p1), outcome('away', match.odds.p2)]
    : [outcome('home', match.odds.p1), outcome('draw', match.odds.x), outcome('away', match.odds.p2)];
  const totalLine = String(match.odds.totalLine ?? 2.5);
  const hc = match.odds.handicapLine ?? 0;
  return [
    {
      key: `${match.id}_1`,
      bookmaker: 'mock',
      marketId: '1',
      name: twoWay ? 'Победитель' : '1X2',
      category: 'main',
      entries: [{ id: 'main', outcomes: mainOutcomes, updatedAt: Date.now() }],
    },
    {
      key: `${match.id}_3`,
      bookmaker: 'mock',
      marketId: '3',
      name: 'Тотал',
      category: 'main',
      entries: [{
        id: 'tot',
        line: totalLine,
        outcomes: [outcome('over', match.odds.tb25), outcome('under', match.odds.tm25)],
        updatedAt: Date.now(),
      }],
    },
    {
      key: `${match.id}_2`,
      bookmaker: 'mock',
      marketId: '2',
      name: 'Фора',
      category: 'main',
      entries: [{
        id: 'hc',
        line: String(hc),
        outcomes: [
          outcome('home', match.odds.handicapHome ?? 1.9),
          outcome('away', match.odds.handicapAway ?? 1.9),
        ],
        updatedAt: Date.now(),
      }],
    },
  ];
}

export function mockToBetsEvent(match: MockSportMatch): BetsEvent {
  const kickedOff = Math.floor(Date.now() / 1000) - match.elapsed * 60;
  return {
    id: match.id,
    sport_id: match.sportId,
    league: { name: match.league, cc: match.cc },
    home: { name: match.home },
    away: { name: match.away },
    ss: `${match.homeScore}-${match.awayScore}`,
    time_status: match.live ? '1' : '0',
    time_str: match.minute,
    clock_running: match.live,
    period: match.sport === 'football' ? (match.elapsed >= 45 ? '2' : '1') : '',
    start_time: String(match.live ? kickedOff : kickedOff + 3 * 3600),
    our_events: match.live ? '1' : '0',
  };
}

export function mockToNormalized(match: MockSportMatch): NormalizedMatch {
  return {
    externalId: match.id,
    sport: match.sport,
    league: match.league,
    country: match.country,
    homeTeam: match.home,
    awayTeam: match.away,
    status: match.live ? 'live' : 'upcoming',
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    liveStatus: match.minute,
    startTime: new Date(Date.now() + (match.live ? -match.elapsed * 60_000 : 3 * 3600_000)).toISOString(),
    odds: { ...match.odds },
    featured: true,
  };
}

export function seedMockSportsStore(): void {
  const store = useSportsStore.getState();
  const live = MOCK_SPORT_MATCHES.filter((row) => row.live).map(mockToBetsEvent);
  const upcoming = MOCK_SPORT_MATCHES.filter((row) => !row.live).map(mockToBetsEvent);
  store.setLiveEvents(live);
  store.setUpcomingEvents(upcoming);
  for (const match of MOCK_SPORT_MATCHES) {
    store.setOdds(match.id, mockMarketsFor(match), Date.now() / 1000);
    store.setScore(match.id, `${match.homeScore}-${match.awayScore}`, match.minute);
  }
}

