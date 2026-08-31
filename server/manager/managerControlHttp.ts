import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import { StaffOnboardingError, staffError } from '../staff/errors.js';
import {
  liveManagerAuthPorts,
  resolveManagerSession,
  type ManagerAuthGatewayPorts,
} from '../staff/managerAuthService.js';
import { publicManagerStaff, type ManagerStaffContext } from '../staff/managerContext.js';
import { clearManagerCookies, requestIsSecure } from '../staff/managerCookies.js';
import type { StaffLog } from '../staff/types.js';
import { createManagerJwtRpc, type ManagerRpcPort } from './managerRpc.js';

export const MONEY_RPC_DENYLIST = [
  'manager_create_cashier',
  'manager_topup_cashier',
  'manager_adjust_player_balance',
  'manager_settle_bet',
] as const;

export const CANONICAL_MANAGER_FINANCE_RPCS = [
  'manager_operational_overview',
  'manager_fund_cashier',
  'manager_collect_cashier',
  'manager_list_operational_transfers',
] as const;

export interface ManagerControlDeps {
  sessionPorts?: ManagerAuthGatewayPorts;
  rpcFactory?: (accessToken: string) => ManagerRpcPort;
}

function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  return withoutQuery.replace(/\/$/, '') || '/';
}

function searchFrom(pathname: string, search?: string): string | undefined {
  if (search) return search;
  const q = pathname.indexOf('?');
  return q >= 0 ? pathname.slice(q) : undefined;
}

export function isManagerControlPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/manager/')) return false;
  if (path.startsWith('/api/manager/auth/')) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  return [data];
}

function queryOf(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

function requireId(value: string, code: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const id = decoded.trim();
  if (!id) throw staffError(code, 400);
  return id;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value === 'boolean') return value;
  throw staffError(code, 400);
}

function requireAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw staffError('AMOUNT_REQUIRED', 400);
  if (n <= 0) throw staffError('AMOUNT_NOT_POSITIVE', 400);
  return n;
}

function requireIdempotencyKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) throw staffError('IDEMPOTENCY_KEY_REQUIRED', 400);
  if (key.length > 250) throw staffError('IDEMPOTENCY_KEY_TOO_LONG', 400);
  return key;
}

function optionalNote(value: unknown): string | null {
  if (value == null) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > 500) throw staffError('REASON_TOO_LONG', 400);
  return note;
}

function skipLegacyManagerId(kind: ControlAction['kind']): boolean {
  return kind === 'me' || kind === 'risk' || kind === 'finance' || kind === 'fund'
    || kind === 'collect' || kind === 'transfers';
}

function managerAccountId(staff: ManagerStaffContext): string {
  const id = staff.legacyManagerAccountId?.trim() ?? '';
  if (!id) throw staffError('LEGACY_MANAGER_ID_REQUIRED', 403);
  return id;
}

async function assertOwnCashier(
  rpc: ManagerRpcPort,
  managerId: string,
  cashierId: string,
): Promise<void> {
  const data = await rpc.invoke('manager_list_cashiers', { p_manager_id: managerId });
  const found = asRows(data).some((row) => String(asRecord(row).id ?? '') === cashierId);
  if (!found) throw staffError('CASHIER_NOT_FOUND', 404);
}

type ControlAction =
  | { kind: 'me' }
  | { kind: 'dashboard' }
  | { kind: 'cashiers' }
  | { kind: 'ledger'; cashierId: string }
  | { kind: 'freeze'; cashierId: string }
  | { kind: 'fund'; cashierId: string }
  | { kind: 'collect'; cashierId: string }
  | { kind: 'finance' }
  | { kind: 'transfers' }
  | { kind: 'risk' }
  | { kind: 'players' }
  | { kind: 'dossier'; playerId: string }
  | { kind: 'messages' };

function matchControl(method: string, pathname: string): ControlAction | 'method' | null {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();

  const ledger = path.match(/^\/api\/manager\/cashiers\/([^/]+)\/ledger$/);
  if (ledger) return m === 'GET' ? { kind: 'ledger', cashierId: ledger[1] } : 'method';

  const freeze = path.match(/^\/api\/manager\/cashiers\/([^/]+)\/freeze$/);
  if (freeze) return m === 'POST' ? { kind: 'freeze', cashierId: freeze[1] } : 'method';

  const fund = path.match(/^\/api\/manager\/cashiers\/([^/]+)\/fund$/);
  if (fund) return m === 'POST' ? { kind: 'fund', cashierId: fund[1] } : 'method';

  const collect = path.match(/^\/api\/manager\/cashiers\/([^/]+)\/collect$/);
  if (collect) return m === 'POST' ? { kind: 'collect', cashierId: collect[1] } : 'method';

  const dossier = path.match(/^\/api\/manager\/players\/([^/]+)$/);
  if (dossier) {
    if (m === 'GET') return { kind: 'dossier', playerId: dossier[1] };
    return 'method';
  }

  if (path === '/api/manager/me') return m === 'GET' ? { kind: 'me' } : 'method';
  if (path === '/api/manager/dashboard') return m === 'GET' ? { kind: 'dashboard' } : 'method';
  if (path === '/api/manager/cashiers') return m === 'GET' ? { kind: 'cashiers' } : 'method';
  if (path === '/api/manager/finance') return m === 'GET' ? { kind: 'finance' } : 'method';
  if (path === '/api/manager/transfers') return m === 'GET' ? { kind: 'transfers' } : 'method';
  if (path === '/api/manager/risk-bets') return m === 'GET' ? { kind: 'risk' } : 'method';
  if (path === '/api/manager/players') return m === 'GET' ? { kind: 'players' } : 'method';
  if (path === '/api/manager/messages') return m === 'GET' ? { kind: 'messages' } : 'method';
  return null;
}

