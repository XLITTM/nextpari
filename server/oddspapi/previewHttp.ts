import { timingSafeEqual } from 'node:crypto';
import {
  canonicalFixtureView,
  indexV5Markets,
  isV5SportId,
  presentV5Quotes,
  sevenSportCategories,
} from './canonical.js';
import { OddsPapiV5TrialReader, type V5ReaderOptions } from './v5TrialClient.js';

export const ODDSPAPI_V5_PREVIEW_PATH = '/api/internal/oddspapi-v5-preview';
export const ODDSPAPI_V5_PREVIEW_HEADER = 'x-oddspapi-v5-preview-key';

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export interface OddsPapiPreviewRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

export interface OddsPapiPreviewResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function headerValue(headers: OddsPapiPreviewRequest['headers'], name: string): string {
  if (!headers) return '';
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== want) continue;
    return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return '';
}

function keysEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Browser demo is preview-only. Production and local public servers stay closed. */
export function isOddsPapiV5DemoEnabled(env: NodeJS.ProcessEnv): boolean {
  if (String(env.VERCEL_ENV ?? '').trim() !== 'preview') return false;
  if (String(env.ODDSPAPI_V5_READONLY_PREVIEW ?? '').trim() !== '1') return false;
  if (String(env.ODDSPAPI_V5_API_KEY ?? '').trim().length < 20) return false;
  return true;
}

export function isOddsPapiV5PreviewEnabled(env: NodeJS.ProcessEnv): boolean {
  if (String(env.VERCEL_ENV ?? '').trim() === 'production') return false;
  if (String(env.ODDSPAPI_V5_READONLY_PREVIEW ?? '').trim() !== '1') return false;
  if (!String(env.ODDSPAPI_V5_PREVIEW_KEY ?? '').trim()) return false;
  const vercel = String(env.VERCEL_ENV ?? '').trim();
  const nodeEnv = String(env.NODE_ENV ?? '').trim();
  if (vercel === 'preview' || vercel === 'development') return true;
  return !vercel && (nodeEnv === 'development' || nodeEnv === 'test');
}

function notFound(): OddsPapiPreviewResponse {
  return { status: 404, body: { ok: false, error: 'NOT_FOUND' }, headers: PRIVATE_HEADERS };
}

function queryFrom(input: OddsPapiPreviewRequest): URLSearchParams {
  if (input.url) {
    try {
      return new URL(input.url, 'http://127.0.0.1').searchParams;
    } catch {
      // Fall through to the explicit query object.
    }
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (typeof value === 'string') params.set(key, value);
  }
  return params;
}

function sportIdFrom(params: URLSearchParams): number | null {
  const sportId = Number(params.get('sportId'));
  return Number.isInteger(sportId) && isV5SportId(sportId) ? sportId : null;
}

function statusFor(error: string | null, ok: boolean): number {
  if (ok) return 200;
  if (error === 'NOT_CONFIGURED') return 503;
  if (error === 'RATE_LIMITED') return 429;
  if (error === 'TIMEOUT') return 504;
  return 502;
}

