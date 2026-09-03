export const SPORTS_PROVIDER_LSPORTS = 'lsports' as const;

export type SportsProvider = typeof SPORTS_PROVIDER_LSPORTS | 'betsapi';
export type SportsFeedType = 'inplay' | 'prematch';
export type SportsBetMode = 'single' | 'express';

export type SportsQuoteRejectReason =
  | 'SPORTS_BET_DISABLED'
  | 'FEED_STALE'
  | 'EVENT_UNAVAILABLE'
  | 'MARKET_SUSPENDED'
  | 'ODDS_CHANGED'
  | 'INVALID_PRICE'
  | 'MISSING_BET_ID'
  | 'MISSING_FIXTURE'
  | 'INSUFFICIENT_AVAILABLE_BALANCE'
  | 'IDEMPOTENCY_KEY_CONFLICT';

export interface SportsQuote {
  provider: SportsProvider;
  feedType: SportsFeedType;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
  outcomeName: string;
  price: number | null;
  status: 'open' | 'suspended' | 'settled' | 'missing';
  marketStatus: string;
  betStatus: string;
  betStatusId: string;
  selectable: boolean;
  updatedAt: string | null;
  health: 'HEALTHY' | 'STALE' | 'UNKNOWN';
  heartbeatAgeMs: number | null;
}

export interface SportsQuoteRequest {
  provider?: string;
  feedType?: string;
  fixtureId: string;
  marketId?: string;
  marketKey?: string;
  line?: string;
  outcomeId: string;
  price?: number;
}

export type SportsQuoteDecision =
  | { ok: true; quote: SportsQuote }
  | {
    ok: false;
    reason: SportsQuoteRejectReason;
    quote?: SportsQuote;
    currentPrice?: number | null;
  };
