import { SportsCatalog } from './catalog.js';
import { identity, sourceKey } from './identity.js';
import { LOGO_SOURCES, SportsLogoCatalog } from './logos.js';
import type { LogoEntityKind, LogoLookup, VerifiedLogo } from './logos.js';
import type { CatalogDefinition, ProviderSource } from './types.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MAX_PARALLEL = 4;
const MAX_CACHE_ENTRIES = 512;
const MAX_RESPONSE_BYTES = 128 * 1024;

export interface FootballLogoRefs {
  readonly source: ProviderSource;
  readonly sportId: string;
  readonly competitionId: string | null;
  readonly homeId: string | null;
  readonly awayId: string | null;
}

export interface FootballLogos {
  readonly competitionId: string | null;
  readonly competition: string | null;
  readonly home: string | null;
  readonly away: string | null;
}

/** Approval for this exact asset and use. Identity review alone does not grant image rights. */
export interface LogoPublicationApproval {
  readonly kind: LogoEntityKind;
  readonly canonicalId: string;
  readonly source: ProviderSource;
  readonly externalId: string;
  readonly url: string;
  readonly evidence: string;
}

interface Options {
  readonly approvals?: readonly LogoPublicationApproval[];
  readonly seeds?: readonly LogoLookup[];
  readonly theSportsDbKey?: string;
  readonly apiSportsKey?: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

type SourceConfig = {
  readonly source: ProviderSource;
  readonly key: string | undefined;
  readonly perMinute: number;
  readonly perDay: number;
  started: number[];
  blockedUntil: number;
};

type CacheEntry = { logo?: VerifiedLogo; expires: number };
type LogoReadMode = 'refresh' | 'cache-only';

export class FootballLogoService {
  private readonly catalog: SportsCatalog;
  private readonly sources: readonly SourceConfig[];
  private readonly approvals = new Map<string, Set<string>>();
  private readonly refs = new Map<string, Set<string>>();
  private readonly cached = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<VerifiedLogo | undefined>>();
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(definition: CatalogDefinition, options: Options = {}) {
    this.catalog = new SportsCatalog(definition);
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.sources = [
      {
        source: LOGO_SOURCES.theSportsDb,
        key: checkedKey(options.theSportsDbKey ?? process.env.THESPORTSDB_API_KEY),
        perMinute: 12, perDay: 2880, started: [], blockedUntil: 0,
      },
      {
        source: LOGO_SOURCES.apiSportsFootball,
        key: checkedKey(options.apiSportsKey ?? process.env.API_SPORTS_FOOTBALL_KEY),
        perMinute: 6, perDay: 60, started: [], blockedUntil: 0,
      },
    ];
    const supportedSources = new Set(this.sources.map(({ source }) => sourceKey(source)));
    for (const ref of definition.aliases) {
      if ((ref.kind !== 'participant' && ref.kind !== 'competition') || !supportedSources.has(sourceKey(ref.source))) continue;
      if (this.resolve(ref.kind, ref.source, ref.externalId) !== ref.canonicalId) continue;
      const key = this.entityKey(ref.kind, ref.canonicalId, ref.source);
      const ids = this.refs.get(key) ?? new Set();
      ids.add(ref.externalId);
      this.refs.set(key, ids);
    }
    for (const approval of options.approvals ?? []) {
      if (!approval.evidence.trim()) continue;
      const key = this.entityKey(approval.kind, approval.canonicalId, approval.source);
      const ids = this.refs.get(key);
      if (ids?.size !== 1 || !ids.has(approval.externalId) || !/^[1-9]\d{0,19}$/.test(approval.externalId)) continue;
      const urls = this.approvals.get(key) ?? new Set();
      urls.add(approval.url);
      this.approvals.set(key, urls);
    }
    // Resolve the full seed snapshot together so conflicting seed revisions fail closed.
    const seeds = new SportsLogoCatalog(this.catalog, options.seeds ?? []);
    for (const [key, urls] of this.approvals) {
      const [kind, canonicalId, logoSource] = JSON.parse(key) as [LogoEntityKind, string, string];
      const logo = seeds.get(kind, canonicalId, (asset) => sourceKey(asset.source) === logoSource);
      if (logo && urls.has(logo.url) && logo.fetchedAtMs <= this.now()) {
        this.cache(key, { logo, expires: logo.fetchedAtMs + 7 * DAY });
      }
    }
  }

