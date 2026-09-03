import { marketLineKey, parseTimestamp } from '../state/keys.js';
import { readBetId, readBets } from '../state/parse.js';
import type { LsportsMarketRecord } from '../state/types.js';
import { asRecord, readId, readName, toDecimalPrice } from './read.js';
import {
  NEXTPARI_1X2_MARKET_KEY,
  type AdaptedMarket,
  type AdaptedMarketEntry,
  type AdaptedOutcome,
  type LsportsMarket1AdapterDiagnostics,
} from './types.js';

export const LSPORTS_1X2_BET_NAME: Record<string, 'home' | 'draw' | 'away'> = {
  '1': 'home',
  X: 'draw',
  x: 'draw',
  '2': 'away',
};

/**
 * Outcome keys from Bet.Name values observed in LSports InPlay / PreMatch
 * payloads (1/X/2, Over/Under, Yes/No). Unmapped names keep the provider
 * Bet.Name so identity stays on Bet.Id rather than a guessed enum.
 */
export const LSPORTS_BET_NAME_TO_KEY: Record<string, string> = {
  ...LSPORTS_1X2_BET_NAME,
  Over: 'over',
  over: 'over',
  Under: 'under',
  under: 'under',
  Yes: 'yes',
  yes: 'yes',
  No: 'no',
  no: 'no',
  Home: 'home',
  home: 'home',
  Away: 'away',
  away: 'away',
  Draw: 'draw',
  draw: 'draw',
  '1X': '1x',
  '12': '12',
  X2: 'x2',
  x2: 'x2',
  Odd: 'odd',
  odd: 'odd',
  Even: 'even',
  even: 'even',
  Exactly: 'exactly',
  exactly: 'exactly',
};

/**
 * Live Railway inventory 2026-09-03 for ordered InPlay football (keepalive
 * fixtures). Documented from Type 3 / store Market.Id + Market.Name — not an
 * allowlist. Adapter classifies from the payload name, not guessed IDs.
 *
 * 1 1X2 | 2 Under/Over | 3 Asian Handicap | 9 Correct Score 1st Period
 * 11 Total Corners | 13 European Handicap | 17 Both Teams To Score
 * 21 Under/Over 1st Period | 30/31 Under/Over Corners Home/Away
 * 41 1st Period Winner | 45 Under/Over 2nd Period | 56 Last Team To Score
 * 59 Next Goal | 64 Asian Handicap 1st Period | 95 Corners Handicap
 * 101/102 Under/Over Home/Away Team | 129 Under/Over Corners - 1st Half
 * 153/155 1st Period team totals | 156 2nd Period Away Team totals
 * 250 Corners Handicap - 1st Half | 305 Corners - Under/Exactly/Over
 * 317/322 Under/Exactly/Over | 341 Race To | 401/402 1H corner team totals
 * 457 Double Chance 2nd Period | 579 Next Corner | 820 Race To Corners
 * 835 Asian Under/Over | 836 Asian Under/Over 1st Period
 * 880 First Half Corners - Under/Exactly/Over
 * 1053 Asian Under/Over 2nd Period | 1439 Asian Handicap - Full Time
 * 1552 Asian Under/Over Corners | 1795 1st Period 1X2 And Under/Over
 * 2732 Asian Handicap - 1st Period | 2755 Asian Handicap - 2nd Period
 */

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

export function emptyMarket1AdapterDiagnostics(): LsportsMarket1AdapterDiagnostics {
  return {
    seen: 0,
    adapted: 0,
    rejectedSettledMarket: 0,
    rejectedSuspendedMarket: 0,
    rejectedNoOutcomes: 0,
    settlementBlockedBets: 0,
    badPriceBets: 0,
    badNameBets: 0,
    openSelectableOutcomes: 0,
  };
}

export function isFullTime1x2Market(market: LsportsMarketRecord): boolean {
  const payload = market.payload;
  const id = String(market.marketId ?? readId(payload.Id ?? payload.id) ?? '');
  const name = String(readName(payload.Name ?? payload.name) ?? '').toLowerCase();
  return id === '1' || name === '1x2';
}

/** @deprecated Use isFullTime1x2Market for 1X2 diagnostics. All open football markets are adapted. */
export function isSupportedFootballMarket(market: LsportsMarketRecord): boolean {
  return isFullTime1x2Market(market);
}

