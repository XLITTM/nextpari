import { timingSafeEqual } from 'node:crypto';
import { BetsApiReadOnlyClient, getSharedBetsApiClient, type BetsApiReadOnlyClientOptions } from './client.js';
import type { FeedResult } from './types.js';

export const BETSAPI_PREVIEW_PATH = '/api/internal/betsapi-preview';
export const BETSAPI_PREVIEW_HEADER = 'x-betsapi-preview-key';

export interface PreviewRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

export interface PreviewResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

interface PreviewFeed {
  getInplay(): Promise<FeedResult>;
  getUpcoming(page?: number): Promise<FeedResult>;
  getEnded(day: string): Promise<FeedResult>;
  getEvent(eventId: string): Promise<FeedResult>;
}

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

function headerValue(headers: PreviewRequest['headers'], name: string): string {
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

export function isBetsApiPreviewEnabled(env: NodeJS.ProcessEnv): boolean {
  if (String(env.VERCEL_ENV ?? '').trim() === 'production') return false;
  if (String(env.BETSAPI_READONLY_PREVIEW ?? '').trim() !== '1') return false;
  if (!String(env.BETSAPI_PREVIEW_KEY ?? '').trim()) return false;
  const vercel = String(env.VERCEL_ENV ?? '').trim();
  const nodeEnv = String(env.NODE_ENV ?? '').trim();
  if (vercel === 'preview' || vercel === 'development') return true;
  return !vercel && (nodeEnv === 'development' || nodeEnv === 'test');
}

function notFound(): PreviewResponse {
  return { status: 404, body: { ok: false, error: 'NOT_FOUND' }, headers: PRIVATE_HEADERS };
}

function queryFrom(input: PreviewRequest): URLSearchParams {
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

function validDay(day: string): boolean {
  if (!/^\d{8}$/.test(day)) return false;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}

function todayUtc(now: number): string {
  const date = new Date(now);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}${month}${day}`;
}

function httpStatus(result: FeedResult): number {
  if (result.ok) return 200;
  if (result.error === 'TOKEN_MISSING') return 503;
  if (result.error === 'RATE_LIMITED') return 429;
  if (result.error === 'TIMEOUT') return 504;
  if (result.error === 'STALE') return 503;
  return 502;
}

export async function handleBetsApiPreviewRequest(
  input: PreviewRequest,
  env: NodeJS.ProcessEnv = process.env,
  client?: PreviewFeed,
  now = Date.now(),
): Promise<PreviewResponse> {
  if (String(input.method ?? 'GET').toUpperCase() !== 'GET') return notFound();
  if (!isBetsApiPreviewEnabled(env)) return notFound();
  const expected = String(env.BETSAPI_PREVIEW_KEY ?? '').trim();
  const provided = headerValue(input.headers, BETSAPI_PREVIEW_HEADER).trim();
  if (!keysEqual(provided, expected)) return notFound();

  const params = queryFrom(input);
  const view = params.get('view') ?? 'inplay';
  const feedClient = client ?? getSharedBetsApiClient({ env } satisfies BetsApiReadOnlyClientOptions);
  let result: FeedResult;
  if (view === 'inplay') result = await feedClient.getInplay();
  else if (view === 'upcoming') result = await feedClient.getUpcoming(1);
  else if (view === 'ended') {
    const day = params.get('day') ?? todayUtc(now);
    if (!validDay(day)) return notFound();
    result = await feedClient.getEnded(day);
  } else if (view === 'event') {
    const eventId = params.get('eventId') ?? params.get('event_id') ?? '';
    if (!/^\d{1,20}$/.test(eventId)) return notFound();
    result = await feedClient.getEvent(eventId);
  } else {
    return notFound();
  }

  return {
    status: httpStatus(result),
    headers: PRIVATE_HEADERS,
    body: {
      ok: result.ok,
      error: result.error,
      upstreamStatus: result.upstreamStatus,
      feed: result.feed,
    },
  };
}

export function createPreviewClient(options: BetsApiReadOnlyClientOptions): PreviewFeed {
  return new BetsApiReadOnlyClient(options);
}
