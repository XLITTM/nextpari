import type { IncomingMessage, ServerResponse } from 'node:http';
import { StaffOnboardingError, redactForLog, staffError } from './errors.js';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from './httpHandler.js';
import {
  liveOwnerAuthPorts,
  loginOwnerWithPassword,
  logoutOwnerSession,
  readOwnerSession,
  type OwnerAuthGatewayPorts,
  type OwnerAuthHttpResult,
} from './ownerAuthService.js';
import { requestIsSecure } from './ownerCookies.js';
import type { StaffLog } from './types.js';

export const OWNER_AUTH_LOGIN_PATH = '/api/owner/auth/login';
export const OWNER_AUTH_SESSION_PATH = '/api/owner/auth/session';
export const OWNER_AUTH_LOGOUT_PATH = '/api/owner/auth/logout';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isOwnerAuthPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === OWNER_AUTH_LOGIN_PATH
    || path === OWNER_AUTH_SESSION_PATH
    || path === OWNER_AUTH_LOGOUT_PATH
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: OwnerAuthHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handleOwnerAuthRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: OwnerAuthGatewayPorts = liveOwnerAuthPorts(),
  log: StaffLog = staffHttpLog,
): Promise<OwnerAuthHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === OWNER_AUTH_LOGIN_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      return loginOwnerWithPassword(
        ports,
        String(body.email ?? ''),
        String(body.password ?? ''),
        secure,
      );
    }
    if (path === OWNER_AUTH_SESSION_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return readOwnerSession(ports, input.cookie, secure);
    }
    if (path === OWNER_AUTH_LOGOUT_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return logoutOwnerSession(secure);
    }
    throw staffError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? { Allow: path === OWNER_AUTH_SESSION_PATH ? 'GET' : 'POST' }
          : undefined,
      };
    }
    log.error('owner_auth_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } };
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

export async function attachOwnerAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isOwnerAuthPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleOwnerAuthRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      liveOwnerAuthPorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('owner_auth_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelOwnerAuth(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports: OwnerAuthGatewayPorts = liveOwnerAuthPorts(),
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handleOwnerAuthRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports,
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
