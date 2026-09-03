import { isLsportsDisplayEvent } from './lsportsFeed';
import { outcomeLabel, type ParsedMarket, type ParsedOutcome } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';
import type { BetSelection, MatchEvent } from '../types';

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

function outcomeForLabel(
  market: ParsedMarket,
  label: string,
): { entryLine?: string; outcome: ParsedOutcome; canonicalKey?: string } | null {
  const wanted = LABEL_TO_KEY[label] ?? label.toLowerCase();
  for (const entry of market.entries) {
    for (const outcome of entry.outcomes) {
      const display = outcomeLabel(outcome.key, entry.line);
      if (
        outcome.key === wanted
        || display === label
        || outcome.providerBetId === label
        || outcome.key === label
      ) {
        return { entryLine: entry.line, outcome, canonicalKey: entry.canonicalKey };
      }
    }
  }
  return null;
}

function is1x2Market(market: ParsedMarket): boolean {
  return market.marketId === '1' || market.key === '1_1' || /^1x2$/i.test(market.name);
}

export function lsportsIdentity(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): Partial<BetSelection> {
  const markets = lsportsStoreMarkets(match.id);
  if (!markets.length) return {};
  const named = markets.filter((row) => row.name === marketName);
  const search = named.length
    ? named
    : /^(1x2)$/i.test(marketName)
      ? markets.filter(is1x2Market)
      : [];
  for (const market of search) {
    const found = outcomeForLabel(market, outcomeLabelText);
    if (!found?.outcome.providerBetId) continue;
    const marketKey = found.canonicalKey ?? market.canonicalKey ?? market.key;
    return {
      provider: 'lsports',
      feedType: 'inplay',
      fixtureId: match.id,
      marketId: market.marketId,
      marketKey,
      line: found.entryLine,
      outcomeId: found.outcome.providerBetId,
      id: `lsports:${match.id}:${marketKey}:${found.outcome.providerBetId}`,
    };
  }
  if (/^(1x2)$/i.test(marketName)) {
    return { provider: 'lsports', feedType: 'inplay', fixtureId: match.id };
  }
  return {};
}

export function withLsportsIdentity(
  base: BetSelection,
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): BetSelection {
  const identity = lsportsIdentity(match, outcomeLabelText, marketName);
  if (!identity.provider) return base;
  return { ...base, ...identity };
}

export function isSelectableLsportsOutcome(match: MatchEvent, outcomeLabelText: string, marketName: string): boolean {
  const markets = lsportsStoreMarkets(match.id);
  if (!markets.length) return true;
  const identity = lsportsIdentity(match, outcomeLabelText, marketName);
  return Boolean(identity.outcomeId);
}
