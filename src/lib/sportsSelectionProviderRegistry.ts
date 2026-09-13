import type { BetSelection, MatchEvent } from '../types';
import type { ParsedMarket, ParsedMarketEntry, ParsedOutcome } from './odds-parser';
import type { ExtraCardOutcome } from './cardOdds';

export class SportsSelectionProviderRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SportsSelectionProviderRegistrationError';
  }
}

export function normalizeSportsEventProviderId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveSportsEventProvider(
  match?: { provider?: unknown; feedTag?: unknown } | null,
  event?: { provider?: unknown; our_events?: unknown } | null,
): string {
  const candidates = [
    match?.provider,
    event?.provider,
    match?.feedTag,
    event?.our_events,
  ];
  for (const value of candidates) {
    const id = normalizeSportsEventProviderId(value);
    if (id) return id;
  }
  return '';
}

export interface SportsSelectionContext {
  match: MatchEvent;
  event?: { provider?: unknown; our_events?: unknown } | null;
  markets?: ParsedMarket[];
}

export interface SportsSelectionOutcomeInput {
  marketName: string;
  outcomeLabel: string;
  odds: number;
  market?: ParsedMarket;
  entry?: ParsedMarketEntry;
  outcome?: ParsedOutcome;
  providerOutcomeId?: string;
  marketId?: string;
  marketKey?: string;
  line?: string;
}

export interface SportsSelectionProviderAdapter {
  readonly id: string;
  selectionFromOutcome(
    ctx: SportsSelectionContext,
    input: SportsSelectionOutcomeInput,
  ): BetSelection | null;
  selectionFromProviderOutcomeId?(
    ctx: SportsSelectionContext,
    providerOutcomeId: string,
  ): BetSelection | null;
  isSelectionValid(selection: BetSelection): boolean;
  cardSelection?(
    ctx: SportsSelectionContext,
    outcomeLabel: string,
    marketName: string,
    odds: number,
  ): { selection: BetSelection; locked: boolean };
  gridSelection?(
    ctx: SportsSelectionContext,
    input: SportsSelectionOutcomeInput,
  ): { selection: BetSelection; locked: boolean };
  extraMarketRows?(
    ctx: SportsSelectionContext,
  ): Array<{ name: string; outcomes: ExtraCardOutcome[] }>;
  extraMarketCount?(
    match: MatchEvent,
    rows: Array<{ name: string; outcomes: ExtraCardOutcome[] }>,
  ): number;
  isMarketVisible?(
    market: ParsedMarket,
    minute: number | null,
    sport: string,
  ): boolean;
}

export type SportsSelectionProviderFactory = () => SportsSelectionProviderAdapter;

export interface SportsSelectionProviderRegistration {
  id: string;
  create: SportsSelectionProviderFactory;
}

export interface SportsSelectionProviderRegistry {
  resolve(providerId?: string): SportsSelectionProviderAdapter | null;
  has(providerId?: string): boolean;
  ids(): string[];
}

export function createSportsSelectionProviderRegistry(
  registrations: readonly SportsSelectionProviderRegistration[],
): SportsSelectionProviderRegistry {
  const factories = new Map<string, SportsSelectionProviderFactory>();

  for (const registration of registrations) {
    const id = normalizeSportsEventProviderId(registration.id);
    if (!id) {
      throw new SportsSelectionProviderRegistrationError('SPORTS_SELECTION_PROVIDER_ID_REQUIRED');
    }
    if (factories.has(id)) {
      throw new SportsSelectionProviderRegistrationError(`SPORTS_SELECTION_PROVIDER_DUPLICATE:${id}`);
    }
    if (typeof registration.create !== 'function') {
      throw new SportsSelectionProviderRegistrationError(`SPORTS_SELECTION_PROVIDER_FACTORY_REQUIRED:${id}`);
    }
    factories.set(id, registration.create);
  }

  return {
    resolve(providerId) {
      const id = normalizeSportsEventProviderId(providerId);
      if (!id) return null;
      const create = factories.get(id);
      if (!create) return null;
      const adapter = create();
      const createdId = normalizeSportsEventProviderId(adapter?.id);
      if (createdId !== id) {
        throw new SportsSelectionProviderRegistrationError(
          `SPORTS_SELECTION_PROVIDER_ID_MISMATCH:${id}:${createdId}`,
        );
      }
      return adapter;
    },
    has(providerId) {
      const id = normalizeSportsEventProviderId(providerId);
      return Boolean(id) && factories.has(id);
    },
    ids() {
      return [...factories.keys()];
    },
  };
}