export function unsupportedMarketKey(market: LsportsMarketRecord): { marketId: string; name: string } {
  const payload = market.payload;
  return {
    marketId: String(market.marketId ?? readId(payload.Id ?? payload.id) ?? ''),
    name: readName(payload.Name ?? payload.name) ?? '',
  };
}

function settlementBlocksBet(bet: Record<string, unknown>): boolean {
  const settlement = bet.Settlement;
  return settlement === 1 || settlement === 2 || settlement === 3 || settlement === 4 || settlement === 5;
}

export function outcomeSelectable(bet: Record<string, unknown>): boolean {
  if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) return false;
  if (isLsportsSettledStatus(bet.Status) || isLsportsSettledStatus(bet.BetStatusId)) return false;
  if (settlementBlocksBet(bet)) return false;
  if (!isLsportsOpenStatus(bet.Status ?? 1) && bet.Status != null) return false;
  return true;
}

export function outcomeKeyFromBetName(name: string, strict1x2 = false): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (strict1x2) return LSPORTS_1X2_BET_NAME[trimmed] ?? null;
  return LSPORTS_BET_NAME_TO_KEY[trimmed]
    ?? LSPORTS_BET_NAME_TO_KEY[trimmed.toLowerCase()]
    ?? trimmed;
}

export function classifyLsportsFootballMarket(
  marketId: string,
  name: string,
): { category: AdaptedMarket['category']; is1x2: boolean } {
  const n = name.trim().toLowerCase();
  const is1x2 = marketId === '1' || n === '1x2';
  if (is1x2) return { category: 'main', is1x2: true };
  if (/\bcorners?\b/.test(n)) return { category: 'corners', is1x2: false };
  if (/1st period|1st half|first half|2nd period|2nd half/.test(n)) {
    return { category: 'half', is1x2: false };
  }
  if (/correct score|race to|next goal|last team|and under\/over/.test(n)) {
    return { category: 'specials', is1x2: false };
  }
  return { category: 'main', is1x2: false };
}

function readLineValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

export function readAdaptedMarketLine(
  market: LsportsMarketRecord,
  bets: Record<string, unknown>[],
): string {
  if (market.line) return market.line;
  const fromKey = marketLineKey(market.payload);
  if (fromKey) return fromKey;
  const payload = market.payload;
  const marketLine = readLineValue(payload.MainLine ?? payload.BaseLine ?? payload.Line);
  if (marketLine) return marketLine;
  for (const bet of bets) {
    const line = readLineValue(
      bet.Line ?? bet.BaseLine ?? bet.MainLine ?? bet.Points ?? bet.Handicap ?? bet.Total,
    );
    if (line) return line;
  }
  return '';
}

function mapOutcome(
  bet: Record<string, unknown>,
  diag: LsportsMarket1AdapterDiagnostics,
  is1x2: boolean,
): AdaptedOutcome | null {
  const name = String(bet.Name ?? bet.name ?? '').trim();
  const key = outcomeKeyFromBetName(name, is1x2);
  if (!key) {
    if (is1x2) diag.badNameBets += 1;
    return null;
  }
  const betId = readBetId(bet);
  if (betId == null) return null;
  if (settlementBlocksBet(bet)) {
    if (is1x2) diag.settlementBlockedBets += 1;
    return null;
  }
  if (!outcomeSelectable(bet)) return null;
  const odds = toDecimalPrice(bet.Price ?? bet.price);
  if (odds == null) {
    if (is1x2) diag.badPriceBets += 1;
    return null;
  }
  if (is1x2) diag.openSelectableOutcomes += 1;
  return {
    key,
    odds,
    raw: String(bet.Price ?? bet.price),
    providerBetId: String(betId),
  };
}

function displayMarketKey(marketId: string, is1x2: boolean): string {
  return is1x2 ? NEXTPARI_1X2_MARKET_KEY : `lsports:${marketId}`;
}

function entryUpdatedAt(market: LsportsMarketRecord): number {
  return parseTimestamp(market.lastUpdate) ?? Date.now();
}

