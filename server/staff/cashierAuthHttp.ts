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
  liveCashierAuthPorts,
  loginCashierWithPassword,
  logoutCashierSession,
  readCashierSession,
  type CashierAuthGatewayPorts,
  type CashierAuthHttpResult,
} from './cashierAuthService.js';
import { requestIsSecure } from './cashierCookies.js';
import type { StaffLog } from './types.js';

export const CASHIER_AUTH_LOGIN_PATH = '/api/cashier/auth/login';
export const CASHIER_AUTH_SESSION_PATH = '/api/cashier/auth/session';
export const CASHIER_AUTH_LOGOUT_PATH = '/api/cashier/auth/logout';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isCashierAuthPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === CASHIER_AUTH_LOGIN_PATH
    || path === CASHIER_AUTH_SESSION_PATH
    || path === CASHIER_AUTH_LOGOUT_PATH
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: CashierAuthHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handleCashierAuthRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: CashierAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<CashierAuthHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path === CASHIER_AUTH_LOGIN_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      return loginCashierWithPassword(
        ports,
        String(body.email ?? ''),
        String(body.password ?? ''),
        secure,
      );
    }
    if (path === CASHIER_AUTH_SESSION_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return readCashierSession(ports, input.cookie, secure);
    }
    if (path === CASHIER_AUTH_LOGOUT_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return logoutCashierSession(secure);
    }
    throw staffError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? { Allow: path === CASHIER_AUTH_SESSION_PATH ? 'GET' : 'POST' }
          : undefined,
      };
    }
    log.error('cashier_auth_unhandled', {
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

export async function attachCashierAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isCashierAuthPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleCashierAuthRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      liveCashierAuthPorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('cashier_auth_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelCashierAuth(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: CashierAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handleCashierAuthRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? liveCashierAuthPorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
