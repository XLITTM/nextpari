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
};

export function lsportsStoreMarkets(matchId: string): ParsedMarket[] {
  const state = useSportsStore.getState().getEvent(matchId);
  if (!state || !isLsportsDisplayEvent(state.event)) return [];
  return Object.values(state.markets);
}

function outcomeForLabel(market: ParsedMarket, label: string): { entryLine?: string; outcome: ParsedOutcome } | null {
  const wanted = LABEL_TO_KEY[label] ?? label.toLowerCase();
  for (const entry of market.entries) {
    for (const outcome of entry.outcomes) {
      const display = outcomeLabel(outcome.key, entry.line);
      if (outcome.key === wanted || display === label || outcome.providerBetId === label) {
        return { entryLine: entry.line, outcome };
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
  const market = markets.find((row) => row.name === marketName)
    ?? markets.find((row) => row.marketId === '1' || row.key === '1_1');
  if (!market) return {};
  const found = outcomeForLabel(market, outcomeLabelText);
  if (!found?.outcome.providerBetId) return { provider: 'lsports', feedType: 'inplay', fixtureId: match.id };
  return {
    provider: 'lsports',
    feedType: 'inplay',
    fixtureId: match.id,
    marketId: market.marketId,
    marketKey: market.key,
    line: found.entryLine,
    outcomeId: found.outcome.providerBetId,
    id: `lsports:${match.id}:${market.key}:${found.outcome.providerBetId}`,
  };
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
