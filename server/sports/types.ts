export const SPORTS_PROVIDER_LSPORTS = 'lsports' as const;

/** Opaque provider id. Adapter-specific values stay valid (e.g. 'lsports'). */
export type SportsProvider = string;
export type SportsFeedType = 'inplay' | 'prematch';
export type SportsBetMode = 'single' | 'express';
export type SportsFeedHealth = 'HEALTHY' | 'STALE' | 'UNKNOWN';

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
  selectable: boolean;
  updatedAt: string | null;
  health: SportsFeedHealth;
  heartbeatAgeMs: number | null;
  /** Provider diagnostics. Generic decision must not require these. */
  marketStatus?: string;
  betStatus?: string;
  betStatusId?: string;
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

export interface SportsQuoteDecisionOptions {
  bettingEnabled: boolean;
  now?: number;
  /** Generic freshness cap. Omit to trust quote.health from the adapter. */
  maxHeartbeatAgeMs?: number;
}

export type SportsQuoteDecision =
  | { ok: true; quote: SportsQuote }
  | {
    ok: false;
    reason: SportsQuoteRejectReason;
    quote?: SportsQuote;
    currentPrice?: number | null;
  };

export interface SportsQuoteProvider {
  readonly id: SportsProvider;
  getQuote(request: SportsQuoteRequest): Promise<SportsQuote>;
}
