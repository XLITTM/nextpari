export const FOOTBALL_SPORT_ID = '1' as const;

export type FeedEndpoint = 'inplay' | 'upcoming' | 'ended' | 'event';

export type EventStatus = 'live' | 'prematch' | 'finished' | 'closed';

export type MarketKey = '1x2' | 'over_under' | 'asian_handicap';

export type MarketStatus = 'open' | 'closed';
export type MarketAvailability = 'open' | 'suspended' | 'unavailable';

export type OutcomeKey = 'home' | 'draw' | 'away' | 'over' | 'under';

export interface NormalizedOutcome {
  key: OutcomeKey;
  name: string;
  price: number;
  sourceSelectionId?: string | null;
}

export interface NormalizedMarket {
  key: MarketKey;
  name: string;
  line: string | null;
  status: MarketStatus;
  outcomes: NormalizedOutcome[];
  updatedAt: string | null;
  bookmakerId?: string | null;
  externalPeriodId?: string | null;
  externalMarketId?: string;
  availability?: MarketAvailability;
}

export interface LiveClock {
  minute: number;
  second: number;
  running: boolean;
  observedAt: string;
  stale: boolean;
}

export interface NormalizedEvent {
  eventId: string;
  sportId: typeof FOOTBALL_SPORT_ID;
  sport: 'football';
  league: { id: string | null; name: string | null; countryCode: string | null };
  home: { id: string | null; name: string };
  away: { id: string | null; name: string };
  kickoff: string | null;
  status: EventStatus;
  timeStatus: string;
  score: { home: number; away: number } | null;
  liveClock?: LiveClock | null;
  marketsKnown: boolean;
  markets: NormalizedMarket[];
  updatedAt: string | null;
}

export interface RateLimitSnapshot {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export interface NormalizedFeed {
  source: 'betsapi';
  mode: 'read-only';
  betting: 'disabled';
  settlement: 'disabled';
  endpoint: FeedEndpoint;
  sportId: typeof FOOTBALL_SPORT_ID;
  fetchedAt: string;
  updatedAt: string;
  stale: boolean;
  rateLimited: boolean;
  rateLimit: RateLimitSnapshot | null;
  events: NormalizedEvent[];
}

export type FeedErrorCode = 'TOKEN_MISSING' | 'RATE_LIMITED' | 'TIMEOUT' | 'UPSTREAM' | 'STALE';

export interface FeedResult {
  ok: boolean;
  error: FeedErrorCode | null;
  upstreamStatus: number | null;
  feed: NormalizedFeed | null;
}
