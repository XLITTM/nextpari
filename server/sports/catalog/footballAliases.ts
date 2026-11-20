import { ESOCCER_PARTICIPANT_NAMES, FOOTBALL_CATALOG_SEEDS } from './footballCatalogSeed.js';
import { ownerFootballLogo } from './ownerFootballMedia.js';

export interface FootballAliasEntity {
  id: string;
  kind: 'competition' | 'team';
  country: string;
  officialName: string;
  russianName: string;
  providerIds: readonly string[];
  logo: string | null;
  identityStatus: 'verified_provider_id' | 'curated_placeholder_pending_provider_id';
}

export interface ArchiveAsset {
  canonicalId: string;
  file: string;
  approved: boolean;
}

export type AliasResolution =
  | { status: 'resolved'; entity: FootballAliasEntity }
  | { status: 'ambiguous' | 'unresolved' };

export type FootballNameClass = 'canonical' | 'esoccer' | 'unknown';

const PUBLISHED_FILES = new Set(['premier-league.png', 'arsenal.png', 'manchester-city.png']);
const APPROVED_LOGO = /^\/images\/sports\/football\/[a-z0-9-]+\.png$/;

function approvedLogo(seed: (typeof FOOTBALL_CATALOG_SEEDS)[number]): string | null {
  if (seed.logoStatus !== 'existing_published' || seed.providerId == null || !APPROVED_LOGO.test(seed.logoUrl ?? '')) return null;
  const file = seed.logoUrl?.split('/').pop();
  if (!file || !PUBLISHED_FILES.has(file)) return null;
  const owned = ownerFootballLogo(seed.kind === 'competition' ? 'competition' : 'participant', seed.providerId);
  return owned?.canonicalId === seed.id && owned.path === seed.logoUrl ? owned.path : null;
}

const ENTITIES: readonly FootballAliasEntity[] = FOOTBALL_CATALOG_SEEDS.map((seed) => ({
  id: seed.id,
  kind: seed.kind,
  country: seed.country,
  officialName: seed.officialName,
  russianName: seed.russianName,
  providerIds: seed.identityStatus === 'verified_provider_id' && seed.providerId != null ? [seed.providerId] : [],
  logo: approvedLogo(seed),
  identityStatus: seed.identityStatus,
}));

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

const byId = new Map(ENTITIES.map((entity) => [entity.id, entity]));
const byAlias = new Map<string, string[]>();
for (const seed of FOOTBALL_CATALOG_SEEDS) {
  for (const name of [seed.officialName, seed.russianName, ...seed.aliases]) {
    const key = normalize(name);
    const ids = byAlias.get(key) ?? [];
    if (!ids.includes(seed.id)) ids.push(seed.id);
    byAlias.set(key, ids);
  }
}

const esoccerNames = new Set(ESOCCER_PARTICIPANT_NAMES.map(normalize));

export function footballAliasEntities(): readonly FootballAliasEntity[] {
  return ENTITIES;
}

export function resolveFootballAlias(name: string): AliasResolution {
  if (esoccerNames.has(normalize(name))) return { status: 'unresolved' };
  const ids = byAlias.get(normalize(name)) ?? [];
  if (ids.length > 1) return { status: 'ambiguous' };
  const entity = ids.length === 1 ? byId.get(ids[0]) : undefined;
  return entity ? { status: 'resolved', entity } : { status: 'unresolved' };
}

export function resolveFootballProviderId(providerId: string): AliasResolution {
  const matches = ENTITIES.filter((entity) => entity.providerIds.includes(providerId));
  if (matches.length > 1) return { status: 'ambiguous' };
  return matches[0] ? { status: 'resolved', entity: matches[0] } : { status: 'unresolved' };
}

export function classifyFootballName(name: string): FootballNameClass {
  if (esoccerNames.has(normalize(name))) return 'esoccer';
  return resolveFootballAlias(name).status === 'resolved' ? 'canonical' : 'unknown';
}

export function reviewArchiveAsset(asset: ArchiveAsset): 'published' | 'awaiting-publication' | 'rejected' {
  if (!asset.approved || !byId.has(asset.canonicalId)) return 'rejected';
  return PUBLISHED_FILES.has(asset.file) ? 'published' : 'awaiting-publication';
}