async function runControl(
  action: ControlAction,
  rpc: ManagerRpcPort,
  query: URLSearchParams,
  body: unknown,
  staff: ManagerStaffContext,
): Promise<unknown> {
  const rec = asRecord(body);
  const managerId = skipLegacyManagerId(action.kind) ? '' : managerAccountId(staff);

  switch (action.kind) {
    case 'me':
      return null;
    case 'dashboard':
      return rpc.invoke('manager_dashboard_stats', { p_manager_id: managerId });
    case 'cashiers':
      return rpc.invoke('manager_list_cashiers', { p_manager_id: managerId });
    case 'ledger': {
      const cashierId = requireId(action.cashierId, 'CASHIER_ID_REQUIRED');
      await assertOwnCashier(rpc, managerId, cashierId);
      return rpc.invoke('manager_cashier_ledger', {
        p_manager_id: managerId,
        p_cashier_id: cashierId,
        p_from: query.get('from') || null,
      });
    }
    case 'freeze': {
      const cashierId = requireId(action.cashierId, 'CASHIER_ID_REQUIRED');
      await assertOwnCashier(rpc, managerId, cashierId);
      return rpc.invoke('manager_set_cashier_frozen', {
        p_manager_id: managerId,
        p_cashier_id: cashierId,
        p_frozen: requireBoolean(rec.frozen, 'FROZEN_REQUIRED'),
      });
    }
    case 'finance':
      return rpc.invoke('manager_operational_overview');
    case 'transfers':
      return rpc.invoke('manager_list_operational_transfers', {
        p_limit: query.get('limit') ? Number(query.get('limit')) : 100,
        p_offset: query.get('offset') ? Number(query.get('offset')) : 0,
      });
    case 'fund': {
      const cashierId = requireId(action.cashierId, 'CASHIER_ID_REQUIRED');
      return rpc.invoke('manager_fund_cashier', {
        p_cashier_id: cashierId,
        p_amount: requireAmount(rec.amount),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
        p_note: optionalNote(rec.note),
      });
    }
    case 'collect': {
      const cashierId = requireId(action.cashierId, 'CASHIER_ID_REQUIRED');
      return rpc.invoke('manager_collect_cashier', {
        p_cashier_id: cashierId,
        p_amount: requireAmount(rec.amount),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
        p_note: optionalNote(rec.note),
      });
    }
    case 'risk':
      return {
        rows: [],
        total: 0,
        available: false,
        reason: 'NETWORK_SCOPE_PENDING',
      };
    case 'players':
      return { rows: [], total: 0, available: false };
    case 'dossier':
      throw staffError('PLAYER_NOT_FOUND', 404);
    case 'messages':
      return { rows: [], total: 0, available: false };
    default:
      throw staffError('NOT_FOUND', 404);
  }
}

export async function handleManagerControlRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: ManagerControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const matched = matchControl(method, path);
  let sessionCookies: string[] | undefined;

  try {
    if (!isManagerControlPath(path) || matched === null) {
      throw staffError('NOT_FOUND', 404);
    }
    if (matched === 'method') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    const sessionPorts = deps.sessionPorts ?? liveManagerAuthPorts();
    const resolved = await resolveManagerSession(sessionPorts, input.cookie, secure);
    sessionCookies = resolved.cookies;
    if (matched.kind === 'me') {
      return {
        status: 200,
        body: { ok: true, staff: publicManagerStaff(resolved.staff) },
        cookies: sessionCookies,
      };
    }

    const rpc = (deps.rpcFactory ?? createManagerJwtRpc)(resolved.accessToken);
    const data = await runControl(
      matched,
      rpc,
      queryOf(searchFrom(input.pathname, input.search)),
      parseJsonPayload(input.body),
      resolved.staff,
    );
    return {
      status: 200,
      body: { ok: true, data },
      cookies: sessionCookies,
    };
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? { Allow: method === 'POST' ? 'GET' : 'POST' }
          : undefined,
        cookies: error.httpStatus === 401 ? clearManagerCookies(secure) : sessionCookies,
      };
    }
    log.error('manager_control_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' }, cookies: sessionCookies };
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

function pathnameAndSearch(rawUrl: string, fallbackPath: string): { pathname: string; search: string } {
  try {
    const url = new URL(rawUrl, 'http://n.local');
    if (url.pathname.startsWith('/api/manager/')) {
      return { pathname: url.pathname, search: url.search };
    }
  } catch {
    /* fall through */
  }
  const [path, search = ''] = (rawUrl || fallbackPath).split('?');
  return { pathname: path || fallbackPath, search: search ? `?${search}` : '' };
}

export async function attachManagerControlHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const { pathname, search } = pathnameAndSearch(raw, '/');
  if (!isManagerControlPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleManagerControlRequest(
      {
        method,
        pathname,
        search,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      {},
      log,
    );
    writeStaffJson(res, result);
  } catch (error) {
    log.error('manager_control_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelManagerControl(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  fallbackPathname: string,
  deps: ManagerControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  let { pathname, search } = pathnameAndSearch(req.url ?? '', fallbackPathname);
  if (!search && req.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue;
      if (value == null) continue;
      const text = Array.isArray(value) ? value[0] : value;
      if (text) params.set(key, text);
    }
    const qs = params.toString();
    if (qs) search = `?${qs}`;
  }
  if (req.query?.path) {
    const segs = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
    const joined = segs.filter(Boolean).join('/');
    if (joined) pathname = `/api/manager/${joined}`;
  }
  const result = await handleManagerControlRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      search,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    deps,
    log,
  );
  writeStaffJson(res, result);
}