export async function handleOddsPapiV5PreviewRequest(
  input: OddsPapiPreviewRequest,
  env: NodeJS.ProcessEnv = process.env,
  reader?: OddsPapiV5TrialReader,
  now = Date.now(),
): Promise<OddsPapiPreviewResponse> {
  if (String(input.method ?? 'GET').toUpperCase() !== 'GET') return notFound();
  if (!isOddsPapiV5PreviewEnabled(env)) return notFound();
  const expected = String(env.ODDSPAPI_V5_PREVIEW_KEY ?? '').trim();
  const provided = headerValue(input.headers, ODDSPAPI_V5_PREVIEW_HEADER).trim();
  if (!keysEqual(provided, expected)) return notFound();

  const params = queryFrom(input);
  const view = params.get('view') ?? 'sports';
  const base = {
    provider: 'oddspapi-v5',
    bookmaker: '1xbet',
    betsAccepted: false,
    websocket: 'not-running',
  };
  if (view === 'sports') {
    return {
      status: 200,
      headers: PRIVATE_HEADERS,
      body: { ok: true, ...base, sports: sevenSportCategories() },
    };
  }

  const client = reader ?? new OddsPapiV5TrialReader({ env } satisfies V5ReaderOptions);
  if (view === 'today' || view === 'live' || view === 'markets') {
    const sportId = sportIdFrom(params);
    if (sportId === null) return notFound();
    const result = view === 'markets'
      ? await client.markets(sportId)
      : view === 'live'
        ? await client.live(sportId)
        : await client.today(sportId);
    if (!result.ok || !result.data) {
      return { status: statusFor(result.error, false), headers: PRIVATE_HEADERS, body: { ok: false, ...base, error: result.error } };
    }
    if (view === 'markets') {
      const catalog = indexV5Markets(result.data);
      return {
        status: 200,
        headers: PRIVATE_HEADERS,
        body: { ok: true, ...base, sportId, marketCount: catalog.byId.size, ambiguousMarkets: catalog.ambiguous.size },
      };
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    const fixtures = rows.map(canonicalFixtureView).filter((item) => item !== null).slice(0, 40);
    return {
      status: 200,
      headers: PRIVATE_HEADERS,
      body: {
        ok: true,
        ...base,
        sportId,
        phase: view,
        fixtureCount: fixtures.length,
        withOdds: fixtures.filter((item) => item.hasOdds && !item.staleOdds && !item.suspended).length,
        fixtures,
      },
    };
  }

  if (view === 'odds') {
    const fixtureId = params.get('fixtureId') ?? '';
    const result = await client.fixtureOdds(fixtureId);
    if (!result.ok || !result.data) {
      return { status: statusFor(result.error, false), headers: PRIVATE_HEADERS, body: { ok: false, ...base, error: result.error } };
    }
    const fixture = canonicalFixtureView(result.data);
    if (!fixture || fixture.sportId === null || !isV5SportId(fixture.sportId)) {
      return { status: 200, headers: PRIVATE_HEADERS, body: { ok: true, ...base, fixture, quotes: [], rejected: 1 } };
    }
    const markets = await client.markets(fixture.sportId);
    if (!markets.ok || !markets.data) {
      return { status: statusFor(markets.error, false), headers: PRIVATE_HEADERS, body: { ok: false, ...base, error: markets.error } };
    }
    const presented = presentV5Quotes(result.data, indexV5Markets(markets.data), now);
    return {
      status: 200,
      headers: PRIVATE_HEADERS,
      body: {
        ok: true,
        ...base,
        fixture,
        quotes: presented.accepted.slice(0, 80),
        rejected: presented.rejected,
      },
    };
  }

  return notFound();
}

/**
 * Same read-only feed as the key-gated preview, for the protected Vercel Preview UI.
 * The browser never receives the provider key or the preview key.
 */
export async function handleOddsPapiV5DemoRequest(
  input: OddsPapiPreviewRequest,
  env: NodeJS.ProcessEnv = process.env,
  reader?: OddsPapiV5TrialReader,
  now = Date.now(),
): Promise<OddsPapiPreviewResponse> {
  if (String(input.method ?? 'GET').toUpperCase() !== 'GET') return notFound();
  if (!isOddsPapiV5DemoEnabled(env)) return notFound();
  const params = queryFrom(input);
  const response = await handleOddsPapiV5PreviewRequest(
    {
      method: 'GET',
      url: `${ODDSPAPI_V5_PREVIEW_PATH}?${params.toString()}`,
      headers: { [ODDSPAPI_V5_PREVIEW_HEADER]: String(env.ODDSPAPI_V5_PREVIEW_KEY ?? '') },
    },
    { ...env, VERCEL_ENV: 'preview' },
    reader,
    now,
  );
  return {
    ...response,
    body: {
      ...response.body,
      demo: true,
      readOnly: true,
      betsAccepted: false,
      walletEnabled: false,
    },
  };
}
