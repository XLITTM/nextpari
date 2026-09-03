import { readBetId, readBets } from '../state/parse.js';
import type { LsportsMarketRecord } from '../state/types.js';
import {
  emptyMarket1AdapterDiagnostics,
  isLsportsOpenStatus,
  isLsportsSettledStatus,
  isLsportsSuspendedStatus,
  LSPORTS_1X2_BET_NAME,
} from './markets.js';
import { asRecord, readId, readName, toDecimalPrice } from './read.js';
import {
  NEXTPARI_1X2_MARKET_KEY,
  NEXTPARI_HANDICAP_MARKET_KEY,
  NEXTPARI_TOTALS_MARKET_KEY,
  type AdaptedMarket,
  type AdaptedMarketEntry,
  type AdaptedOutcome,
  type LsportsMarket1AdapterDiagnostics,
} from './types.js';

/**
 * Market classification for Package 4352.
 * 1X2: LSports Market.Id 1 / Name 1X2 (same as InPlay).
 * Under/Over: InPlay inventory confirmed Id 2 Name "Under/Over"; PreMatch uses the
 * same Id/name match and does not guess other totals IDs.
 * Asian Handicap: InPlay inventory confirmed Id 1439 Name "Asian Handicap - Full Time".
 */
export const LSPORTS_PREMATCH_1X2_MARKET_ID = '1';
export const LSPORTS_PREMATCH_UNDER_OVER_MARKET_ID = '2';
export const LSPORTS_PREMATCH_ASIAN_HANDICAP_MARKET_ID = '1439';

export type PrematchMarketKind = '1x2' | 'totals' | 'handicap' | 'unsupported';

function settlementBlocksBet(bet: Record<string, unknown>): boolean {
  const settlement = bet.Settlement;
  return settlement === 1 || settlement === 2 || settlement === 3 || settlement === 4 || settlement === 5;
}

function outcomeSelectable(bet: Record<string, unknown>): boolean {
  if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) return false;
  if (isLsportsSettledStatus(bet.Status) || isLsportsSettledStatus(bet.BetStatusId)) return false;
  if (settlementBlocksBet(bet)) return false;
  if (!isLsportsOpenStatus(bet.Status ?? 1) && bet.Status != null) return false;
  return true;
}

export function classifyPrematchFootballMarket(market: LsportsMarketRecord): PrematchMarketKind {
  const payload = market.payload;
  const id = String(market.marketId ?? readId(payload.Id ?? payload.id) ?? '');
  const name = String(readName(payload.Name ?? payload.name) ?? '').trim().toLowerCase();
  if (id === LSPORTS_PREMATCH_1X2_MARKET_ID || name === '1x2') return '1x2';
  if (id === LSPORTS_PREMATCH_UNDER_OVER_MARKET_ID || name === 'under/over') return 'totals';
  if (id === LSPORTS_PREMATCH_ASIAN_HANDICAP_MARKET_ID || name === 'asian handicap - full time') {
    return 'handicap';
  }
  return 'unsupported';
}

