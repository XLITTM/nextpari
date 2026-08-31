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
  liveManagerAuthPorts,
  loginManagerWithPassword,
  logoutManagerSession,
  readManagerSession,
  type ManagerAuthGatewayPorts,
  type ManagerAuthHttpResult,
} from './managerAuthService.js';
import { requestIsSecure } from './managerCookies.js';
import type { StaffLog } from './types.js';

export const MANAGER_AUTH_LOGIN_PATH = '/api/manager/auth/login';
export const MANAGER_AUTH_SESSION_PATH = '/api/manager/auth/session';
export const MANAGER_AUTH_LOGOUT_PATH = '/api/manager/auth/logout';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isManagerAuthPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === MANAGER_AUTH_LOGIN_PATH
    || path === MANAGER_AUTH_SESSION_PATH
    || path === MANAGER_AUTH_LOGOUT_PATH
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: ManagerAuthHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handleManagerAuthRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: ManagerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<ManagerAuthHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === MANAGER_AUTH_LOGIN_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      return loginManagerWithPassword(
        ports,
        String(body.email ?? ''),
        String(body.password ?? ''),
        secure,
      );
    }
    if (path === MANAGER_AUTH_SESSION_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return readManagerSession(ports, input.cookie, secure);
    }
    if (path === MANAGER_AUTH_LOGOUT_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return logoutManagerSession(secure);
    }
    throw staffError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? { Allow: path === MANAGER_AUTH_SESSION_PATH ? 'GET' : 'POST' }
          : undefined,
      };
    }
    log.error('manager_auth_unhandled', {
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

export async function attachManagerAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isManagerAuthPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleManagerAuthRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      liveManagerAuthPorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('manager_auth_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelManagerAuth(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: ManagerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handleManagerAuthRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? liveManagerAuthPorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
