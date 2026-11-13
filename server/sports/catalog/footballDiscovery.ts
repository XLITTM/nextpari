import { createHash } from 'node:crypto';
import { isEsoccerLeague, isSimulatedLeague } from '../../betsapi/footballCoverage.js';
import type { NormalizedEvent } from '../../betsapi/types.js';
import { classifyFootballName, footballAliasEntities, resolveFootballAlias, resolveFootballProviderId, type FootballAliasEntity } from './footballAliases.js';
import { FOOTBALL_CATALOG_SEEDS } from './footballCatalogSeed.js';

export type FootballCategory = 'senior' | 'youth' | 'reserve' | 'women' | 'esoccer' | 'simulated' | 'unknown';

export interface FootballProviderObservation {
  kind: 'competition' | 'team';
  providerId: string | null;
  rawProviderId: string | null;
  name: string;
  countryCode: string | null;
  category: FootballCategory;
  competitionProviderId: string | null;
  competitionName: string | null;
  endpoint: 'inplay' | 'upcoming' | 'ended' | 'event' | 'feed' | 'sample';
  observedAt: string;
}

export interface FootballReviewItem {
  reason:
    | 'unverified-provider-id'
    | 'country-mismatch'
    | 'category-separated'
    | 'ambiguous-name'
    | 'invalid-provider-data'
    | 'duplicate-provider-id'
    | 'provider-id-conflict';
  kind: 'competition' | 'team';
  providerId: string | null;
  name: string;
  countryCode: string | null;
  category: FootballCategory;
  candidateId: string | null;
  evidence: string;
}

export interface FootballProvisionalRecord {
  providerId: string;
  kind: 'competition' | 'team';
  name: string;
  countryCode: string | null;
  category: FootballCategory;
  canonicalId: null;
}

export interface FootballCatalogSnapshot {
  schema: 'nextpari.football-catalog-snapshot';
  revision: string;
  observedAt: string;
  source: string;
  countries: string[];
  observedCountries: string[];
  competitions: number;
  teams: number;
  verifiedProviderIds: string[];
  verifiedProviderIdsAdded: string[];
  canonicalEntities: Array<{
    id: string;
    kind: FootballAliasEntity['kind'];
    country: string;
    officialName: string;
    russianName: string;
    providerIds: string[];
    logo: string | null;
    identityStatus: FootballAliasEntity['identityStatus'];
  }>;
  provisional: FootballProvisionalRecord[];
  esoccer: FootballProvisionalRecord[];
  review: FootballReviewItem[];
  approvedLogos: string[];
  russianAliasCount: number;
  russianAliasesAdded: number;
}

