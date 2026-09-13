import { isLsportsDisplayEvent } from './lsportsFeed';
import { outcomeLabel, type ParsedMarket } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';
import type { ExtraCardOutcome } from './cardOdds';
import {
  clickableCardSelectionFromMarkets,
  selectionFromProviderBetIdInMarkets,
} from './sportsCardIdentity';
import {
  hasCompleteLsportsIdentity,
  selectionFromLsportsOutcome,
} from './sportsPlaceIdentity';
import type { BetSelection } from '../types';
import type {
  SportsSelectionContext,
  SportsSelectionOutcomeInput,
  SportsSelectionProviderAdapter,
} from './sportsSelectionProviderRegistry';

const LSPORTS_PROVIDER = 'lsports';

function marketsOf(ctx: SportsSelectionContext): ParsedMarket[] {
  if (ctx.markets) return ctx.markets;
  const state = useSportsStore.getState().getEvent(ctx.match.id);
  if (!state || !isLsportsDisplayEvent(state.event)) return [];
  return Object.values(state.markets);
}

function extraMarketRowsFromMarkets(
  ctx: SportsSelectionContext,
  markets: ParsedMarket[],
): Array<{ name: string; outcomes: ExtraCardOutcome[] }> {
  const extras = markets.filter((market) => market.marketId !== '1' && market.key !== '1_1');
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
      const selection = selectionFromLsportsOutcome(ctx.match, market, entry, outcome);
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

function displayFallback(
  ctx: SportsSelectionContext,
  input: SportsSelectionOutcomeInput,
): BetSelection {
  const fixtureId = String(ctx.match.id ?? '').trim();
  const marketKey = String(input.marketKey ?? '').trim();
  const providerOutcomeId = String(input.providerOutcomeId ?? '').trim();
  return {
    id: providerOutcomeId && marketKey
      ? `${LSPORTS_PROVIDER}:${fixtureId}:${marketKey}:${providerOutcomeId}`
      : `${fixtureId}-${input.marketName}-${input.outcomeLabel}`,
    matchId: fixtureId,
    matchLabel: `${ctx.match.team1} — ${ctx.match.team2}`,
    market: input.marketName,
    outcome: input.outcomeLabel,
    odds: input.odds,
    homeTeam: ctx.match.team1,
    awayTeam: ctx.match.team2,
    sport: ctx.match.sport,
    country: ctx.match.country,
    league: ctx.match.league,
    isLive: ctx.match.isLive,
    startTime: ctx.match.startTime,
    liveStatus: ctx.match.liveStatus,
    provider: LSPORTS_PROVIDER,
    feedType: 'inplay',
    fixtureId,
    marketId: String(input.marketId ?? '').trim(),
    marketKey,
    line: input.line ?? '',
    outcomeId: providerOutcomeId || undefined,
  };
}

export function createLsportsSelectionProvider(): SportsSelectionProviderAdapter {
  return {
    id: LSPORTS_PROVIDER,
    selectionFromOutcome(ctx, input) {
      if (input.market && input.entry && input.outcome) {
        return selectionFromLsportsOutcome(ctx.match, input.market, input.entry, input.outcome);
      }
      return null;
    },
    selectionFromProviderOutcomeId(ctx, providerOutcomeId) {
      return selectionFromProviderBetIdInMarkets(ctx.match, providerOutcomeId, marketsOf(ctx));
    },
    isSelectionValid(selection) {
      return hasCompleteLsportsIdentity(selection);
    },
    cardSelection(ctx, outcomeLabelText, marketName, odds) {
      return clickableCardSelectionFromMarkets(
        ctx.match,
        marketsOf(ctx),
        outcomeLabelText,
        marketName,
        odds,
      );
    },
    gridSelection(ctx, input) {
      const fromStore = input.providerOutcomeId
        ? selectionFromProviderBetIdInMarkets(ctx.match, input.providerOutcomeId, marketsOf(ctx))
        : null;
      const selection = fromStore ?? displayFallback(ctx, input);
      return {
        selection,
        locked: selection.odds <= 1 || !hasCompleteLsportsIdentity(selection),
      };
    },
    extraMarketRows(ctx) {
      return extraMarketRowsFromMarkets(ctx, marketsOf(ctx));
    },
    extraMarketCount(match, rows) {
      return Math.max(Number(match.extraMarkets) || 0, rows.length);
    },
    isMarketVisible() {
      return true;
    },
  };
}
