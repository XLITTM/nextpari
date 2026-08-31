import type { IncomingMessage, ServerResponse } from 'node:http';
import { StaffOnboardingError, redactForLog, staffError } from '../staff/errors.js';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import {
  livePlayerAuthPorts,
  loginPlayerWithPassword,
  logoutPlayerSession,
  readPlayerProfileSession,
  readPlayerSession,
  registerPlayerWithPassword,
  updatePlayerProfileSession,
  type PlayerAuthGatewayPorts,
  type PlayerAuthHttpResult,
} from './playerAuthService.js';
import { requestIsSecure } from './playerCookies.js';
import type { StaffLog } from '../staff/types.js';

export const PLAYER_AUTH_REGISTER_PATH = '/api/player/auth/register';
export const PLAYER_AUTH_LOGIN_PATH = '/api/player/auth/login';
export const PLAYER_AUTH_LOGOUT_PATH = '/api/player/auth/logout';
export const PLAYER_ME_PATH = '/api/player/me';
export const PLAYER_WALLET_PATH = '/api/player/wallet';
export const PLAYER_PROFILE_PATH = '/api/player/profile';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPlayerAuthPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === PLAYER_AUTH_REGISTER_PATH
    || path === PLAYER_AUTH_LOGIN_PATH
    || path === PLAYER_AUTH_LOGOUT_PATH
    ||     path === PLAYER_ME_PATH
    || path === PLAYER_WALLET_PATH
    || path === PLAYER_PROFILE_PATH
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: PlayerAuthHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handlePlayerAuthRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: PlayerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<PlayerAuthHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === PLAYER_AUTH_REGISTER_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      return registerPlayerWithPassword(
        ports,
        {
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          phone: String(body.phone ?? ''),
        },
        secure,
      );
    }
    if (path === PLAYER_AUTH_LOGIN_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      return loginPlayerWithPassword(
        ports,
        String(body.email ?? ''),
        String(body.password ?? ''),
        secure,
      );
    }
    if (path === PLAYER_AUTH_LOGOUT_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return logoutPlayerSession(ports, input.cookie, secure);
    }
    if (path === PLAYER_ME_PATH || path === PLAYER_WALLET_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return readPlayerSession(ports, input.cookie, secure);
    }
    if (path === PLAYER_PROFILE_PATH) {
      if (method === 'GET') {
        return readPlayerProfileSession(ports, input.cookie, secure);
      }
      if (method === 'PUT') {
        return updatePlayerProfileSession(ports, input.cookie, asRecord(parseJsonPayload(input.body)), secure);
      }
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }
    throw staffError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, authenticated: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? {
            Allow: path === PLAYER_PROFILE_PATH
              ? 'GET, PUT'
              : path === PLAYER_ME_PATH || path === PLAYER_WALLET_PATH
                ? 'GET'
                : 'POST',
          }
          : undefined,
      };
    }
    log.error('player_auth_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return { status: 500, body: { ok: false, authenticated: false, error: 'INTERNAL_ERROR' } };
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

export async function attachPlayerAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerAuthPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handlePlayerAuthRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      livePlayerAuthPorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('player_auth_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, authenticated: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelPlayerAuth(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: PlayerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerAuthRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? livePlayerAuthPorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
