import type { LsportsInPlayStore } from '../state/store.js';
import type { LsportsFixtureState } from '../state/types.js';
import { adaptLsportsEvent, isLsportsFootball, readSportId } from './event.js';
import { adaptFootballMarkets } from './markets.js';
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

function activeFixtureIds(store: LsportsInPlayStore): Set<number> | null {
  const keepAlive = store.getKeepAliveActiveEvents();
  if (keepAlive.length) return new Set(keepAlive);
  return null;
}

function isDisplayCandidate(state: LsportsFixtureState): boolean {
  return state.active || state.livescore != null || state.markets.size > 0;
}

export function adaptLsportsStore(store: LsportsInPlayStore): LsportsAdaptResult {
  const fixtures = store.listFixtures();
  const diagnostics = emptyDiagnostics(store.metrics().fixtureCount);
  const keepAlive = activeFixtureIds(store);
  const unsupportedCounts = new Map<string, { marketId: string; name: string; count: number }>();
  const matches: LsportsAdaptResult['matches'] = [];

  if (keepAlive) {
    for (const fixtureId of keepAlive) {
      if (!store.getFixture(fixtureId)) noteSkip(diagnostics, fixtureId, 'not_in_store');
    }
  }

  for (const state of fixtures) {
    if (keepAlive) {
      if (!keepAlive.has(state.fixtureId)) {
        noteSkip(diagnostics, state.fixtureId, 'absent_from_keepalive');
        continue;
      }
    } else if (!isDisplayCandidate(state)) {
      continue;
    }

    const sportId = readSportId(state.fixture);
    if (sportId == null) {
      noteSkip(diagnostics, state.fixtureId, 'missing_sport');
      continue;
    }
    if (!isLsportsFootball(state.fixture)) {
      noteSkip(diagnostics, state.fixtureId, 'not_football');
      continue;
    }

    const event = adaptLsportsEvent(state);
    if (!event) {
      noteSkip(diagnostics, state.fixtureId, 'missing_participants');
      continue;
    }

    const mapped = adaptFootballMarkets(state.fixtureId, state.markets.values());
    diagnostics.adaptedMarketCount += mapped.markets.length;
    diagnostics.suspendedMarketCount += mapped.suspendedMarkets;
    diagnostics.suspendedOutcomeCount += mapped.suspendedOutcomes;
    if (mapped.missing1x2) diagnostics.fixturesMissing1x2.push(event.id);
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
  return { matches, diagnostics };
}
