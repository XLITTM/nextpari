import type { IncomingMessage, ServerResponse } from 'node:http';
import { StaffOnboardingError, redactForLog } from '../staff/errors.js';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import { requestIsSecure } from './playerCookies.js';
import {
  listSportsBets,
  liveSportsPlacePorts,
  placeSportsBet,
  type SportsPlacePorts,
} from './sportsPlaceService.js';
import type { StaffLog } from '../staff/types.js';

export const PLAYER_SPORTS_PLACE_PATH = '/api/player/sports/place';
export const PLAYER_SPORTS_BETS_PATH = '/api/player/sports/bets';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPlayerSportsPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === PLAYER_SPORTS_PLACE_PATH || path === PLAYER_SPORTS_BETS_PATH;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: { status: number; body: Record<string, unknown>; cookies?: string[]; headers?: Record<string, string> }): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handlePlayerSportsRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: SportsPlacePorts,
  log: StaffLog = staffHttpLog,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number; body: Record<string, unknown>; cookies?: string[]; headers?: Record<string, string> }> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === PLAYER_SPORTS_PLACE_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return await placeSportsBet(ports, input.cookie, asRecord(parseJsonPayload(input.body)), secure, env);
    }
    if (path === PLAYER_SPORTS_BETS_PATH) {
      if (method !== 'GET') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return await listSportsBets(ports, input.cookie, secure);
    }
    throw new StaffOnboardingError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: {
          ...GAME_NO_STORE_HEADERS,
          ...(error.httpStatus === 405
            ? { Allow: path === PLAYER_SPORTS_PLACE_PATH ? 'POST' : 'GET' }
            : {}),
        },
      };
    }
    log.error('player_sports_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return {
      status: 500,
      body: { ok: false, error: 'INTERNAL_ERROR' },
      headers: GAME_NO_STORE_HEADERS,
    };
  }
}

function headerValue(
  headers: IncomingMessage['headers'],
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function attachPlayerSportsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerSportsPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handlePlayerSportsRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
        liveSportsPlacePorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('player_sports_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelPlayerSports(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: SportsPlacePorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerSportsRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? liveSportsPlacePorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
