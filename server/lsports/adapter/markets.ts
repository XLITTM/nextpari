import { readBetId, readBets } from '../state/parse.js';
import type { LsportsMarketRecord } from '../state/types.js';
import { asRecord, readId, readName, toDecimalPrice } from './read.js';
import {
  NEXTPARI_1X2_MARKET_KEY,
  type AdaptedMarket,
  type AdaptedMarketEntry,
  type AdaptedOutcome,
} from './types.js';

export const LSPORTS_1X2_BET_NAME: Record<string, 'home' | 'draw' | 'away'> = {
  '1': 'home',
  X: 'draw',
  x: 'draw',
  '2': 'away',
};

/** Confirmed InPlay statuses from live capture / tests: 1 open, 2 suspended, 3 settled. */
export function isLsportsOpenStatus(value: unknown): boolean {
  return value === 1 || value === '1';
}

export function isLsportsSuspendedStatus(value: unknown): boolean {
  return value === 2 || value === '2';
}

export function isLsportsSettledStatus(value: unknown): boolean {
  return value === 3 || value === '3';
}

export function isSupportedFootballMarket(market: LsportsMarketRecord): boolean {
  const payload = market.payload;
  const id = String(market.marketId ?? readId(payload.Id ?? payload.id) ?? '');
  const name = String(readName(payload.Name ?? payload.name) ?? '').toLowerCase();
  return id === '1' || name === '1x2';
}

export function unsupportedMarketKey(market: LsportsMarketRecord): { marketId: string; name: string } {
  const payload = market.payload;
  return {
    marketId: String(market.marketId ?? readId(payload.Id ?? payload.id) ?? ''),
    name: readName(payload.Name ?? payload.name) ?? '',
  };
}

function outcomeSelectable(bet: Record<string, unknown>): boolean {
  if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) return false;
  if (isLsportsSettledStatus(bet.Status) || isLsportsSettledStatus(bet.BetStatusId)) return false;
  const settlement = bet.Settlement;
  if (settlement === 1 || settlement === 2 || settlement === 3 || settlement === 4 || settlement === 5) {
    return false;
  }
  if (!isLsportsOpenStatus(bet.Status ?? 1) && bet.Status != null) return false;
  return true;
}

function map1x2Outcome(bet: Record<string, unknown>): AdaptedOutcome | null {
  const name = String(bet.Name ?? bet.name ?? '').trim();
  const key = LSPORTS_1X2_BET_NAME[name];
  if (!key) return null;
  const betId = readBetId(bet);
  if (betId == null) return null;
  if (!outcomeSelectable(bet)) return null;
  const odds = toDecimalPrice(bet.Price ?? bet.price);
  if (odds == null) return null;
  return {
    key,
    odds,
    raw: String(bet.Price ?? bet.price),
    providerBetId: String(betId),
  };
}

export function adaptFootballMarkets(
  fixtureId: number,
  markets: Iterable<LsportsMarketRecord>,
): {
  markets: AdaptedMarket[];
  unsupported: Array<{ marketId: string; name: string }>;
  suspendedMarkets: number;
  suspendedOutcomes: number;
  missing1x2: boolean;
} {
  const adapted: AdaptedMarket[] = [];
  const unsupported: Array<{ marketId: string; name: string }> = [];
  let suspendedMarkets = 0;
  let suspendedOutcomes = 0;
  let saw1x2 = false;

  for (const market of markets) {
    if (!isSupportedFootballMarket(market)) {
      unsupported.push(unsupportedMarketKey(market));
      continue;
    }
    saw1x2 = true;
    const payload = market.payload;
    const marketSuspended = isLsportsSuspendedStatus(payload.Status);
    if (marketSuspended || isLsportsSettledStatus(payload.Status)) {
      suspendedMarkets += 1;
      for (const bet of readBets(payload)) {
        if (!outcomeSelectable(bet) || marketSuspended) suspendedOutcomes += 1;
      }
      continue;
    }
    const outcomes: AdaptedOutcome[] = [];
    for (const bet of readBets(payload)) {
      if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) {
        suspendedOutcomes += 1;
      }
      const mapped = map1x2Outcome(bet);
      if (mapped) outcomes.push(mapped);
    }
    if (!outcomes.length) continue;
    const entry: AdaptedMarketEntry = {
      id: `lsports-${fixtureId}-1-main`,
      outcomes,
      updatedAt: Date.now(),
    };
    if (outcomes.length < 3) entry.ss = 'suspended';
    adapted.push({
      key: NEXTPARI_1X2_MARKET_KEY,
      bookmaker: '1',
      marketId: '1',
      name: '1X2',
      category: 'main',
      entries: [entry],
    });
  }

  return {
    markets: adapted,
    unsupported,
    suspendedMarkets,
    suspendedOutcomes,
    missing1x2: !saw1x2 || !adapted.some((market) => market.key === NEXTPARI_1X2_MARKET_KEY),
  };
}

export function readMarketName(market: unknown): string {
  const payload = asRecord(market) ?? {};
  return readName(payload.Name ?? payload.name) ?? '';
}
