import { ownerFootballLogo } from './ownerFootballMedia.js';

export interface FootballAliasEntity {
  id: string;
  kind: 'competition' | 'team';
  country: 'eng' | 'at' | 'de';
  officialName: string;
  russianName: string;
  providerIds: readonly string[];
  logo: string | null;
}

export interface ArchiveAsset {
  canonicalId: string;
  file: string;
  approved: boolean;
}

export type AliasResolution =
  | { status: 'resolved'; entity: FootballAliasEntity }
  | { status: 'ambiguous' | 'unresolved' };

const ENTITIES: readonly FootballAliasEntity[] = [
  {
    id: 'football:eng:premier-league',
    kind: 'competition',
    country: 'eng',
    officialName: 'Premier League',
    russianName: 'Английская Премьер-лига',
    providerIds: ['94'],
    logo: ownerFootballLogo('competition', '94')?.path ?? null,
  },
  {
    id: 'football:eng:arsenal',
    kind: 'team',
    country: 'eng',
    officialName: 'Arsenal',
    russianName: 'Арсенал',
    providerIds: ['17230'],
    logo: ownerFootballLogo('participant', '17230')?.path ?? null,
  },
  {
    id: 'football:eng:manchester-city',
    kind: 'team',
    country: 'eng',
    officialName: 'Manchester City',
    russianName: 'Манчестер Сити',
    providerIds: ['708'],
    logo: ownerFootballLogo('participant', '708')?.path ?? null,
  },
  {
    id: 'football:at:bundesliga',
    kind: 'competition',
    country: 'at',
    officialName: 'Austrian Bundesliga',
    russianName: 'Австрийская Бундеслига',
    providerIds: [],
    logo: null,
  },
  {
    id: 'football:de:bundesliga',
    kind: 'competition',
    country: 'de',
    officialName: 'German Bundesliga',
    russianName: 'Немецкая Бундеслига',
    providerIds: [],
    logo: null,
  },
];

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  'football:eng:premier-league': ['Premier League', 'English Premier League', 'England Premier League', 'АПЛ', 'Английская Премьер-лига'],
  'football:eng:arsenal': ['Arsenal', 'Arsenal FC', 'Арсенал'],
  'football:eng:manchester-city': ['Manchester City', 'Manchester City FC', 'Man City', 'Манчестер Сити', 'Ман Сити'],
  'football:at:bundesliga': ['Austrian Bundesliga', 'Austria Bundesliga', 'Австрийская Бундеслига'],
  'football:de:bundesliga': ['German Bundesliga', 'Germany Bundesliga', 'Немецкая Бундеслига'],
};

const PUBLISHED_FILES = new Set(['premier-league.png', 'arsenal.png', 'manchester-city.png']);

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

const byId = new Map(ENTITIES.map((entity) => [entity.id, entity]));
const byAlias = new Map<string, string[]>();
for (const [id, names] of Object.entries(ALIASES)) {
  for (const name of names) {
    const key = normalize(name);
    const ids = byAlias.get(key) ?? [];
    if (!ids.includes(id)) ids.push(id);
    byAlias.set(key, ids);
  }
}

export function footballAliasEntities(): readonly FootballAliasEntity[] {
  return ENTITIES;
}

export function resolveFootballAlias(name: string): AliasResolution {
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

export function reviewArchiveAsset(asset: ArchiveAsset): 'published' | 'awaiting-publication' | 'rejected' {
  if (!asset.approved || !byId.has(asset.canonicalId)) return 'rejected';
  return PUBLISHED_FILES.has(asset.file) ? 'published' : 'awaiting-publication';
}