function readLine(bet: Record<string, unknown>, market: Record<string, unknown>): string | undefined {
  const value = bet.Line ?? bet.line ?? market.Line ?? market.line;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function mapPrice(bet: Record<string, unknown>): { odds: number; raw: string } | null {
  const odds = toDecimalPrice(bet.Price ?? bet.price);
  if (odds == null) return null;
  return { odds, raw: String(bet.Price ?? bet.price) };
}

function map1x2Outcome(
  bet: Record<string, unknown>,
  diag: LsportsMarket1AdapterDiagnostics,
): AdaptedOutcome | null {
  const name = String(bet.Name ?? bet.name ?? '').trim();
  const key = LSPORTS_1X2_BET_NAME[name];
  if (!key) {
    diag.badNameBets += 1;
    return null;
  }
  const betId = readBetId(bet);
  if (betId == null) return null;
  if (!outcomeSelectable(bet)) return null;
  const price = mapPrice(bet);
  if (!price) {
    diag.badPriceBets += 1;
    return null;
  }
  diag.openSelectableOutcomes += 1;
  return {
    key,
    odds: price.odds,
    raw: price.raw,
    providerBetId: String(betId),
  };
}

function mapNamedOutcome(
  bet: Record<string, unknown>,
  names: Record<string, string>,
): AdaptedOutcome | null {
  const name = String(bet.Name ?? bet.name ?? '').trim();
  const key = names[name] ?? names[name.toLowerCase()];
  if (!key) return null;
  const betId = readBetId(bet);
  if (betId == null) return null;
  if (!outcomeSelectable(bet)) return null;
  const price = mapPrice(bet);
  if (!price) return null;
  return {
    key,
    odds: price.odds,
    raw: price.raw,
    providerBetId: String(betId),
  };
}

const TOTALS_BET_NAME: Record<string, string> = {
  Over: 'over',
  over: 'over',
  Under: 'under',
  under: 'under',
};

const HANDICAP_BET_NAME: Record<string, string> = {
  '1': 'home',
  '2': 'away',
};

function marketUnavailable(payload: Record<string, unknown>): boolean {
  return isLsportsSuspendedStatus(payload.Status) || isLsportsSettledStatus(payload.Status);
}

export function adaptPrematchFootballMarkets(
  fixtureId: number,
  markets: Iterable<LsportsMarketRecord>,
  market1Diag: LsportsMarket1AdapterDiagnostics = emptyMarket1AdapterDiagnostics(),
): {
  markets: AdaptedMarket[];
  unsupported: Array<{ marketId: string; name: string }>;
  suspendedMarkets: number;
  suspendedOutcomes: number;
  missing1x2: boolean;
  open1x2WithPrices: boolean;
} {
  const adapted: AdaptedMarket[] = [];
  const unsupported: Array<{ marketId: string; name: string }> = [];
  const totalsEntries: AdaptedMarketEntry[] = [];
  const handicapEntries: AdaptedMarketEntry[] = [];
  let suspendedMarkets = 0;
  let suspendedOutcomes = 0;
  let saw1x2 = false;
  let open1x2WithPrices = false;

  for (const market of markets) {
    const kind = classifyPrematchFootballMarket(market);
    const payload = market.payload;
    if (kind === 'unsupported') {
      unsupported.push({
        marketId: String(market.marketId ?? readId(payload.Id ?? payload.id) ?? ''),
        name: readName(payload.Name ?? payload.name) ?? '',
      });
      continue;
    }

    if (marketUnavailable(payload)) {
      suspendedMarkets += 1;
      if (kind === '1x2') {
        saw1x2 = true;
        market1Diag.seen += 1;
        if (isLsportsSuspendedStatus(payload.Status)) market1Diag.rejectedSuspendedMarket += 1;
        else market1Diag.rejectedSettledMarket += 1;
      }
      for (const bet of readBets(payload)) {
        if (!outcomeSelectable(bet) || isLsportsSuspendedStatus(payload.Status)) suspendedOutcomes += 1;
      }
      continue;
    }

    if (kind === '1x2') {
      saw1x2 = true;
      market1Diag.seen += 1;
      const outcomes: AdaptedOutcome[] = [];
      for (const bet of readBets(payload)) {
        if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) {
          suspendedOutcomes += 1;
        }
        const mapped = map1x2Outcome(bet, market1Diag);
        if (mapped) outcomes.push(mapped);
      }
      if (!outcomes.length) {
        market1Diag.rejectedNoOutcomes += 1;
        continue;
      }
      const entry: AdaptedMarketEntry = {
        id: `lsports-prematch-${fixtureId}-1-main`,
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
      market1Diag.adapted += 1;
      if (outcomes.length >= 3) open1x2WithPrices = true;
      continue;
    }

    const names = kind === 'totals' ? TOTALS_BET_NAME : HANDICAP_BET_NAME;
    const outcomes: AdaptedOutcome[] = [];
    for (const bet of readBets(payload)) {
      if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) {
        suspendedOutcomes += 1;
      }
      const mapped = mapNamedOutcome(bet, names);
      if (mapped) outcomes.push(mapped);
    }
    if (outcomes.length < 2) continue;
    const line = readLine(readBets(payload)[0] ?? {}, payload);
    const entry: AdaptedMarketEntry = {
      id: `lsports-prematch-${fixtureId}-${kind}-${line ?? 'main'}`,
      outcomes,
      updatedAt: Date.now(),
    };
    if (line) entry.line = line;
    if (kind === 'totals') totalsEntries.push(entry);
    else handicapEntries.push(entry);
  }

  if (totalsEntries.length) {
    adapted.push({
      key: NEXTPARI_TOTALS_MARKET_KEY,
      bookmaker: '1',
      marketId: LSPORTS_PREMATCH_UNDER_OVER_MARKET_ID,
      name: 'Under/Over',
      category: 'main',
      entries: totalsEntries,
    });
  }
  if (handicapEntries.length) {
    adapted.push({
      key: NEXTPARI_HANDICAP_MARKET_KEY,
      bookmaker: '1',
      marketId: LSPORTS_PREMATCH_ASIAN_HANDICAP_MARKET_ID,
      name: 'Asian Handicap',
      category: 'main',
      entries: handicapEntries,
    });
  }

  return {
    markets: adapted,
    unsupported,
    suspendedMarkets,
    suspendedOutcomes,
    missing1x2: !saw1x2 || !adapted.some((market) => market.key === NEXTPARI_1X2_MARKET_KEY),
    open1x2WithPrices,
  };
}

export function asPrematchMarketRecord(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}