function upsertGrouped(
  groups: Map<string, AdaptedMarket>,
  market: AdaptedMarket,
  entry: AdaptedMarketEntry,
): void {
  const existing = groups.get(market.key);
  if (!existing) {
    groups.set(market.key, { ...market, entries: [entry] });
    return;
  }
  const lineKey = entry.line ?? '';
  const index = existing.entries.findIndex((row) => (row.line ?? '') === lineKey);
  if (index >= 0) existing.entries[index] = entry;
  else existing.entries.push(entry);
}

function sortEntries(entries: AdaptedMarketEntry[]): AdaptedMarketEntry[] {
  return [...entries].sort((a, b) => {
    const la = Number(a.line);
    const lb = Number(b.line);
    if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
    return String(a.line ?? '').localeCompare(String(b.line ?? ''));
  });
}

export function adaptFootballMarkets(
  fixtureId: number,
  markets: Iterable<LsportsMarketRecord>,
  market1Diag: LsportsMarket1AdapterDiagnostics = emptyMarket1AdapterDiagnostics(),
): {
  markets: AdaptedMarket[];
  unsupported: Array<{ marketId: string; name: string }>;
  suspendedMarkets: number;
  suspendedOutcomes: number;
  missing1x2: boolean;
} {
  const groups = new Map<string, AdaptedMarket>();
  const unsupported: Array<{ marketId: string; name: string }> = [];
  let suspendedMarkets = 0;
  let suspendedOutcomes = 0;
  let saw1x2 = false;

  for (const market of markets) {
    const payload = market.payload;
    const marketId = String(market.marketId ?? readId(payload.Id ?? payload.id) ?? '');
    const name = readName(payload.Name ?? payload.name) ?? '';
    const { category, is1x2 } = classifyLsportsFootballMarket(marketId, name);
    if (is1x2) {
      saw1x2 = true;
      market1Diag.seen += 1;
    }

    const marketSuspended = isLsportsSuspendedStatus(payload.Status);
    if (marketSuspended || isLsportsSettledStatus(payload.Status)) {
      suspendedMarkets += 1;
      if (is1x2) {
        if (marketSuspended) market1Diag.rejectedSuspendedMarket += 1;
        else market1Diag.rejectedSettledMarket += 1;
      }
      for (const bet of readBets(payload)) {
        if (!outcomeSelectable(bet) || marketSuspended) suspendedOutcomes += 1;
      }
      continue;
    }

    const bets = readBets(payload);
    const outcomes: AdaptedOutcome[] = [];
    for (const bet of bets) {
      if (isLsportsSuspendedStatus(bet.Status) || isLsportsSuspendedStatus(bet.BetStatusId)) {
        suspendedOutcomes += 1;
      }
      const mapped = mapOutcome(bet, market1Diag, is1x2);
      if (mapped) outcomes.push(mapped);
    }
    if (!outcomes.length) {
      if (is1x2) market1Diag.rejectedNoOutcomes += 1;
      else unsupported.push({ marketId, name });
      continue;
    }

    const line = readAdaptedMarketLine(market, bets);
    const canonicalKey = market.key || `${fixtureId}:${marketId}:${line}`;
    const entry: AdaptedMarketEntry = {
      id: `lsports-${fixtureId}-${marketId}-${line || 'main'}`,
      outcomes,
      updatedAt: entryUpdatedAt(market),
      canonicalKey,
    };
    if (line) entry.line = line;
    if (is1x2 && outcomes.length < 3) entry.ss = 'suspended';

    upsertGrouped(groups, {
      key: displayMarketKey(marketId, is1x2),
      bookmaker: '1',
      marketId: is1x2 ? '1' : marketId,
      name: is1x2 ? '1X2' : name || `Market ${marketId}`,
      category,
      entries: [],
      canonicalKey: is1x2 ? canonicalKey : undefined,
    }, entry);
    if (is1x2) market1Diag.adapted += 1;
  }

  const adapted = [...groups.values()].map((market) => ({
    ...market,
    entries: sortEntries(market.entries),
  }));
  adapted.sort((a, b) => {
    if (a.key === NEXTPARI_1X2_MARKET_KEY) return -1;
    if (b.key === NEXTPARI_1X2_MARKET_KEY) return 1;
    const order = { main: 0, half: 1, corners: 2, quarter: 3, specials: 4 } as const;
    const ca = order[a.category] - order[b.category];
    if (ca !== 0) return ca;
    return Number(a.marketId) - Number(b.marketId) || a.name.localeCompare(b.name);
  });

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