const YOUTH = /\b(?:u[- ]?[12][0-9]|under[- ]?[12][0-9]|youth|academy)\b/i;
const RESERVE = /\b(?:reserves?|ii)\b/i;
const WOMEN = /\b(?:women|woman|ladies|feminine|femenina|femenino)\b|\(w\)/i;
const CATEGORY_RANK: Record<FootballCategory, number> = {
  esoccer: 7,
  simulated: 6,
  women: 5,
  youth: 4,
  reserve: 3,
  unknown: 2,
  senior: 1,
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function footballCategory(name: string | null | undefined, competitionName?: string | null): FootballCategory {
  const team = normalize(name ?? '');
  const competition = normalize(competitionName ?? '');
  const categories = [team, competition].map((value): FootballCategory => {
    if (!value) return 'unknown';
    if (isEsoccerLeague(value) || classifyFootballName(value) === 'esoccer') return 'esoccer';
    if (isSimulatedLeague(value)) return 'simulated';
    if (WOMEN.test(value)) return 'women';
    if (YOUTH.test(value)) return 'youth';
    if (RESERVE.test(value)) return 'reserve';
    return 'senior';
  });
  const known = categories.filter((category) => category !== 'unknown');
  const pool = known.length > 0 ? known : categories;
  return pool.sort((left, right) => CATEGORY_RANK[right] - CATEGORY_RANK[left])[0] ?? 'unknown';
}

function numericId(value: string | null | undefined): string | null {
  const id = value?.trim() ?? '';
  return /^\d{1,20}$/.test(id) ? id : null;
}

function countriesAgree(entityCountry: string, observed: string | null): boolean {
  if (!observed) return false;
  const left = entityCountry.toLowerCase();
  const right = observed.toLowerCase();
  return left === right || (left === 'eng' && (right === 'gb' || right === 'en'));
}

function entityView(entity: FootballAliasEntity): FootballCatalogSnapshot['canonicalEntities'][number] {
  return {
    id: entity.id,
    kind: entity.kind,
    country: entity.country,
    officialName: entity.officialName,
    russianName: entity.russianName,
    providerIds: [...entity.providerIds],
    logo: entity.logo,
    identityStatus: entity.identityStatus,
  };
}

function reviewKey(item: FootballReviewItem): string {
  return [item.reason, item.kind, item.providerId ?? '', normalize(item.name), item.candidateId ?? ''].join('|');
}

function provisionalKey(record: FootballProvisionalRecord): string {
  return `${record.kind}:${record.providerId}`;
}

export function observationsFromEvents(
  events: readonly NormalizedEvent[],
  endpoint: FootballProviderObservation['endpoint'],
  observedAt: string,
): FootballProviderObservation[] {
  const rows: FootballProviderObservation[] = [];
  for (const event of events) {
    if (event.sportId !== '1') continue;
    const competitionName = event.league.name;
    const competitionCategory = footballCategory(competitionName);
    rows.push({
      kind: 'competition',
      providerId: numericId(event.league.id),
      rawProviderId: event.league.id,
      name: competitionName ?? '',
      countryCode: event.league.countryCode,
      category: competitionCategory,
      competitionProviderId: numericId(event.league.id),
      competitionName,
      endpoint,
      observedAt,
    });
    for (const side of [event.home, event.away]) {
      rows.push({
        kind: 'team',
        providerId: numericId(side.id),
        rawProviderId: side.id,
        name: side.name,
        countryCode: event.league.countryCode,
        category: footballCategory(side.name, competitionName),
        competitionProviderId: numericId(event.league.id),
        competitionName,
        endpoint,
        observedAt,
      });
    }
  }
  return rows;
}

function decide(observation: FootballProviderObservation): FootballReviewItem | null {
  if (!observation.name.trim()) {
    return item(observation, 'invalid-provider-data', null, 'Provider row has no name.');
  }
  if (observation.rawProviderId && observation.providerId == null) {
    return item(observation, 'invalid-provider-data', null, 'Provider id is not a numeric BetsAPI Events id.');
  }
  if (observation.category === 'esoccer' || observation.category === 'simulated') return null;
  const verified = observation.providerId ? resolveFootballProviderId(observation.providerId) : { status: 'unresolved' as const };
  if (verified.status === 'resolved') {
    const sameName = resolveFootballAlias(observation.name);
    if (sameName.status === 'resolved' && sameName.entity.id !== verified.entity.id) {
      return item(observation, 'provider-id-conflict', verified.entity.id, 'This provider id already belongs to a different canonical entity.');
    }
    if (!countriesAgree(verified.entity.country, observation.countryCode) && observation.countryCode) {
      return item(observation, 'country-mismatch', verified.entity.id, 'Verified provider id was observed with a different country.');
    }
    return null;
  }
  const named = resolveFootballAlias(observation.name);
  if (named.status === 'ambiguous') {
    return item(observation, 'ambiguous-name', null, 'This name matches more than one canonical entity.');
  }
  if (named.status !== 'resolved' || named.entity.kind !== observation.kind) {
    if (normalize(observation.name) === 'bundesliga') {
      return item(observation, 'ambiguous-name', null, 'Bundesliga without a country stays unresolved.');
    }
    return null;
  }
  if (observation.category !== 'senior') {
    return item(observation, 'category-separated', named.entity.id, 'Youth, reserve, or women rows stay separate from the senior entity.');
  }
  if (observation.countryCode && !countriesAgree(named.entity.country, observation.countryCode)) {
    return item(observation, 'country-mismatch', named.entity.id, 'Exact name belongs to a different country.');
  }
  if (observation.providerId) {
    return item(observation, 'unverified-provider-id', named.entity.id, 'Exact name and country agree, and the provider id is not yet verified.');
  }
  return item(observation, 'unverified-provider-id', named.entity.id, 'Exact name agrees, and no provider id was supplied.');
}

function item(
  observation: FootballProviderObservation,
  reason: FootballReviewItem['reason'],
  candidateId: string | null,
  evidence: string,
): FootballReviewItem {
  return {
    reason,
    kind: observation.kind,
    providerId: observation.providerId,
    name: observation.name,
    countryCode: observation.countryCode,
    category: observation.category,
    candidateId,
    evidence,
  };
}

function remember(
  records: Map<string, FootballProvisionalRecord>,
  observation: FootballProviderObservation,
  review: FootballReviewItem[],
): void {
  if (!observation.providerId || !observation.name.trim()) return;
  if (resolveFootballProviderId(observation.providerId).status === 'resolved') return;
  const next: FootballProvisionalRecord = {
    providerId: observation.providerId,
    kind: observation.kind,
    name: observation.name,
    countryCode: observation.countryCode,
    category: observation.category,
    canonicalId: null,
  };
  const key = provisionalKey(next);
  const current = records.get(key);
  if (!current) {
    records.set(key, next);
    return;
  }
  if (normalize(current.name) !== normalize(next.name)) {
    review.push({
      reason: 'duplicate-provider-id',
      kind: next.kind,
      providerId: next.providerId,
      name: next.name,
      countryCode: next.countryCode,
      category: next.category,
      candidateId: null,
      evidence: `Provider id already recorded as ${current.name}.`,
    });
  }
}

export function synchronizeFootballCatalog(input: {
  previous?: Pick<FootballCatalogSnapshot, 'provisional' | 'esoccer'> | null;
  observations: readonly FootballProviderObservation[];
  observedAt: string;
  source: string;
}): FootballCatalogSnapshot {
  const provisional = new Map<string, FootballProvisionalRecord>();
  const esoccer = new Map<string, FootballProvisionalRecord>();
  for (const record of input.previous?.provisional ?? []) provisional.set(provisionalKey(record), record);
  for (const record of input.previous?.esoccer ?? []) esoccer.set(provisionalKey(record), record);
  const review: FootballReviewItem[] = [];
  const seenNames = new Map<string, string>();
  for (const observation of input.observations) {
    const decision = decide(observation);
    if (decision && !review.some((item) => reviewKey(item) === reviewKey(decision))) review.push(decision);
    if (observation.providerId && observation.name.trim()) {
      const seenKey = `${observation.kind}:${observation.providerId}`;
      const seen = seenNames.get(seenKey);
      if (seen && seen !== normalize(observation.name)) {
        const duplicate = item(observation, 'duplicate-provider-id', null, `Provider id was also observed as ${seen}.`);
        if (!review.some((entry) => reviewKey(entry) === reviewKey(duplicate))) review.push(duplicate);
      } else if (!seen) seenNames.set(seenKey, normalize(observation.name));
    }
    const bucket = observation.category === 'esoccer' || observation.category === 'simulated' ? esoccer : provisional;
    remember(bucket, observation, review);
  }
  const entities = footballAliasEntities().map(entityView);
  const countries = [...new Set([
    ...entities.map((entity) => entity.country),
    ...input.observations.map((observation) => observation.countryCode?.toLowerCase() ?? '').filter((code) => /^[a-z]{2}$/.test(code)),
  ])].sort();
  const competitionNames = new Set(input.observations.filter((observation) => observation.kind === 'competition' && observation.name.trim()).map((observation) => normalize(observation.name)));
  const teamNames = new Set(input.observations.filter((observation) => observation.kind === 'team' && observation.name.trim()).map((observation) => normalize(observation.name)));
  const russianAliasCount = FOOTBALL_CATALOG_SEEDS.reduce((count, seed) => {
    return count + [seed.russianName, ...seed.aliases].filter((name) => /\p{Script=Cyrillic}/u.test(name)).length;
  }, 0);
  const snapshot: FootballCatalogSnapshot = {
    schema: 'nextpari.football-catalog-snapshot',
    revision: '',
    observedAt: input.observedAt,
    source: input.source,
    countries,
    observedCountries: [...new Set(input.observations.map((observation) => observation.countryCode?.toLowerCase() ?? '').filter((code) => /^[a-z]{2}$/.test(code)))].sort(),
    competitions: competitionNames.size,
    teams: teamNames.size,
    verifiedProviderIds: entities.flatMap((entity) => entity.providerIds).sort(),
    verifiedProviderIdsAdded: [],
    canonicalEntities: entities,
    provisional: [...provisional.values()].sort((left, right) => provisionalKey(left).localeCompare(provisionalKey(right))),
    esoccer: [...esoccer.values()].sort((left, right) => provisionalKey(left).localeCompare(provisionalKey(right))),
    review: review.sort((left, right) => reviewKey(left).localeCompare(reviewKey(right))),
    approvedLogos: entities.flatMap((entity) => entity.logo ? [entity.logo] : []).sort(),
    russianAliasCount,
    russianAliasesAdded: 0,
  };
  snapshot.revision = createHash('sha256').update(JSON.stringify({
    entities: snapshot.canonicalEntities,
    provisional: snapshot.provisional,
    esoccer: snapshot.esoccer,
    review: snapshot.review,
  })).digest('hex');
  return snapshot;
}

export function publicFootballCatalog(snapshot: FootballCatalogSnapshot): FootballCatalogSnapshot {
  return snapshot;
}
