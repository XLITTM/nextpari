import { createHash } from 'node:crypto';
import { casinoCategories, casinoDemoPath, type CasinoDemoGame } from '../../src/lib/casinoDemo.js';
import { StaffOnboardingError, staffError } from '../staff/errors.js';

const endpoint = 'https://api.softaggregator.com/api/v1';
const catalogTtl = 10 * 60_000;
const maxResponse = 64 * 1024 * 1024;
type Raw = Record<string, unknown>;
type Entry = { game: CasinoDemoGame; sourceId: string };
type CatalogCounts = {
  returned: number; demoTrue: number; demoFalse: number; demoOne: number;
  demoOther: number; demoMissing: number; categories: Record<string, number>;
};

export const asRecord = (value: unknown): Raw =>
  value != null && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};

function text(value: unknown, limit: number): string {
  return typeof value === 'string' && value.length <= limit ? value.trim() : '';
}

function httpsUrl(value: unknown): URL | null {
  try {
    const url = new URL(text(value, 8192));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

function origins(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').flatMap((raw) => {
    const url = httpsUrl(raw);
    return url && url.pathname === '/' && !url.search && !url.hash ? [url.origin] : [];
  }));
}

export function normalizeCatalog(payload: unknown, artworkOrigins: ReadonlySet<string>): Entry[] {
  if (!Array.isArray(payload)) throw staffError('CASINO_DEMO_RESPONSE_INVALID', 502);
  const games = new Map<string, Entry>();
  const conflicting = new Set<string>();
  for (const item of payload) {
    const row = asRecord(item);
    const provider = text(row.provider, 100);
    const sourceId = typeof row.id_hash === 'string' && row.id_hash.length <= 512 ? row.id_hash : '';
    const title = text(row.name, 250);
    const category = text(row.game_type, 30) as CasinoDemoGame['category'];
    if (row.play_for_fun_supported !== true || !provider || !sourceId.trim() || !title ||
        !Object.prototype.hasOwnProperty.call(casinoCategories, category)) continue;
    const id = 'sa-' + createHash('sha256').update(JSON.stringify([provider, sourceId])).digest('hex').slice(0, 32);
    const art = httpsUrl(row.image);
    const image = art && artworkOrigins.has(art.origin) && !art.search && !art.hash ? art.href : null;
    const studio = text(row.provider_name, 140) || provider;
    const next: Entry = { sourceId, game: { id, provider, title, category, studio, image, demo: true, mobile: null } };
    const prior = games.get(id);
    if (prior && (prior.game.category !== category || prior.game.title !== title)) conflicting.add(id);
    else if (!prior) games.set(id, next);
  }
  return [...games.values()].filter(({ game }) => !conflicting.has(game.id));
}

