import type { LsportsInPlayStore } from '../state/store.js';
import { adaptLsportsStore } from './adapt.js';
import type {
  AdaptedBetsEvent,
  AdaptedMarket,
  LsportsAdaptResult,
  LsportsAdapterDiagnostics,
} from './types.js';

/**
 * Existing sportsStore operations used by the shadow display feed.
 * applyInplay replaces the live set — never pass a Type 3-only subset.
 */
export interface LsportsSportsSink {
  applyInplay(events: AdaptedBetsEvent[], marketsById: Record<string, AdaptedMarket[]>): void;
  setOdds?(eventId: string, markets: AdaptedMarket[]): void;
  setScore?(eventId: string, score: string, time?: string): void;
  upsertEvent?(event: AdaptedBetsEvent): void;
}

export function toApplyInplayArgs(result: LsportsAdaptResult): {
  events: AdaptedBetsEvent[];
  marketsById: Record<string, AdaptedMarket[]>;
} {
  const events = result.matches.map((row) => row.event);
  const marketsById: Record<string, AdaptedMarket[]> = {};
  for (const row of result.matches) {
    if (row.markets.length) marketsById[row.event.id] = row.markets;
  }
  return { events, marketsById };
}

/**
 * v1 publication strategy: always derive the full active football set from
 * LsportsInPlayStore and call applyInplay once.
 *
 * Tradeoff: Type 2 / Type 3 / Type 35 are applied to the LSports store first,
 * then the complete adapted set is republished. This is safer than feeding a
 * Type 3 delta into setLiveEvents (which would drop unrelated live fixtures).
 * setOdds / setScore remain available for a later incremental publisher.
 *
 * Type 35 never settles Nextpari bets or touches wallet state.
 */
export function publishLsportsSnapshot(
  store: LsportsInPlayStore,
  sink: LsportsSportsSink,
): LsportsAdapterDiagnostics {
  const result = adaptLsportsStore(store);
  const { events, marketsById } = toApplyInplayArgs(result);
  sink.applyInplay(events, marketsById);
  return result.diagnostics;
}
