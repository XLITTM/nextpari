import { extraMarketRows, buildCardSelection, type ExtraCardOutcome } from './cardOdds';
import { createLsportsSelectionProvider } from './lsportsSelectionProvider';
import type { ParsedMarket } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';
import type { BetSelection, MatchEvent } from '../types';
import {
  createSportsSelectionProviderRegistry,
  resolveSportsEventProvider,
  type SportsSelectionContext,
  type SportsSelectionOutcomeInput,
  type SportsSelectionProviderAdapter,
} from './sportsSelectionProviderRegistry';

export {
  createSportsSelectionProviderRegistry,
  normalizeSportsEventProviderId,
  resolveSportsEventProvider,
  SportsSelectionProviderRegistrationError,
} from './sportsSelectionProviderRegistry';
export type {
  SportsSelectionContext,
  SportsSelectionOutcomeInput,
  SportsSelectionProviderAdapter,
  SportsSelectionProviderRegistry,
} from './sportsSelectionProviderRegistry';

const liveRegistry = createSportsSelectionProviderRegistry([
  {
    id: 'lsports',
    create: createLsportsSelectionProvider,
  },
]);

function storeEvent(matchId: string) {
  return useSportsStore.getState().getEvent(matchId)?.event;
}

type EventProviderFields = { provider?: unknown; our_events?: unknown } | null | undefined;

export function sportsSelectionContext(
  match: MatchEvent,
  event: EventProviderFields = storeEvent(match.id),
  markets?: ParsedMarket[],
): SportsSelectionContext {
  return { match, event: event ?? undefined, markets };
}

export function resolveSportsSelectionAdapter(
  match: MatchEvent,
  event: EventProviderFields = storeEvent(match.id),
): SportsSelectionProviderAdapter | null {
  return liveRegistry.resolve(resolveSportsEventProvider(match, event));
}

export function resolveLiveSportsSelectionProvider(providerId?: string): SportsSelectionProviderAdapter | null {
  return liveRegistry.resolve(providerId);
}

export function isSportsSelectionValid(selection: BetSelection): boolean {
  const adapter = liveRegistry.resolve(selection.provider);
  return adapter?.isSelectionValid(selection) === true;
}

export function clickableCardSelection(
  match: MatchEvent,
  outcomeLabelText: string,
  marketName: string,
  odds: number,
): { selection: BetSelection; locked: boolean } {
  const ctx = sportsSelectionContext(match);
  const adapter = resolveSportsSelectionAdapter(match, ctx.event);
  if (adapter?.cardSelection) {
    return adapter.cardSelection(ctx, outcomeLabelText, marketName, odds);
  }
  return {
    selection: buildCardSelection(match, outcomeLabelText, odds, marketName),
    locked: true,
  };
}

export function extraSportsMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: ExtraCardOutcome[] }> {
  const ctx = sportsSelectionContext(match);
  const adapter = resolveSportsSelectionAdapter(match, ctx.event);
  if (adapter?.extraMarketRows) return adapter.extraMarketRows(ctx);
  return extraMarketRows(match);
}

export function extraSportsMarketCount(
  match: MatchEvent,
  rows: Array<{ name: string; outcomes: ExtraCardOutcome[] }>,
): number {
  const adapter = resolveSportsSelectionAdapter(match);
  if (adapter?.extraMarketCount) return adapter.extraMarketCount(match, rows);
  return Math.max(Number(match.extraMarkets) || 0, rows.length, 3);
}

export function isSportsMarketVisible(
  match: MatchEvent,
  market: ParsedMarket,
  minute: number | null,
  sport: string,
  event = storeEvent(match.id),
): boolean {
  const adapter = resolveSportsSelectionAdapter(match, event);
  if (adapter?.isMarketVisible) return adapter.isMarketVisible(market, minute, sport);
  if (sport !== 'football' && sport !== 'all') return true;
  if (minute == null) return true;
  if (minute > 45 && market.category === 'half' && !/2nd|2-й/i.test(market.name)) return false;
  if (minute > 90 && market.category === 'main') return false;
  return true;
}

export function buildSportsGridSelection(
  match: MatchEvent,
  input: SportsSelectionOutcomeInput,
  event = storeEvent(match.id),
  markets?: ParsedMarket[],
): { selection: BetSelection; locked: boolean } {
  const ctx = sportsSelectionContext(match, event, markets);
  const adapter = resolveSportsSelectionAdapter(match, event);
  if (adapter?.gridSelection) return adapter.gridSelection(ctx, input);
  if (adapter) {
    const fromId = input.providerOutcomeId
      ? adapter.selectionFromProviderOutcomeId?.(ctx, input.providerOutcomeId)
      : null;
    const selection = fromId ?? adapter.selectionFromOutcome(ctx, input);
    if (selection && adapter.isSelectionValid(selection)) {
      return { selection, locked: selection.odds <= 1 };
    }
  }
  return {
    selection: buildCardSelection(match, input.outcomeLabel, input.odds, input.marketName),
    locked: true,
  };
}
