import { isLsportsDisplayEvent } from './lsportsFeed';
import { outcomeLabel, type ParsedMarket } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';
import type { BetSelection, MatchEvent } from '../types';
import { selectionFromLsportsOutcome } from './sportsPlaceIdentity';
import type { ExtraCardOutcome } from './cardOdds';
import {
  clickableCardSelectionFromMarkets,
  lsportsCardSelectionFromMarkets,
  selectionFromProviderBetIdInMarkets,
} from './sportsCardIdentity';

export { hasCompleteLsportsIdentity, selectionFromLsportsOutcome } from './sportsPlaceIdentity';
export {
  clickableCardSelectionFromMarkets,
  lsportsCardSelectionFromMarkets,
} from './sportsCardIdentity';

export function lsportsStoreMarkets(matchId: string): ParsedMarket[] {
  const state = useSportsStore.getState().getEvent(matchId);
  if (!state || !isLsportsDisplayEvent(state.event)) return [];
  return Object.values(state.markets);
}

export function selectionFromProviderBetId(
  match: MatchEvent,
  providerBetId: string,
  markets = lsportsStoreMarkets(match.id),
): BetSelection | null {
  return selectionFromProviderBetIdInMarkets(match, providerBetId, markets);
}

export function lsportsIdentity(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): Partial<BetSelection> {
  return lsportsCardSelectionFromMarkets(match, lsportsStoreMarkets(match.id), outcomeLabelText, marketName) ?? {};
}

export function isLsportsMatch(match: Pick<MatchEvent, 'id' | 'feedTag'>): boolean {
  return match.feedTag === 'lsports' || lsportsStoreMarkets(match.id).length > 0;
}

export function lsportsCardSelection(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): BetSelection | null {
  return lsportsCardSelectionFromMarkets(
    match,
    lsportsStoreMarkets(match.id),
    outcomeLabelText,
    marketName,
  );
}

export function clickableCardSelection(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
  odds: number,
): { selection: BetSelection; locked: boolean } {
  return clickableCardSelectionFromMarkets(
    match,
    lsportsStoreMarkets(match.id),
    outcomeLabelText,
    marketName,
    odds,
  );
}

export function withLsportsIdentity(
  base: BetSelection,
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
): BetSelection {
  return lsportsCardSelection(match, outcomeLabelText, marketName) ?? {
    ...base,
    provider: isLsportsMatch(match) || match.feedTag === 'lsports' ? 'lsports' : base.provider,
    fixtureId: match.id,
  };
}

export function isSelectableLsportsOutcome(match: MatchEvent, outcomeLabelText: string, marketName: string): boolean {
  if (isLsportsMatch(match)) {
    return lsportsCardSelection(match, outcomeLabelText, marketName) != null;
  }
  return true;
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
