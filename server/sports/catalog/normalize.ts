import { SportsCatalog } from './catalog.js';
import { identity, isTimestamp, sourceKey } from './identity.js';
import { latestMarketSnapshot, SportsMarketNormalizer } from './markets.js';
import type { MarketResolution } from './markets.js';
import type {
  CanonicalEvent, CatalogDefinition, MarketDefinition, MarketSnapshot, ProviderEvent, ProviderMarketRule,
  ProviderObservation, Resolution,
} from './types.js';

type EventIssue = Extract<Resolution<CanonicalEvent>, { ok: false }>;
type MarketIssue = Extract<MarketResolution, { ok: false }>;

export interface NormalizedCatalogBatch {
  readonly events: readonly {
    readonly event: CanonicalEvent;
    readonly sources: readonly ProviderEvent[];
    readonly markets: readonly MarketSnapshot[];
  }[];
  readonly unresolvedEvents: readonly { readonly event: ProviderEvent; readonly issue: EventIssue }[];
  readonly unresolvedMarkets: readonly {
    readonly event: ProviderEvent;
    readonly bookmakerId: string;
    readonly externalPeriodId: string;
    readonly externalMarketId: string;
    readonly issue: MarketIssue;
  }[];
}

function eventSourceKey(event: ProviderEvent): string {
  return identity(sourceKey(event.source), event.externalId);
}

function eventSource(observation: ProviderEvent): ProviderEvent {
  const {
    source, externalId, startsAtMs, sourceUpdatedAtMs, receivedAtMs, sportId, competitionId, participants, countryId, seasonId, status,
  } = observation;
  return {
    source, externalId, receivedAtMs, sportId, competitionId, countryId, seasonId, participants,
    status: ['prematch', 'live', 'finished', 'closed'].includes(status) ? status : 'unknown',
    startsAtMs: isTimestamp(startsAtMs) ? startsAtMs : undefined,
    sourceUpdatedAtMs: isTimestamp(sourceUpdatedAtMs) && sourceUpdatedAtMs <= receivedAtMs ? sourceUpdatedAtMs : undefined,
  };
}

function latestEventSource(current: ProviderEvent | undefined, observed: ProviderEvent): ProviderEvent {
  if (!current) return observed;
  const observedAt = observed.sourceUpdatedAtMs ?? observed.receivedAtMs;
  const currentAt = current.sourceUpdatedAtMs ?? current.receivedAtMs;
  if (observedAt !== currentAt) return observedAt > currentAt ? observed : current;
  const earlierReceipt = observed.receivedAtMs < current.receivedAtMs ? observed : current;
  return {
    ...earlierReceipt,
    startsAtMs: observed.startsAtMs === current.startsAtMs ? observed.startsAtMs : undefined,
    status: observed.status === current.status ? observed.status : 'unknown',
  };
}

export class SportsNormalizationEngine {
  readonly catalog: SportsCatalog;
  private readonly markets: SportsMarketNormalizer;

  constructor(
    definition: CatalogDefinition,
    rules: readonly ProviderMarketRule[],
    additionalMarketDefinitions: readonly MarketDefinition[] = [],
  ) {
    this.catalog = new SportsCatalog(definition);
    this.markets = new SportsMarketNormalizer(this.catalog, rules, additionalMarketDefinitions);
  }

  normalizeBatch(observations: readonly ProviderObservation[]): NormalizedCatalogBatch {
    const unresolvedEvents: Array<NormalizedCatalogBatch['unresolvedEvents'][number]> = [];
    const unresolvedMarkets: Array<NormalizedCatalogBatch['unresolvedMarkets'][number]> = [];
    const invalidSources = new Set<string>();
    const resolved = observations.map(observation => {
      const result = this.catalog.resolveEvent(observation.event);
      if (!result.ok) {
        invalidSources.add(eventSourceKey(observation.event));
        unresolvedEvents.push({ event: observation.event, issue: result });
      }
      return { observation, result };
    });
    const events = new Map<string, {
      event: CanonicalEvent;
      sources: Map<string, ProviderEvent>;
      markets: Map<string, MarketSnapshot>;
    }>();
    for (const { observation, result } of resolved) {
      const source = eventSourceKey(observation.event);
      if (!result.ok || invalidSources.has(source)) continue;
      const event = result.value;
      const entry = events.get(event.id) ?? { event, sources: new Map(), markets: new Map() };
      entry.sources.set(source, latestEventSource(entry.sources.get(source), eventSource(observation.event)));
      events.set(event.id, entry);
    }
    for (const { observation, result } of resolved) {
      const source = eventSourceKey(observation.event);
      if (!result.ok || invalidSources.has(source)) continue;
      const event = result.value;
      const entry = events.get(event.id)!;
      const currentStatus = entry.sources.get(source)!.status;
      for (const input of observation.markets) {
        if ((currentStatus === 'prematch' || currentStatus === 'live') && input.phase !== currentStatus) continue;
        const normalized = this.markets.normalize(event, observation.event, input, currentStatus);
        if (!normalized.ok) {
          const { bookmakerId, externalPeriodId, externalMarketId } = input;
          unresolvedMarkets.push({ event: observation.event, bookmakerId, externalPeriodId, externalMarketId, issue: normalized });
          continue;
        }
        const snapshot = normalized.value;
        const previous = entry.markets.get(snapshot.id);
        entry.markets.set(snapshot.id, previous ? latestMarketSnapshot(previous, snapshot) : snapshot);
      }
    }
    return {
      events: [...events.values()].map(({ event, sources, markets }) => ({
        event, sources: [...sources.values()], markets: [...markets.values()],
      })),
      unresolvedEvents,
      unresolvedMarkets,
    };
  }
}
