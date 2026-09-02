import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { LsportsBrowserFeed } from './payload.js';
import { allowVercelPreviewOrigins, corsOriginForRequest, resolveAllowedOrigins } from './cors.js';
import {
  LSPORTS_HTTP_HEALTH_RATE_MAX,
  LSPORTS_HTTP_INPLAY_RATE_MAX,
  LsportsHttpRateLimiter,
  clientKey,
} from './rateLimitHttp.js';

export const LSPORTS_SHADOW_HOST = '127.0.0.1';
export const LSPORTS_SHADOW_PORT = 8787;
export const LSPORTS_REMOTE_HTTP_HOST = '0.0.0.0';

export type LsportsHttpMode = 'local' | 'remote';

export interface LsportsHttpOptions {
  mode: LsportsHttpMode;
  host: string;
  port: number;
  allowedOrigins: string[];
  allowVercelPreviews: boolean;
  enableStream: boolean;
}

export function resolveLsportsHttpOptions(env: NodeJS.ProcessEnv = process.env): LsportsHttpOptions {
  const mode: LsportsHttpMode = env.LSPORTS_WORKER_MODE === 'remote' ? 'remote' : 'local';
  const port = Number(env.PORT || env.LSPORTS_SHADOW_PORT || LSPORTS_SHADOW_PORT);
  const host = env.LSPORTS_HTTP_HOST
    || (mode === 'remote' ? LSPORTS_REMOTE_HTTP_HOST : LSPORTS_SHADOW_HOST);
  return {
    mode,
    host,
    port: Number.isInteger(port) && port > 0 ? port : LSPORTS_SHADOW_PORT,
    allowedOrigins: resolveAllowedOrigins(env, mode),
    allowVercelPreviews: allowVercelPreviewOrigins(env),
    enableStream: mode === 'local',
  };
}

function pathOf(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0] ?? '';
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  options: LsportsHttpOptions,
): void {
  const origin = req.headers?.origin;
  const allowed = corsOriginForRequest(
    typeof origin === 'string' ? origin : undefined,
    options.allowedOrigins,
    options.allowVercelPreviews,
  );
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function writeJson(
  req: IncomingMessage,
  res: ServerResponse,
  options: LsportsHttpOptions,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applyCors(req, res, options);
  res.end(JSON.stringify(body));
}

function safeHttpError(error: unknown): { error: string } {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  if (code === 'rate-limited') return { error: 'rate-limited' };
  return { error: 'unavailable' };
}

export function handleLsportsShadowRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getPayload: () => LsportsBrowserFeed,
  subscribe?: (listener: (payload: LsportsBrowserFeed) => void) => () => void,
  options: LsportsHttpOptions = resolveLsportsHttpOptions(),
  limiter: LsportsHttpRateLimiter = new LsportsHttpRateLimiter(),
): boolean {
  const path = pathOf(req);
  const inplay = path === '/inplay' || path === '/api/lsports/inplay';
  const health = path === '/health' || path === '/api/lsports/health';
  const stream = path === '/stream' || path === '/api/lsports/stream';
  if (stream && !options.enableStream) return false;
  if (!inplay && !health && !stream) return false;

  try {
    applyCors(req, res, options);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== 'GET') {
      writeJson(req, res, options, 405, { error: 'method-not-allowed' });
      return true;
    }

    const key = `${clientKey(req)}:${inplay ? 'inplay' : health ? 'health' : 'stream'}`;
    const max = health ? LSPORTS_HTTP_HEALTH_RATE_MAX : LSPORTS_HTTP_INPLAY_RATE_MAX;
    if (!limiter.allow(key, max)) {
      res.setHeader('Retry-After', '60');
      writeJson(req, res, options, 429, { error: 'rate-limited' });
      return true;
    }

    const payload = getPayload();
    if (health) {
      writeJson(req, res, options, 200, {
        source: payload.source,
        generatedAt: payload.generatedAt,
        ...payload.diagnostics,
        health: payload.health,
      });
      return true;
    }
    if (inplay) {
      writeJson(req, res, options, 200, payload);
      return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (!subscribe) return true;
    const unsubscribe = subscribe((next) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(next)}\n\n`);
    });
    req.on('close', unsubscribe);
    return true;
  } catch (error) {
    writeJson(req, res, options, 500, safeHttpError(error));
    return true;
  }
}

export function createLsportsShadowHttpServer(
  getPayload: () => LsportsBrowserFeed,
  subscribe: (listener: (payload: LsportsBrowserFeed) => void) => () => void,
  options: LsportsHttpOptions = resolveLsportsHttpOptions(),
): Server {
  const limiter = new LsportsHttpRateLimiter();
  return createServer((req, res) => {
    try {
      if (!handleLsportsShadowRequest(req, res, getPayload, subscribe, options, limiter)) {
        writeJson(req, res, options, 404, { error: 'not-found' });
      }
    } catch {
      writeJson(req, res, options, 500, { error: 'unavailable' });
    }
  });
}
