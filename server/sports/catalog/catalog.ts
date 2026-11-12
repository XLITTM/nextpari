import { identity, isId, isTimestamp, sourceKey, validSource } from './identity.js';
import type {
  CanonicalEvent, CatalogDefinition, CatalogEntities, EntityKind, EventParticipant, ProviderEvent, ProviderRef, Resolution,
} from './types.js';

const entityKinds = ['sport', 'country', 'competition', 'season', 'participant', 'event', 'period'] as const;

function participantsKey(participants: readonly EventParticipant[]): string {
  return identity(...participants.map(({ role, participantId }) => identity(role, participantId)).sort());
}

export class SportsCatalog {
  private readonly entities = new Map<string, CatalogEntities[EntityKind]>();
  private readonly aliases = new Map<string, Set<string>>();

  constructor(definition: CatalogDefinition) {
    const { entities, aliases } = structuredClone(definition);
    for (const kind of entityKinds) {
      for (const entity of entities[kind]) {
        const key = identity(kind, entity.id);
        if (!isId(entity.id) || this.entities.has(key)) {
          throw new Error(`Invalid or duplicate catalog ${kind} ID: ${entity.id}`);
        }
        this.entities.set(key, entity);
      }
    }

    for (const competition of entities.competition) {
      this.require('sport', competition.sportId);
      if (competition.countryId !== undefined) this.require('country', competition.countryId);
    }
    for (const participant of entities.participant) {
      this.require('sport', participant.sportId);
      if (participant.countryId !== undefined) this.require('country', participant.countryId);
    }
    for (const season of entities.season) this.require('competition', season.competitionId);
    for (const period of entities.period) this.require('sport', period.sportId);
    for (const event of entities.event) this.validateEvent(event);

    for (const alias of aliases) {
      if (!validSource(alias.source) || !isId(alias.externalId) || !alias.evidence.trim()) {
        throw new Error('Catalog aliases require a source, exact external ID and evidence');
      }
      this.require(alias.kind, alias.canonicalId);
      const key = identity(alias.kind, sourceKey(alias.source), alias.externalId);
      const ids = this.aliases.get(key) ?? new Set<string>();
      ids.add(alias.canonicalId);
      this.aliases.set(key, ids);
    }
  }

  get<K extends EntityKind>(kind: K, id: string): CatalogEntities[K] | undefined {
    return this.entities.get(identity(kind, id)) as CatalogEntities[K] | undefined;
  }

  resolve<K extends EntityKind>(kind: K, ref: ProviderRef): Resolution<CatalogEntities[K]> {
    const { source, externalId } = ref;
    if (!validSource(source) || !isId(externalId)) return { ok: false, reason: 'invalid', kind, externalId };
    const ids = this.aliases.get(identity(kind, sourceKey(source), externalId));
    if (!ids) return { ok: false, reason: 'unmapped', kind, externalId };
    if (ids.size !== 1) return { ok: false, reason: 'ambiguous', kind, externalId };
    return { ok: true, value: this.require(kind, [...ids][0]) };
  }

  resolveEvent(observation: ProviderEvent): Resolution<CanonicalEvent> {
    const { source, externalId } = observation;
    if (!isTimestamp(observation.receivedAtMs)) {
      return { ok: false, reason: 'invalid', kind: 'event', externalId };
    }
    const resolved = this.resolve('event', observation);
    if (!resolved.ok) return resolved;
    const event = resolved.value;
    if (event.startsAtMs !== undefined && observation.startsAtMs !== event.startsAtMs) {
      return { ok: false, reason: 'conflict', kind: 'event', externalId };
    }
    const competition = this.require('competition', event.competitionId);
    const claims: [EntityKind, string, string | undefined][] = [
      ['sport', observation.sportId, event.sportId],
      ['competition', observation.competitionId, competition.id],
    ];
    if (observation.seasonId !== undefined) claims.push(['season', observation.seasonId, event.seasonId]);
    if (observation.countryId !== undefined) claims.push(['country', observation.countryId, competition.countryId]);

    for (const [kind, claimedId, expectedId] of claims) {
      const claim = this.resolve(kind, { source, externalId: claimedId });
      if (!claim.ok) return claim;
      if (claim.value.id !== expectedId) return { ok: false, reason: 'conflict', kind, externalId: claimedId };
    }

    const participants: EventParticipant[] = [];
    for (const entry of observation.participants) {
      const participant = this.resolve('participant', { source, externalId: entry.participantId });
      if (!participant.ok) return participant;
      participants.push({ role: entry.role, participantId: participant.value.id });
    }
    if (participantsKey(participants) !== participantsKey(event.participants)) {
      return { ok: false, reason: 'conflict', kind: 'event', externalId };
    }
    return resolved;
  }

  private require<K extends EntityKind>(kind: K, id: string): CatalogEntities[K] {
    const entity = this.get(kind, id);
    if (!entity) throw new Error(`Unknown catalog ${kind} ID: ${id}`);
    return entity;
  }

  private validateEvent(event: CanonicalEvent): void {
    const competition = this.require('competition', event.competitionId);
    if (competition.sportId !== event.sportId
      || (event.seasonId !== undefined && this.require('season', event.seasonId).competitionId !== competition.id)
      || (event.startsAtMs !== undefined && !isTimestamp(event.startsAtMs))) {
      throw new Error(`Inconsistent event scope or start time: ${event.id}`);
    }
    const participants = event.participants.map(entry => entry.participantId);
    const sideRoles = event.participants.filter(entry => entry.role === 'home' || entry.role === 'away').map(entry => entry.role);
    if (new Set(participants).size !== participants.length
      || new Set(sideRoles).size !== sideRoles.length
      || event.participants.some(entry => !isId(entry.role))) {
      throw new Error(`Invalid participants for event: ${event.id}`);
    }
    for (const id of [...participants, ...(event.eligibleSubjectIds ?? [])]) {
      if (this.require('participant', id).sportId !== event.sportId) {
        throw new Error(`Participant ${id} belongs to another sport for event: ${event.id}`);
      }
    }
  }
}
