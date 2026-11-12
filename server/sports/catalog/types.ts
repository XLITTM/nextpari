import type { SportsProvider } from '../types.js';

interface NamedEntity {
  readonly id: string;
  readonly name: string;
}

export interface CatalogEntities {
  sport: NamedEntity;
  country: NamedEntity;
  competition: NamedEntity & { readonly sportId: string; readonly countryId?: string };
  season: NamedEntity & { readonly competitionId: string };
  participant: NamedEntity & {
    readonly sportId: string;
    readonly countryId?: string;
    readonly kind: 'team' | 'individual' | 'other';
  };
  event: NamedEntity & {
    readonly sportId: string;
    readonly competitionId: string;
    readonly seasonId?: string;
    readonly startsAtMs?: number;
    readonly participants: readonly EventParticipant[];
    readonly eligibleSubjectIds?: readonly string[];
  };
  period: NamedEntity & { readonly sportId: string };
}

export type EntityKind = keyof CatalogEntities;
export type CanonicalEvent = CatalogEntities['event'];

export interface EventParticipant {
  readonly role: string;
  readonly participantId: string;
}

export interface ProviderSource {
  readonly provider: SportsProvider;
  /** Namespace in which external identifiers have the same meaning. */
  readonly namespace: string;
}

export interface ProviderRef {
  readonly source: ProviderSource;
  readonly externalId: string;
}

export interface VerifiedAlias extends ProviderRef {
  readonly kind: EntityKind;
  readonly canonicalId: string;
  /** Reference to the evidence used to approve the ID crosswalk. */
  readonly evidence: string;
}

export interface CatalogDefinition {
  readonly entities: { readonly [K in EntityKind]: readonly CatalogEntities[K][] };
  readonly aliases: readonly VerifiedAlias[];
}

export interface ProviderEvent extends ProviderRef {
  readonly sportId: string;
  readonly competitionId: string;
  readonly seasonId?: string;
  readonly countryId?: string;
  readonly participants: readonly EventParticipant[];
  readonly startsAtMs?: number;
  readonly status: FeedPhase | 'finished' | 'closed' | 'unknown';
  readonly sourceUpdatedAtMs?: number;
  readonly receivedAtMs: number;
}

export type Resolution<T> =
  | { readonly ok: true; readonly value: T }
  | {
    readonly ok: false;
    readonly reason: 'unmapped' | 'ambiguous' | 'conflict' | 'invalid';
    readonly kind: EntityKind;
    readonly externalId: string;
  };

export interface MarketDefinition {
  readonly id: string;
  readonly line:
    | { readonly kind: 'none' }
    | { readonly kind: 'total' }
    | { readonly kind: 'handicap'; readonly anchorRole: string };
  readonly subject: 'event' | 'participant';
  readonly selections:
    | { readonly kind: 'fixed'; readonly codes: readonly string[] }
    | { readonly kind: 'event-participants' };
}

export interface ProviderMarketRule {
  readonly source: ProviderSource;
  readonly bookmakerId: string;
  readonly externalPeriodId: string;
  readonly externalMarketId: string;
  readonly periodId: string;
  readonly marketDefinitionId: string;
  /** Sign conversion from the provider's published line to the canonical anchor. */
  readonly handicapSign?: 'as-provided' | 'invert';
  /** For fixed selections only. Keys are exact provider codes. */
  readonly selectionCodes?: Readonly<Record<string, string>>;
}

export type MarketStatus = 'open' | 'suspended' | 'closed';
export type MarketState = MarketStatus | 'incomplete' | 'conflict';
export type FeedPhase = 'prematch' | 'live';

export interface ProviderMarket {
  readonly bookmakerId: string;
  readonly externalPeriodId: string;
  readonly externalMarketId: string;
  readonly line?: string;
  readonly subjectExternalId?: string;
  readonly phase: FeedPhase;
  readonly status: MarketStatus;
  readonly sourceUpdatedAtMs: number | null;
  readonly selections: readonly {
    readonly externalId: string;
    readonly code?: string;
    readonly participantExternalId?: string;
    readonly externalOddsId?: string;
    readonly price: number | null;
  }[];
}

export interface ProviderObservation {
  readonly event: ProviderEvent;
  readonly markets: readonly ProviderMarket[];
}

/** Adapters own transport and must preserve provider identifiers and line text. */
export interface ProviderAdapter<T> {
  readonly source: ProviderSource;
  decode(payload: T): readonly ProviderObservation[];
}

export type MarketLine =
  | { readonly kind: 'total'; readonly components: readonly string[] }
  | { readonly kind: 'handicap'; readonly components: readonly string[]; readonly anchorParticipantId: string };

export interface CanonicalMarket {
  readonly id: string;
  readonly eventId: string;
  readonly periodId: string;
  readonly definitionId: string;
  readonly subjectId: string | null;
  readonly line: MarketLine | null;
}

export type SelectionTarget =
  | { readonly kind: 'code'; readonly code: string; readonly participantId?: string }
  | { readonly kind: 'participant'; readonly participantId: string };

export interface CanonicalOdds {
  readonly id: string;
  readonly selectionId: string;
  readonly selection: SelectionTarget;
  readonly sourceSelectionId: string | null;
  readonly sourceOddsId: string | null;
  readonly price: number | null;
}

export interface MarketSnapshot {
  readonly id: string;
  readonly market: CanonicalMarket;
  readonly source: ProviderSource;
  readonly bookmakerId: string;
  readonly providerEventId: string;
  readonly externalPeriodId: string;
  readonly externalMarketId: string;
  readonly sourceLine: string | null;
  readonly sourceSubjectId: string | null;
  readonly phase: FeedPhase;
  readonly state: MarketState;
  readonly sourceUpdatedAtMs: number | null;
  readonly receivedAtMs: number;
  readonly odds: readonly CanonicalOdds[];
}
