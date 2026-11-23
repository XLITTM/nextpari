import type { IncomingMessage, ServerResponse } from 'node:http';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import { StaffOnboardingError, staffError } from '../staff/errors.js';
import { staffHttpLog, writeStaffJson, type StaffHttpResult, type StaffJsonResponse } from '../staff/httpHandler.js';
import { requestIsSecure } from '../staff/ownerCookies.js';
import {
  livePlayerAuthPorts,
  resolvePlayerSession,
  type PlayerAuthGatewayPorts,
} from '../player/playerAuthService.js';
import type { StaffLog } from '../staff/types.js';
import {
  liveResultsProvider,
  loadSportsResults,
  normalizeResultsWindow,
  type SportsResultsProvider,
} from './resultsAdapter.js';

export const PLAYER_RESULTS_PATH = '/api/player/sports/results';

export interface ResultsHttpDeps {
  playerSession?: PlayerAuthGatewayPorts;
  playerAuth?: (cookie: string | undefined, secure: boolean) => Promise<{ cookies?: string[] }>;
  provider?: SportsResultsProvider | null;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function queryOf(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

export function isPlayerResultsPath(pathname: string): boolean {
  return normalizePath(pathname) === PLAYER_RESULTS_PATH;
}

export async function handlePlayerResultsRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
  },
  deps: ResultsHttpDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  let sessionCookies: string[] | undefined;
  try {
    if (!isPlayerResultsPath(path)) throw staffError('NOT_FOUND', 404);
    if (method !== 'GET') throw staffError('METHOD_NOT_ALLOWED', 405);
    const resolved = deps.playerAuth
      ? await deps.playerAuth(input.cookie, input.cookieSecure === true)
      : await resolvePlayerSession(
        deps.playerSession ?? livePlayerAuthPorts(),
        input.cookie,
        input.cookieSecure === true,
      );
    sessionCookies = resolved.cookies;
    const query = queryOf(input.search);
    const data = await loadSportsResults(deps.provider ?? liveResultsProvider(), {
      window: normalizeResultsWindow(query.get('window')),
      sport: query.get('sport') ?? undefined,
    });
    return {
      status: 200,
      body: { ok: true, data },
      cookies: sessionCookies,
      headers: GAME_NO_STORE_HEADERS,
    };
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        cookies: sessionCookies,
        headers: GAME_NO_STORE_HEADERS,
      };
    }
    log.error('player_results_unhandled', { message: error instanceof Error ? error.message : 'UNHANDLED' });
    return {
      status: 500,
      body: { ok: false, error: 'INTERNAL_ERROR' },
      cookies: sessionCookies,
      headers: GAME_NO_STORE_HEADERS,
    };
  }
}

export async function handleVercelPlayerResults(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  res: StaffJsonResponse,
  pathname: string,
  deps?: ResultsHttpDeps,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerResultsRequest({
    method: req.method ?? 'GET',
    pathname,
    search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
    cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
    cookieSecure: requestIsSecure(req.headers),
  }, deps);
  writeStaffJson(res, result);
}

function headerValue(headers: IncomingMessage['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function attachPlayerResultsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: ResultsHttpDeps,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerResultsPath(pathname)) return false;
  const result = await handlePlayerResultsRequest({
    method: req.method ?? 'GET',
    pathname,
    search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
    cookie: headerValue(req.headers, 'cookie'),
    cookieSecure: requestIsSecure(req.headers),
  }, deps);
  writeStaffJson(res, result);
  return true;
}
