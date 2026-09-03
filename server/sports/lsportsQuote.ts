import {
  isLsportsOpenStatus,
  isLsportsSettledStatus,
  isLsportsSuspendedStatus,
  outcomeSelectable,
} from '../lsports/adapter/markets.js';
import { toDecimalPrice } from '../lsports/adapter/read.js';
import { normalizeFixtureId } from '../lsports/state/keys.js';
import { readBetId } from '../lsports/state/parse.js';
import { betById, type LsportsInPlayStore } from '../lsports/state/store.js';
import type { LsportsMarketRecord } from '../lsports/state/types.js';
import type { SportsFeedType, SportsQuote } from './types.js';

function emptyQuote(partial: Partial<SportsQuote> & Pick<SportsQuote, 'fixtureId' | 'feedType' | 'health' | 'heartbeatAgeMs'>): SportsQuote {
  return {
    provider: 'lsports',
    marketId: '',
    marketKey: '',
    line: '',
    outcomeId: '',
    outcomeName: '',
    price: null,
    status: 'missing',
    marketStatus: '',
    betStatus: '',
    betStatusId: '',
    selectable: false,
    updatedAt: null,
    ...partial,
  };
}

function canonicalMarketKeyLookup(value: string | undefined): boolean {
  return Boolean(value && /^\d+:[^:]*:/.test(value));
}

function findMarket(
  store: LsportsInPlayStore,
  fixtureId: number,
  input: { marketId?: string; marketKey?: string; line?: string; outcomeId: string },
): LsportsMarketRecord | undefined {
  const fixture = store.getFixture(fixtureId);
  if (!fixture) return undefined;
  if (input.marketKey && fixture.markets.has(input.marketKey)) {
    return fixture.markets.get(input.marketKey);
  }
  const wantedLine = String(input.line ?? '').trim();
  for (const market of fixture.markets.values()) {
    if (input.marketId && String(market.marketId ?? '') !== String(input.marketId)) continue;
    if (wantedLine && String(market.line ?? '') !== wantedLine) continue;
    if (betById(market, input.outcomeId)) return market;
  }
  for (const market of fixture.markets.values()) {
    if (wantedLine && String(market.line ?? '') !== wantedLine) continue;
    if (betById(market, input.outcomeId)) return market;
  }
  return undefined;
}

export function lookupCanonicalQuote(
  store: LsportsInPlayStore,
  input: {
    fixtureId: string;
    marketId?: string;
    marketKey?: string;
    line?: string;
    outcomeId: string;
    feedType?: SportsFeedType;
  },
  now = Date.now(),
): SportsQuote {
  const feedType: SportsFeedType = input.feedType === 'prematch' ? 'prematch' : 'inplay';
  const health = store.feedHealth(now);
  const heartbeatAgeMs = store.heartbeatAgeMs(now);
  const fixtureId = String(normalizeFixtureId(input.fixtureId) ?? '').trim();
  const outcomeId = String(input.outcomeId ?? '').trim();
  const base = {
    fixtureId: fixtureId || String(input.fixtureId ?? ''),
    feedType,
    health,
    heartbeatAgeMs,
    outcomeId,
  };

  const numericId = normalizeFixtureId(input.fixtureId);
  if (numericId == null) return emptyQuote(base);
  const fixture = store.getFixture(numericId);
  if (!fixture) return emptyQuote({ ...base, fixtureId: String(numericId) });
  if (!outcomeId) return emptyQuote({ ...base, fixtureId: String(numericId), status: 'missing' });

  const market = findMarket(store, numericId, {
    marketId: input.marketId,
    marketKey: canonicalMarketKeyLookup(input.marketKey) ? input.marketKey : undefined,
    line: input.line,
    outcomeId,
  });
  if (!market) return emptyQuote({ ...base, fixtureId: String(numericId) });
  const bet = betById(market, outcomeId);
  if (!bet) return emptyQuote({ ...base, fixtureId: String(numericId), marketId: String(market.marketId ?? '') });

  const marketSuspended = isLsportsSuspendedStatus(market.payload.Status);
  const marketSettled = isLsportsSettledStatus(market.payload.Status);
  const selectable = !marketSuspended
    && !marketSettled
    && (market.payload.Status == null || isLsportsOpenStatus(market.payload.Status))
    && outcomeSelectable(bet);
  const price = toDecimalPrice(bet.Price ?? bet.price);
  const lastUpdate = typeof bet.LastUpdate === 'string' ? bet.LastUpdate : market.lastUpdate;

  return {
    provider: 'lsports',
    feedType,
    fixtureId: String(numericId),
    marketId: String(market.marketId ?? ''),
    marketKey: market.key,
    line: market.line,
    outcomeId: String(readBetId(bet) ?? outcomeId),
    outcomeName: String(bet.Name ?? bet.name ?? ''),
    price,
    status: selectable ? 'open' : marketSettled ? 'settled' : 'suspended',
    marketStatus: String(market.payload.Status ?? ''),
    betStatus: String(bet.Status ?? ''),
    betStatusId: String(bet.BetStatusId ?? ''),
    selectable,
    updatedAt: lastUpdate,
    health,
    heartbeatAgeMs,
  };
}

export function lookupCanonicalQuoteRecord(
  store: LsportsInPlayStore,
  query: Record<string, string>,
): SportsQuote {
  return lookupCanonicalQuote(store, {
    fixtureId: query.fixtureId ?? query.fixture_id ?? '',
    marketId: query.marketId ?? query.market_id,
    marketKey: query.marketKey ?? query.market_key,
    line: query.line,
    outcomeId: query.outcomeId ?? query.betId ?? query.bet_id ?? '',
    feedType: query.feedType === 'prematch' ? 'prematch' : 'inplay',
  });
}
