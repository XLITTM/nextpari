import type { IncomingMessage, ServerResponse } from 'node:http';
import { reportServerException } from '../observability/sentry.js';
import { StaffOnboardingError, redactForLog } from '../staff/errors.js';
import {
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import { requestIsSecure } from '../player/playerCookies.js';
import type { PlayerAuthGatewayPorts } from '../player/playerAuthService.js';
import type { StaffLog } from '../staff/types.js';
import {
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
  requestBetConstructLaunch,
} from './launch.js';
import {
  BETCONSTRUCT_OPERATOR_BASE,
  betConstructOperatorCallbackPath,
  handleBetConstructOperatorMethod,
} from './operatorApi.js';
import {
  BETCONSTRUCT_WALLET_BASE,
  betConstructWalletCallbackPath,
  handleBetConstructSingleWalletMethod,
} from './singleWallet.js';

export {
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
};
export { BETCONSTRUCT_OPERATOR_BASE, BETCONSTRUCT_WALLET_BASE };

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function callbackMethodFromPath(pathname: string, base: string): string | null {
  const path = normalizePath(pathname);
  if (path === base) return '';
  if (!path.startsWith(`${base}/`)) return null;
  return path.slice(base.length + 1);
}

export function isBetConstructPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH
    || path === PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH
    || callbackMethodFromPath(path, BETCONSTRUCT_OPERATOR_BASE) !== null
    || callbackMethodFromPath(path, BETCONSTRUCT_WALLET_BASE) !== null;
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

function queryValue(
  query: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const value = query?.[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export async function handleBetConstructRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
    ports?: PlayerAuthGatewayPorts;
  },
  log: StaffLog = staffHttpLog,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  void input.body;
  try {
    if (path === PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return toStaffResult(await requestBetConstructLaunch({
        product: 'sportsbook',
        cookieHeader: input.cookie,
        cookieSecure: input.cookieSecure,
        env,
        ports: input.ports,
      }));
    }
    if (path === PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return toStaffResult(await requestBetConstructLaunch({
        product: 'casino',
        cookieHeader: input.cookie,
        cookieSecure: input.cookieSecure,
        env,
        ports: input.ports,
      }));
    }
    const operatorMethod = callbackMethodFromPath(path, BETCONSTRUCT_OPERATOR_BASE);
    if (operatorMethod !== null) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return toStaffResult(handleBetConstructOperatorMethod({ method: operatorMethod, env }));
    }
    const walletMethod = callbackMethodFromPath(path, BETCONSTRUCT_WALLET_BASE);
    if (walletMethod !== null) {
      if (method !== 'POST') throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
      return toStaffResult(handleBetConstructSingleWalletMethod({ method: walletMethod, env }));
    }
    return toStaffResult({ status: 404, body: { ok: false, error: 'NOT_FOUND' } });
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
    await reportServerException(error, {
      subsystem: 'betconstruct',
      route: path,
      method,
      eventName: 'betconstruct_unhandled',
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
    await reportServerException(error, {
      subsystem: 'betconstruct',
      route: pathname,
      method: req.method ?? 'GET',
      eventName: 'betconstruct_http_failed',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

type VercelBetConstructReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export async function handleVercelBetConstruct(
  req: VercelBetConstructReq,
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

export function vercelBetConstructCallback(kind: 'operator' | 'wallet') {
  return async function handler(
    req: VercelBetConstructReq,
    res: StaffJsonResponse,
  ): Promise<void> {
    const methodName = queryValue(req.query, 'method');
    const pathname = kind === 'wallet'
      ? betConstructWalletCallbackPath(methodName)
      : betConstructOperatorCallbackPath(methodName);
    await handleVercelBetConstruct(req, res, pathname);
  };
}
