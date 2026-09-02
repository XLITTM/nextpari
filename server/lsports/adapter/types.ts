export const LSPORTS_FOOTBALL_SPORT_ID = 6046;
export const NEXTPARI_FOOTBALL_SPORT_ID = '1';
export const LSPORTS_DISPLAY_TAG = 'lsports';
export const NEXTPARI_1X2_MARKET_KEY = '1_1';

/** Structurally compatible with src/lib/betsapi BetsEvent. */
export interface AdaptedBetsEvent {
  id: string;
  sport_id?: string;
  league: { id?: string; name: string; cc?: string };
  home: { name: string; id?: string };
  away: { name: string; id?: string };
  ss?: string;
  time?: string;
  time_str?: string;
  time_status: string;
  clock_running?: boolean;
  period?: '1' | '2' | 'HT' | '';
  our_events?: string;
  start_time: string;
}

/** Structurally compatible with src/lib/odds-parser Parsed* types. */
export interface AdaptedOutcome {
  key: string;
  odds: number;
  raw: string;
  providerBetId?: string;
}

export interface AdaptedMarketEntry {
  id: string;
  outcomes: AdaptedOutcome[];
  line?: string;
  ss?: string;
  time?: string;
  updatedAt: number;
}

export interface AdaptedMarket {
  key: string;
  bookmaker: string;
  marketId: string;
  name: string;
  category: 'main' | 'half' | 'corners' | 'quarter' | 'specials';
  entries: AdaptedMarketEntry[];
}

export type LsportsSkipReason =
  | 'not_football'
  | 'missing_sport'
  | 'missing_participants'
  | 'absent_from_keepalive'
  | 'not_in_store';

export interface LsportsAdaptedMatch {
  event: AdaptedBetsEvent;
  markets: AdaptedMarket[];
}

export interface LsportsSkipRecord {
  fixtureId: number;
  reason: LsportsSkipReason;
}

export interface LsportsMarket1AdapterDiagnostics {
  seen: number;
  adapted: number;
  rejectedSettledMarket: number;
  rejectedSuspendedMarket: number;
  rejectedNoOutcomes: number;
  settlementBlockedBets: number;
  badPriceBets: number;
  badNameBets: number;
  openSelectableOutcomes: number;
}

export interface LsportsAdapterDiagnostics {
  fixtureCount: number;
  adaptedLiveFootballCount: number;
  skippedFixtureCount: number;
  skippedReasons: Partial<Record<LsportsSkipReason, number>>;
  skipped: LsportsSkipRecord[];
  adaptedMarketCount: number;
  unsupportedMarkets: Array<{ marketId: string; name: string; count: number }>;
  suspendedMarketCount: number;
  suspendedOutcomeCount: number;
  fixturesMissing1x2: string[];
  market1Adapter: LsportsMarket1AdapterDiagnostics;
}

export interface LsportsAdaptResult {
  matches: LsportsAdaptedMatch[];
  diagnostics: LsportsAdapterDiagnostics;
}
