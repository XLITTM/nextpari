import { outcomeLabel, type ParsedMarket, type ParsedMarketEntry, type ParsedOutcome } from './odds-parser';
import type { BetSelection, MatchEvent } from '../types';
import {
  hasCompleteLsportsIdentity,
  selectionFromLsportsOutcome,
} from './sportsPlaceIdentity';
import { buildCardSelection } from './cardOdds';

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

export function lsportsCardSelectionFromMarkets(
  match: MatchEvent,
  markets: ParsedMarket[],
  outcomeLabelText: string,
  marketName: string,
): BetSelection | null {
  if (!markets.length) return null;
  const found = findNormalizedOutcome(markets, outcomeLabelText, marketName);
  if (!found) return null;
  const selection = selectionFromLsportsOutcome(match, found.market, found.entry, found.outcome);
  return selection && hasCompleteLsportsIdentity(selection) ? selection : null;
}

export function selectionFromProviderBetIdInMarkets(
  match: MatchEvent,
  providerBetId: string,
  markets: ParsedMarket[],
): BetSelection | null {
  const wanted = String(providerBetId ?? '').trim();
  if (!looksLikeBetId(wanted)) return null;
  for (const market of markets) {
    for (const entry of market.entries) {
      for (const outcome of entry.outcomes) {
        if (String(outcome.providerBetId ?? '').trim() !== wanted) continue;
        const selection = selectionFromLsportsOutcome(match, market, entry, outcome);
        if (selection && hasCompleteLsportsIdentity(selection)) return selection;
      }
    }
  }
  return null;
}

export function clickableCardSelectionFromMarkets(
  match: MatchEvent,
  markets: ParsedMarket[],
  outcomeLabelText: string,
  marketName: string,
  odds: number,
): { selection: BetSelection; locked: boolean } {
  const selection = lsportsCardSelectionFromMarkets(match, markets, outcomeLabelText, marketName)
    ?? lsportsCardSelectionFromMarkets(match, markets, outcomeLabelText, '1X2');
  if (selection) return { selection, locked: false };
  return {
    selection: {
      ...buildCardSelection(match, outcomeLabelText, odds, marketName),
      provider: 'lsports',
      fixtureId: match.id,
    },
    locked: true,
  };
}
