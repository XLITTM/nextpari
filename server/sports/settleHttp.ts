import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { StaffOnboardingError, redactForLog } from '../staff/errors.js';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import { readSettlementSecret, settlementSecretsEqual } from './settlementDispatch.js';
import type { StaffLog } from '../staff/types.js';

export const INTERNAL_SPORTS_SETTLE_PATH = '/api/internal/sports/settle';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isInternalSportsSettlePath(pathname: string): boolean {
  return normalizePath(pathname) === INTERNAL_SPORTS_SETTLE_PATH;
}

function bearerToken(header: string | undefined): string {
  const value = String(header ?? '').trim();
  if (value.toLowerCase().startsWith('bearer ')) return value.slice(7).trim();
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function handleSportsSettleRequest(
  input: {
    method: string;
    pathname: string;
    authorization?: string;
    body?: unknown;
  },
  env: NodeJS.ProcessEnv = process.env,
  log: StaffLog = staffHttpLog,
  rpc?: (items: unknown[]) => Promise<unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (normalizePath(input.pathname) !== INTERNAL_SPORTS_SETTLE_PATH) {
    return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
  }
  if (input.method.toUpperCase() !== 'POST') {
    return {
      status: 405,
      body: { ok: false, error: 'METHOD_NOT_ALLOWED' },
    };
  }
  const expected = readSettlementSecret(env);
  const provided = bearerToken(input.authorization);
  if (!settlementSecretsEqual(provided, expected)) {
    return { status: 401, body: { ok: false, error: 'SETTLEMENT_UNAUTHORIZED' } };
  }
  const body = asRecord(parseJsonPayload(input.body));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return { status: 400, body: { ok: false, error: 'SETTLEMENT_ITEMS_REQUIRED' } };
  }
  console.log(`[sports] settlement-received items=${items.length}`);
  try {
    const invoke = rpc ?? (async (payload: unknown[]) => {
      const staff = loadStaffOnboardingEnv();
      const client = createServiceRoleClient(staff.supabaseUrl, staff.supabaseServiceRoleKey);
      const { data, error } = await client.rpc('sports_apply_settlement', { p_items: payload });
      if (error) throw new StaffOnboardingError('SETTLEMENT_RPC_FAILED', 500, error.message);
      return data;
    });
    const data = await invoke(items);
    console.log(`[sports] settlement-applied items=${items.length}`);
    return {
      status: 200,
      body: asRecord(data).ok === false ? asRecord(data) : { ok: true, ...asRecord(data) },
    };
  } catch (error) {
    log.error('sports_settlement_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    if (error instanceof StaffOnboardingError) {
      return { status: error.httpStatus, body: { ok: false, error: error.code } };
    }
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

export async function attachSportsSettleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isInternalSportsSettlePath(pathname)) return false;
  try {
    const method = req.method ?? 'POST';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handleSportsSettleRequest(
      {
        method,
        pathname,
        authorization: headerValue(req.headers, 'authorization'),
        body,
      },
      process.env,
      log,
    );
    writeStaffJson(res, { status: result.status, body: result.body, headers: GAME_NO_STORE_HEADERS });
  } catch (error) {
    log.error('sports_settle_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelSportsSettle(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
): Promise<void> {
  const authorization = req.headers.authorization ?? req.headers.Authorization;
  const result = await handleSportsSettleRequest({
    method: req.method ?? 'POST',
    pathname,
    authorization: Array.isArray(authorization) ? authorization[0] : authorization,
    body: req.body,
  });
  writeStaffJson(res, { status: result.status, body: result.body, headers: GAME_NO_STORE_HEADERS });
}
