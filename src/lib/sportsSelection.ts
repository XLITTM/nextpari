import { isLsportsDisplayEvent } from './lsportsFeed';
import { outcomeLabel, type ParsedMarket, type ParsedMarketEntry, type ParsedOutcome } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';
import type { BetSelection, MatchEvent } from '../types';
import {
  hasCompleteLsportsIdentity,
  selectionFromLsportsOutcome,
} from './sportsPlaceIdentity';
import type { ExtraCardOutcome } from './cardOdds';

export { hasCompleteLsportsIdentity, selectionFromLsportsOutcome } from './sportsPlaceIdentity';

const LABEL_TO_KEY: Record<string, string> = {
  П1: 'home',
  П2: 'away',
  X: 'draw',
  '1': 'home',
  '2': 'away',
  ТБ: 'over',
  ТМ: 'under',
  Да: 'yes',
  Нет: 'no',
  '1X': '1x',
  '12': '12',
  X2: 'x2',
  Нечет: 'odd',
  Чет: 'even',
  Ровно: 'exactly',
};

export function lsportsStoreMarkets(matchId: string): ParsedMarket[] {
  const state = useSportsStore.getState().getEvent(matchId);
  if (!state || !isLsportsDisplayEvent(state.event)) return [];
  return Object.values(state.markets);
}

function is1x2Market(market: ParsedMarket): boolean {
  return market.marketId === '1' || market.key === '1_1' || /^1x2$/i.test(market.name);
}

function looksLikeBetId(value: string): boolean {
  return /^\d{6,}$/.test(value.trim());
}

function outcomeMatchesLabel(
  entry: ParsedMarketEntry,
  outcome: ParsedOutcome,
  label: string,
): boolean {
  const wanted = LABEL_TO_KEY[label] ?? label.toLowerCase();
  const display = outcomeLabel(outcome.key, entry.line);
  return outcome.key === wanted
    || display === label
    || outcome.key === label
    || (looksLikeBetId(label) && outcome.providerBetId === label);
}

function findNormalizedOutcome(
  markets: ParsedMarket[],
  outcomeLabelText: string,
  marketName: string,
): { market: ParsedMarket; entry: ParsedMarketEntry; outcome: ParsedOutcome } | null {
  const named = markets.filter((row) => row.name === marketName);
  const search = named.length
    ? named
    : /^(1x2)$/i.test(marketName)
      ? markets.filter(is1x2Market)
      : markets.filter((row) => {
        const display = [row.name, ...row.entries.map((entry) => [row.name, entry.line].filter(Boolean).join(' '))];
        return display.some((name) => name === marketName);
      });
  for (const market of search) {
    for (const entry of market.entries) {
      for (const outcome of entry.outcomes) {
        if (!outcome.providerBetId) continue;
        if (outcomeMatchesLabel(entry, outcome, outcomeLabelText)) {
          return { market, entry, outcome };
        }
      }
    }
  }
  return null;
}

export function lsportsIdentity(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): Partial<BetSelection> {
  const markets = lsportsStoreMarkets(match.id);
  if (!markets.length) return {};
  const found = findNormalizedOutcome(markets, outcomeLabelText, marketName);
  if (!found) return {};
  return selectionFromLsportsOutcome(match, found.market, found.entry, found.outcome) ?? {};
}

export function withLsportsIdentity(
  base: BetSelection,
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): BetSelection {
  const identity = lsportsIdentity(match, outcomeLabelText, marketName);
  if (!identity.outcomeId) return base;
  return { ...base, ...identity };
}

export function isSelectableLsportsOutcome(match: MatchEvent, outcomeLabelText: string, marketName: string): boolean {
  const markets = lsportsStoreMarkets(match.id);
  if (!markets.length) {
    return match.feedTag !== 'lsports';
  }
  return hasCompleteLsportsIdentity(lsportsIdentity(match, outcomeLabelText, marketName));
}

export function extraLsportsMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: ExtraCardOutcome[] }> {
  const extras = lsportsStoreMarkets(match.id).filter((market) => market.marketId !== '1' && market.key !== '1_1');
  if (!extras.length) return [];
  const pickStore = (
    test: (market: (typeof extras)[number]) => boolean,
    limit = 2,
  ) => {
    const market = extras.find(test);
    if (!market) return null;
    const entry = market.entries.find((row) => row.outcomes.some((outcome) => outcome.odds > 1))
      ?? market.entries[0];
    if (!entry) return null;
    const outcomes = entry.outcomes.flatMap((outcome) => {
      const selection = selectionFromLsportsOutcome(match, market, entry, outcome);
      if (!selection) return [];
      return [{
        label: outcomeLabel(outcome.key, entry.line),
        odds: outcome.odds,
        selection,
      }];
    }).slice(0, limit);
    if (!outcomes.length) return null;
    return { name: [market.name, entry.line].filter(Boolean).join(' '), outcomes };
  };
  const totals = extras
    .filter((market) => market.marketId === '2' || /тотал|under\/over|total/i.test(market.name))
    .slice(0, 3)
    .flatMap((market) => {
      const row = pickStore((candidate) => candidate === market);
      return row ? [row] : [];
    });
  const handicap = pickStore((market) => market.marketId === '1439' || /фора|handicap/i.test(market.name));
  const dc = pickStore((market) => /двойной шанс|double chance/i.test(market.name), 3);
  const btts = pickStore((market) => market.marketId === '17' || /обе забьют|btts|both teams to score/i.test(market.name));
  return [...totals, handicap, dc, btts].filter((row): row is NonNullable<typeof row> => Boolean(row));
}
