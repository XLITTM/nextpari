import type { LsportsInPlayStore } from '../state/store.js';
import type { LsportsFixtureState } from '../state/types.js';
import { adaptLsportsPrematchEvent, isLsportsFootball, readSportId } from './event.js';
import { emptyMarket1AdapterDiagnostics } from './markets.js';
import { adaptPrematchFootballMarkets } from './prematchMarkets.js';
import type {
  LsportsAdaptResult,
  LsportsAdapterDiagnostics,
  LsportsSkipReason,
} from './types.js';

function emptyDiagnostics(fixtureCount: number): LsportsAdapterDiagnostics {
  return {
    fixtureCount,
    adaptedLiveFootballCount: 0,
    skippedFixtureCount: 0,
    skippedReasons: {},
    skipped: [],
    adaptedMarketCount: 0,
    unsupportedMarkets: [],
    suspendedMarketCount: 0,
    suspendedOutcomeCount: 0,
    fixturesMissing1x2: [],
    market1Adapter: emptyMarket1AdapterDiagnostics(),
  };
}

function noteSkip(
  diagnostics: LsportsAdapterDiagnostics,
  fixtureId: number,
  reason: LsportsSkipReason,
): void {
  diagnostics.skipped.push({ fixtureId, reason });
  diagnostics.skippedReasons[reason] = (diagnostics.skippedReasons[reason] ?? 0) + 1;
  diagnostics.skippedFixtureCount += 1;
}

function isLineCandidate(state: LsportsFixtureState): boolean {
  return state.fixture != null;
}

/**
 * Full canonical PreMatch display set.
 * KeepAlive / Type 31 is never treated as a complete fixture list: a delta
 * that omits unrelated upcoming fixtures must not hide them.
 */
export function adaptLsportsPrematchStore(store: LsportsInPlayStore): LsportsAdaptResult & {
  open1x2WithPricesCount: number;
} {
  const fixtures = store.listFixtures();
  const diagnostics = emptyDiagnostics(store.metrics().fixtureCount);
  const unsupportedCounts = new Map<string, { marketId: string; name: string; count: number }>();
  const matches: LsportsAdaptResult['matches'] = [];
  let open1x2WithPricesCount = 0;

  for (const state of fixtures) {
    if (!isLineCandidate(state)) continue;

    const sportId = readSportId(state.fixture);
    if (sportId == null) {
      noteSkip(diagnostics, state.fixtureId, 'missing_sport');
      continue;
    }
    if (!isLsportsFootball(state.fixture)) {
      noteSkip(diagnostics, state.fixtureId, 'not_football');
      continue;
    }

    const event = adaptLsportsPrematchEvent(state);
    if (!event) {
      noteSkip(diagnostics, state.fixtureId, 'missing_participants');
      continue;
    }

    const mapped = adaptPrematchFootballMarkets(
      state.fixtureId,
      state.markets.values(),
      diagnostics.market1Adapter,
    );
    diagnostics.adaptedMarketCount += mapped.markets.length;
    diagnostics.suspendedMarketCount += mapped.suspendedMarkets;
    diagnostics.suspendedOutcomeCount += mapped.suspendedOutcomes;
    if (mapped.missing1x2) diagnostics.fixturesMissing1x2.push(event.id);
    if (mapped.open1x2WithPrices) open1x2WithPricesCount += 1;
    for (const item of mapped.unsupported) {
      const key = `${item.marketId}|${item.name}`;
      const current = unsupportedCounts.get(key) ?? { ...item, count: 0 };
      current.count += 1;
      unsupportedCounts.set(key, current);
    }
    matches.push({ event, markets: mapped.markets });
  }

  diagnostics.adaptedLiveFootballCount = matches.length;
  diagnostics.unsupportedMarkets = [...unsupportedCounts.values()].sort((a, b) => b.count - a.count);
  return { matches, diagnostics, open1x2WithPricesCount };
}