function catalogCounts(rows: unknown[]): CatalogCounts {
  const counts: CatalogCounts = { returned: rows.length, demoTrue: 0, demoFalse: 0,
    demoOne: 0, demoOther: 0, demoMissing: 0, categories: {} };
  for (const item of rows) {
    const row = asRecord(item);
    const flag = row.play_for_fun_supported;
    if (flag === true) counts.demoTrue++;
    else if (flag === false) counts.demoFalse++;
    else if (flag === 1 || flag === '1' || flag === 'true') counts.demoOne++;
    else if (flag == null) counts.demoMissing++;
    else counts.demoOther++;
    const category = text(row.game_type, 30);
    const key = Object.prototype.hasOwnProperty.call(casinoCategories, category) ? category : 'unrecognized';
    counts.categories[key] = (counts.categories[key] ?? 0) + 1;
  }
  return counts;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > maxResponse || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw staffError('CASINO_DEMO_RESPONSE_INVALID', 502);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxResponse) throw staffError('CASINO_DEMO_RESPONSE_INVALID', 502);
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createSoftAggregator(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch, now = Date.now) {
  const login = env.SOFTAGGREGATOR_DEMO_LOGIN;
  const password = env.SOFTAGGREGATOR_DEMO_PASSWORD;
  const artworkOrigins = origins(env.SOFTAGGREGATOR_ARTWORK_ORIGINS);
  const launchOrigins = origins(env.SOFTAGGREGATOR_LAUNCH_ORIGINS);
  const enabled = env.SOFTAGGREGATOR_DEMO_ENABLED === '1' && Boolean(login && password);
  type Snapshot = { expires: number; games: Entry[]; counts?: CatalogCounts };
  let cached: Snapshot | undefined;
  let inflight: Promise<Snapshot> | undefined;
  let cooldown = 0;

  async function call(method: 'getGameList' | 'getGameDemo', payload: Raw = {}): Promise<unknown> {
    if (!enabled) throw staffError('CASINO_DEMO_DISABLED', 503);
    if (cooldown > now()) throw staffError('CASINO_DEMO_RATE_LIMITED', 429);
    let result: unknown;
    try {
      const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, method, api_login: login, api_password: password }),
      });
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After') ?? '';
        const seconds = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - now()) / 1000;
        await response.body?.cancel().catch(() => {});
        cooldown = now() + Math.min(300, Math.max(1, Number.isFinite(seconds) ? seconds : 30)) * 1000;
        throw staffError('CASINO_DEMO_RATE_LIMITED', 429);
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw staffError('CASINO_DEMO_UPSTREAM', 502);
      }
      result = await readBoundedJson(response);
    } catch (error) {
      if (error instanceof StaffOnboardingError) throw error;
      throw staffError('CASINO_DEMO_UPSTREAM', 502);
    }
    const row = asRecord(result);
    if (row.error !== 0) throw staffError('CASINO_DEMO_PROVIDER_DENIED', 502);
    return row.response;
  }

  async function catalog(): Promise<Snapshot> {
    if (cached && cached.expires > now()) return cached;
    if (!inflight) inflight = call('getGameList')
      .then((response) => {
        const games = normalizeCatalog(response, artworkOrigins);
        const counts = env.VERCEL_ENV === 'preview' && Array.isArray(response) ? catalogCounts(response) : undefined;
        cached = { games, counts, expires: now() + catalogTtl };
        return cached;
      })
      .finally(() => { inflight = undefined; });
    return inflight;
  }

  return {
    async list(params: URLSearchParams) {
      const snapshot = await catalog();
      const term = (params.get('q') ?? '').trim().slice(0, 120).toLowerCase();
      const provider = (params.get('provider') ?? '').slice(0, 100);
      const category = (params.get('category') ?? '').slice(0, 30);
      const rawPage = params.get('page') ?? '';
      const page = /^\d{1,5}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;
      const games = snapshot.games.map(({ game }) => game);
      const matches = games.filter((game) => (!provider || game.provider === provider) &&
        (!category || game.category === category) &&
        (!term || `${game.title} ${game.studio}`.toLowerCase().includes(term)));
      return {
        games: matches.slice((page - 1) * 24, page * 24),
        providers: [...new Map(games.map((g) => [g.provider, { id: g.provider, name: g.studio }])).values()]
          .sort((a, b) => a.name.localeCompare(b.name)),
        categories: [...new Set(games.map((g) => g.category))],
        total: matches.length,
        nextPage: matches.length > page * 24 ? page + 1 : null,
        ...(params.get('diagnostics') === '1' && snapshot.counts ? { diagnostics: snapshot.counts } : {}),
      };
    },
    async launch(id: string, device: 'mobile' | 'desktop', returnOrigin: string) {
      const entry = (await catalog()).games.find(({ game }) => game.id === id);
      if (!entry) throw staffError('CASINO_DEMO_GAME_NOT_FOUND', 404);
      if (!launchOrigins.size) throw staffError('CASINO_DEMO_ORIGINS_UNCONFIGURED', 503);
      const result = await call('getGameDemo', {
        gameid: entry.sourceId, lang: 'ru', device, homeurl: returnOrigin + casinoDemoPath,
        play_for_fun: true,
      });
      const url = httpsUrl(result);
      if (!url || !launchOrigins.has(url.origin) || (login && url.href.includes(login)) ||
          (password && url.href.includes(password))) throw staffError('CASINO_DEMO_LAUNCH_INVALID', 502);
      return { title: entry.game.title, url: url.href };
    },
  };
}

export const softAggregator = createSoftAggregator(process.env);
