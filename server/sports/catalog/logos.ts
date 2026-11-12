import { SportsCatalog } from './catalog.js';
import { identity, isTimestamp, sourceKey } from './identity.js';
import type { ProviderRef } from './types.js';

export type LogoEntityKind = 'competition' | 'participant';
export const LOGO_SOURCES = {
  theSportsDb: { provider: 'thesportsdb', namespace: 'v1' },
  apiSportsFootball: { provider: 'api-sports', namespace: 'football' },
} as const;

export interface LogoLookup extends ProviderRef {
  readonly kind: LogoEntityKind;
  readonly fetchedAtMs: number;
  /** Raw decoded response from a lookup by exact external ID. */
  readonly payload: unknown;
}

export interface VerifiedLogo extends ProviderRef {
  readonly kind: LogoEntityKind;
  readonly canonicalId: string;
  readonly url: string;
  readonly fetchedAtMs: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function exactExternalId(value: unknown, expected: string): boolean {
  return value === expected || (typeof value === 'number' && Number.isSafeInteger(value) && String(value) === expected);
}

function trustedUrl(value: unknown, hosts: readonly string[]): URL | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && hosts.includes(url.hostname)) return url;
  } catch {
    return undefined;
  }
  return undefined;
}

function verifiedUrl(lookup: LogoLookup): string | undefined {
  const { source, kind, externalId } = lookup;
  const payload = record(lookup.payload);
  if (sourceKey(source) === sourceKey(LOGO_SOURCES.theSportsDb)) {
    const rows = payload?.[kind === 'competition' ? 'leagues' : 'teams'];
    const row = Array.isArray(rows) && rows.length === 1 ? record(rows[0]) : undefined;
    const id = row?.[kind === 'competition' ? 'idLeague' : 'idTeam'];
    if (!exactExternalId(id, externalId)) return undefined;
    const url = trustedUrl(row?.strBadge, ['www.thesportsdb.com', 'thesportsdb.com', 'r2.thesportsdb.com']);
    const collection = kind === 'competition' ? 'league' : 'team';
    const badgePath = new RegExp(`^/images/media/${collection}/badge/[a-zA-Z0-9_-]+[.](png|webp|jpe?g)$`);
    if (url && badgePath.test(url.pathname)) return url.href;
    return undefined;
  }

  if (sourceKey(source) !== sourceKey(LOGO_SOURCES.apiSportsFootball)) return undefined;
  const errors = payload?.errors;
  if (errors != null && (!record(errors) && !Array.isArray(errors) || Object.keys(errors).length)) return undefined;
  const rows = payload?.response;
  const envelope = Array.isArray(rows) && rows.length === 1 ? record(rows[0]) : undefined;
  const row = record(envelope?.[kind === 'competition' ? 'league' : 'team']);
  if (!exactExternalId(row?.id, externalId)) return undefined;
  const collection = kind === 'competition' ? 'leagues' : 'teams';
  const url = trustedUrl(row?.logo, ['media.api-sports.io']);
  if (url?.pathname === `/football/${collection}/${externalId}.png`) return url.href;
  return undefined;
}

type LogoCandidates = { fetchedAtMs: number; byIdentity: Map<string, VerifiedLogo | undefined> };

export class SportsLogoCatalog {
  private readonly logos = new Map<string, LogoCandidates>();

  constructor(catalog: SportsCatalog, lookups: readonly LogoLookup[]) {
    for (const lookup of lookups) {
      const { kind, source, externalId, fetchedAtMs } = lookup;
      if (!isTimestamp(fetchedAtMs)) continue;
      const entity = catalog.resolve(kind, lookup);
      if (!entity.ok || (kind === 'participant' && !('kind' in entity.value && entity.value.kind === 'team'))) continue;
      const key = identity(kind, entity.value.id, sourceKey(source));
      const previous = this.logos.get(key);
      if (previous && previous.fetchedAtMs > fetchedAtMs) continue;
      const candidates = previous?.fetchedAtMs === fetchedAtMs ? previous : { fetchedAtMs, byIdentity: new Map() };
      const url = verifiedUrl(lookup);
      if (url) {
        candidates.byIdentity.set(identity(externalId, url), { kind, canonicalId: entity.value.id, source, externalId, url, fetchedAtMs });
      } else {
        // A missing or invalid response at the newest timestamp invalidates older assets.
        candidates.byIdentity.set(identity(externalId, null), undefined);
      }
      this.logos.set(key, candidates);
    }
  }

  get(kind: LogoEntityKind, canonicalId: string, allow: (logo: VerifiedLogo) => boolean = () => true): VerifiedLogo | undefined {
    for (const source of [LOGO_SOURCES.theSportsDb, LOGO_SOURCES.apiSportsFootball]) {
      const candidates = this.logos.get(identity(kind, canonicalId, sourceKey(source)))?.byIdentity;
      if (candidates?.size === 1) {
        const logo = candidates.values().next().value;
        if (logo && allow(logo)) return logo;
      }
    }
    return undefined;
  }
}
