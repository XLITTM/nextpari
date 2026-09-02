import { readBetId, readBets } from './parse.js';
import type { LsportsInPlayStore } from './store.js';
import type { LsportsIngestCounters, LsportsMarketInventory } from './types.js';

const TOP_MARKET_IDS = 20;
const SAMPLE_FIXTURES = 5;

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function isOpenStatus(value: unknown): boolean {
  return value === 1 || value === '1';
}

function toPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(numeric) && numeric > 1) return numeric;
  }
  return null;
}

export function emptyIngestCounters(): LsportsIngestCounters {
  return {
    type3Messages: 0,
    type35Messages: 0,
    snapshotMarketEvents: 0,
    marketsAppliedFromType3: 0,
    marketsAppliedFromSnapshot: 0,
    market1AppliedFromType3: 0,
    market1AppliedFromSnapshot: 0,
  };
}

/** Sanitized store inventory for /health and /inplay. No payloads, credentials, or full dumps. */
export function buildMarketInventory(
  store: LsportsInPlayStore,
  ingest: LsportsIngestCounters,
): LsportsMarketInventory {
  let fixturesWithMarkets = 0;
  let storeMarketCount = 0;
  const byId = new Map<string, number>();
  const market1 = {
    count: 0,
    openMarketCount: 0,
    marketStatus: {} as Record<string, number>,
    betStatus: {} as Record<string, number>,
    betStatusId: {} as Record<string, number>,
    betNames: {} as Record<string, number>,
    validPriceCount: 0,
    sampleFixtureIds: [] as number[],
  };

  for (const fixture of store.listFixtures()) {
    if (!fixture.markets.size) continue;
    fixturesWithMarkets += 1;
    storeMarketCount += fixture.markets.size;
    for (const market of fixture.markets.values()) {
      const marketId = String(market.marketId ?? '');
      byId.set(marketId, (byId.get(marketId) ?? 0) + 1);
      if (marketId !== '1') continue;
      market1.count += 1;
      if (market1.sampleFixtureIds.length < SAMPLE_FIXTURES) {
        market1.sampleFixtureIds.push(fixture.fixtureId);
      }
      const status = market.payload.Status ?? market.payload.status;
      bump(market1.marketStatus, status == null ? 'null' : String(status));
      if (isOpenStatus(status)) market1.openMarketCount += 1;
      for (const bet of readBets(market.payload)) {
        bump(market1.betNames, String(bet.Name ?? bet.name ?? '').trim() || 'empty');
        bump(market1.betStatus, bet.Status == null ? 'null' : String(bet.Status));
        bump(market1.betStatusId, bet.BetStatusId == null ? 'null' : String(bet.BetStatusId));
        if (toPrice(bet.Price ?? bet.price) != null) market1.validPriceCount += 1;
        void readBetId(bet);
      }
    }
  }

  const byMarketId = [...byId.entries()]
    .map(([marketId, count]) => ({ marketId, count }))
    .sort((a, b) => b.count - a.count || a.marketId.localeCompare(b.marketId))
    .slice(0, TOP_MARKET_IDS);

  return {
    fixturesWithMarkets,
    storeMarketCount,
    byMarketId,
    market1,
    ingest: { ...ingest },
  };
}