  async forEvent(event: FootballLogoRefs, mode: LogoReadMode = 'refresh'): Promise<FootballLogos> {
    const sport = this.catalog.resolve('sport', { source: event.source, externalId: event.sportId });
    if (!sport.ok || sport.value.id !== 'football') {
      return { competitionId: null, competition: null, home: null, away: null };
    }
    const competitionId = this.resolve('competition', event.source, event.competitionId);
    const homeId = this.resolve('participant', event.source, event.homeId);
    const awayId = this.resolve('participant', event.source, event.awayId);
    const conflictingSides = homeId !== null && homeId === awayId;
    const [competition, home, away] = await Promise.all([
      this.forEntity('competition', competitionId, mode),
      this.forEntity('participant', conflictingSides ? null : homeId, mode),
      this.forEntity('participant', conflictingSides ? null : awayId, mode),
    ]);
    return { competitionId, competition, home, away };
  }

  private resolve(kind: LogoEntityKind, source: ProviderSource, externalId: string | null): string | null {
    if (!externalId) return null;
    const entity = this.catalog.resolve(kind, { source, externalId });
    if (!entity.ok || entity.value.sportId !== 'football') return null;
    if ('kind' in entity.value && entity.value.kind !== 'team') return null;
    return entity.value.id;
  }

  private entityKey(kind: LogoEntityKind, id: string, source: ProviderSource): string {
    return identity(kind, id, sourceKey(source));
  }

  private async forEntity(kind: LogoEntityKind, canonicalId: string | null, mode: LogoReadMode): Promise<string | null> {
    if (!canonicalId) return null;
    for (const config of this.sources) {
      const key = this.entityKey(kind, canonicalId, config.source);
      const allowed = this.approvals.get(key);
      if (!allowed?.size) continue;
      const id = this.refs.get(key)?.values().next().value;
      if (!id) continue;
      const current = this.cached.get(key);
      const fresh = current && current.expires > this.now();
      const logo = fresh ? current.logo : mode === 'refresh'
        ? await this.refresh(config, key, kind, id, canonicalId)
        : undefined;
      if (logo && allowed.has(logo.url)) return logo.url;
    }
    return null;
  }

  private cache(key: string, entry: CacheEntry): void {
    this.cached.delete(key);
    if (this.cached.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cached.keys().next().value;
      if (oldest !== undefined) this.cached.delete(oldest);
    }
    this.cached.set(key, entry);
  }

  private async refresh(config: SourceConfig, cacheKey: string, kind: LogoEntityKind, id: string, canonicalId: string) {
    const pending = this.pending.get(cacheKey);
    if (pending) return pending;
    const started = this.now();
    if (!config.key || this.pending.size >= MAX_PARALLEL || started < config.blockedUntil) return;
    config.started = config.started.filter((at) => at > started - DAY);
    if (config.started.length >= config.perDay
      || config.started.filter((at) => at > started - MINUTE).length >= config.perMinute) return;

    config.started.push(started);
    const run = this.fetchLogo(config, kind, id, canonicalId).then((entry) => {
      this.cache(cacheKey, entry);
      return entry.logo;
    }).finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, run);
    return run;
  }

  private async fetchLogo(config: SourceConfig, kind: LogoEntityKind, id: string, canonicalId: string): Promise<CacheEntry> {
    const isSportsDb = config.source === LOGO_SOURCES.theSportsDb;
    const collection = kind === 'competition' ? 'league' : 'team';
    const url = isSportsDb
      ? new URL(`https://www.thesportsdb.com/api/v1/json/${config.key}/lookup${collection}.php`)
      : new URL(`https://v3.football.api-sports.io/${collection}s`);
    url.searchParams.set('id', id);
    const headers = new Headers({ Accept: 'application/json' });
    if (!isSportsDb && config.key) headers.set('x-apisports-key', config.key);
    try {
      const response = await this.fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(2000) });
      if (response.status === 429) {
        const now = this.now();
        config.blockedUntil = Math.max(config.blockedUntil, retryAfter(response.headers.get('retry-after'), now));
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { expires: this.now() + (response.status === 404 ? 60 : 1) * MINUTE };
      }
      const payload = await boundedJson(response);
      const fetchedAtMs = this.now();
      const lookup = { kind, source: config.source, externalId: id, fetchedAtMs, payload };
      const logo = new SportsLogoCatalog(this.catalog, [lookup]).get(kind, canonicalId);
      return { logo, expires: fetchedAtMs + (logo ? 7 * DAY : 60 * MINUTE) };
    } catch {
      return { expires: this.now() + MINUTE };
    }
  }
}

function checkedKey(key: string | undefined): string | undefined {
  return key && /^[a-zA-Z0-9_-]{1,100}$/.test(key) ? key : undefined;
}

function retryAfter(value: string | null, now: number): number {
  if (!value) return now + MINUTE;
  const timestamp = /^\d{1,10}$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(now + MINUTE, timestamp) : now + MINUTE;
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
  } finally {
    reader.releaseLock();
  }
}
