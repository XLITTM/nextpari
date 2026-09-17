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
import { requestIsSecure } from '../player/playerCookies.js';
import type { StaffLog } from '../staff/types.js';
import {
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
  requestBetConstructLaunch,
} from './launch.js';
import { BETCONSTRUCT_OPERATOR_PATH, handleBetConstructOperatorMethod } from './operatorApi.js';
import { BETCONSTRUCT_WALLET_PATH, handleBetConstructSingleWalletMethod } from './singleWallet.js';

export {
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
};
export { BETCONSTRUCT_OPERATOR_PATH, BETCONSTRUCT_WALLET_PATH };

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isBetConstructPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH
    || path === PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH
    || path === BETCONSTRUCT_OPERATOR_PATH
    || path === BETCONSTRUCT_WALLET_PATH;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: StaffHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: { ...GAME_NO_STORE_HEADERS, ...result.headers },
    cookies: result.cookies,
  };
}

function headerValue(
  headers: IncomingMessage['headers'],
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handleBetConstructRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  log: StaffLog = staffHttpLog,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  void input.cookieSecure;
  try {
    if (path === PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      requestBetConstructLaunch({ product: 'sportsbook', cookieHeader: input.cookie, env });
    }
    if (path === PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      requestBetConstructLaunch({ product: 'casino', cookieHeader: input.cookie, env });
    }
    if (path === BETCONSTRUCT_OPERATOR_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      const body = asRecord(parseJsonPayload(input.body));
      handleBetConstructOperatorMethod({ method: body.method ?? body.Method, env });
    }
    if (path === BETCONSTRUCT_WALLET_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      const body = asRecord(parseJsonPayload(input.body));
      handleBetConstructSingleWalletMethod({ method: body.method ?? body.Method, env });
    }
    throw new StaffOnboardingError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return toStaffResult({
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405 ? { Allow: 'POST' } : undefined,
      });
    }
    log.error('betconstruct_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return toStaffResult({ status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
}

export async function attachBetConstructHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isBetConstructPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handleBetConstructRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      log,
    );
    writeStaffJson(res, result);
  } catch (error) {
    log.error('betconstruct_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelBetConstruct(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handleBetConstructRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    log,
  );
  writeStaffJson(res, result);
}
