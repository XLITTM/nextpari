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
import { playerGameHttpError, type PlayerGameGatewayPorts } from './playerGamesService.js';
import {
  createPlayerWithdrawal,
  listPlayerWithdrawals,
  livePlayerWithdrawalPorts,
} from './playerWithdrawalService.js';
import type { StaffLog } from '../staff/types.js';

export const PLAYER_WITHDRAWALS_PATH = '/api/player/withdrawals';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPlayerWithdrawalsPath(pathname: string): boolean {
  return normalizePath(pathname) === PLAYER_WITHDRAWALS_PATH;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: {
  status: number;
  body: Record<string, unknown>;
  cookies?: string[];
  headers?: Record<string, string>;
}): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handlePlayerWithdrawalsRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  ports: PlayerGameGatewayPorts = livePlayerWithdrawalPorts(),
  log: StaffLog = staffHttpLog,
): Promise<{ status: number; body: Record<string, unknown>; cookies?: string[]; headers?: Record<string, string> }> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;

  try {
    if (path !== PLAYER_WITHDRAWALS_PATH) {
      throw new StaffOnboardingError('NOT_FOUND', 404);
    }
    if (method === 'GET') {
      return await listPlayerWithdrawals(ports, input.cookie, secure);
    }
    if (method === 'POST') {
      return await createPlayerWithdrawal(ports, input.cookie, asRecord(parseJsonPayload(input.body)), secure);
    }
    throw new StaffOnboardingError('METHOD_NOT_ALLOWED', 405);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405 ? { Allow: 'GET, POST' } : undefined,
      };
    }
    log.error('player_withdrawals_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return playerGameHttpError(error, secure);
  }
}

function headerValue(
  headers: IncomingMessage['headers'] | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function attachPlayerWithdrawalsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerWithdrawalsPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handlePlayerWithdrawalsRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      livePlayerWithdrawalPorts(),
      log,
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('player_withdrawals_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelPlayerWithdrawals(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string = PLAYER_WITHDRAWALS_PATH,
  ports?: PlayerGameGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerWithdrawalsRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    ports ?? livePlayerWithdrawalPorts(),
    log,
  );
  writeStaffJson(res, toStaffResult(result));
}
