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
import { requestIsSecure } from './playerCookies.js';
import {
  actPlayerGame,
  getPlayerGame,
  getPlayerGameSession,
  livePlayerGamePorts,
  playerGameHttpError,
  startPlayerGame,
  type PlayerGameGatewayPorts,
} from './playerGamesService.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import type { StaffLog } from '../staff/types.js';

export const PLAYER_GAMES_START_PATH = '/api/player/games/start';
export const PLAYER_GAMES_AVIATOR_SESSION_PATH = '/api/player/games/session/aviator';

const ROUND_RE = /^\/api\/player\/games\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/(action))?$/i;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPlayerGamesPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === PLAYER_GAMES_START_PATH
    || path === PLAYER_GAMES_AVIATOR_SESSION_PATH
    || ROUND_RE.test(path);
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

export async function handlePlayerGamesRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: PlayerGameGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<{ status: number; body: Record<string, unknown>; cookies?: string[]; headers?: Record<string, string> }> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === PLAYER_GAMES_START_PATH) {
      if (method !== 'POST') {
        throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      }
      return await startPlayerGame(ports, input.cookie, asRecord(parseJsonPayload(input.body)), secure);
    }

    if (path === PLAYER_GAMES_AVIATOR_SESSION_PATH) {
      if (method !== 'GET') {
        throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      }
      return await getPlayerGameSession(ports, input.cookie, 'aviator', secure);
    }

    const match = path.match(ROUND_RE);
    if (!match) {
      throw new StaffOnboardingError('NOT_FOUND', 404);
    }
    const roundId = match[1];
    const tail = match[2];
    if (tail === 'action') {
      if (method !== 'POST') {
        throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      }
      return await actPlayerGame(ports, input.cookie, roundId, asRecord(parseJsonPayload(input.body)), secure);
    }
    if (method !== 'GET') {
      throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
    }
    return await getPlayerGame(ports, input.cookie, roundId, secure);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: {
          ...GAME_NO_STORE_HEADERS,
          ...(error.httpStatus === 405
            ? { Allow: path === PLAYER_GAMES_START_PATH || /\/action$/.test(path) ? 'POST' : 'GET' }
            : {}),
        },
      };
    }
    log.error('player_games_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return playerGameHttpError(error, secure);
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

export async function attachPlayerGamesHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerGamesPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handlePlayerGamesRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      livePlayerGamePorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('player_games_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelPlayerGames(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: PlayerGameGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerGamesRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? livePlayerGamePorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
