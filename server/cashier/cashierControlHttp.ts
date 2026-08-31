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
  liveCashierAuthPorts,
  resolveCashierSession,
  type CashierAuthGatewayPorts,
} from '../staff/cashierAuthService.js';
import { publicCashierStaff } from '../staff/cashierContext.js';
import { clearCashierCookies, requestIsSecure } from '../staff/cashierCookies.js';
import type { StaffLog } from '../staff/types.js';
import { createCashierJwtRpc, type CashierRpcPort } from './cashierRpc.js';
import { assertCashierPayoutRateLimit } from './cashierPayoutRateLimit.js';

export const CASHIER_MONEY_RPC_DENYLIST = [
  'cashier_deposit_to_player',
  'cashier_payout_by_code',
  'cashier_login',
  'cashier_get_session',
  'cashier_lookup_payout_code',
  'cashier_shift_history',
  'apply_operational_transfer',
  'manager_fund_cashier',
  'manager_collect_cashier',
] as const;

export const CANONICAL_CASHIER_READ_RPCS = [
  'cashier_operational_overview',
  'cashier_list_operational_transfers',
] as const;

export const CANONICAL_CASHIER_MONEY_RPCS = [
  'cashier_deposit_player',
  'cashier_lookup_player_payout',
  'cashier_confirm_player_payout',
] as const;

export interface CashierControlDeps {
  sessionPorts?: CashierAuthGatewayPorts;
  rpcFactory?: (accessToken: string) => CashierRpcPort;
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

export function isCashierControlPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/cashier/')) return false;
  if (path.startsWith('/api/cashier/auth/')) return false;
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

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapOverview(raw: unknown): Record<string, unknown> {
  const rec = asRecord(raw);
  const cashier = asRecord(rec.cashier);
  const operational = asRecord(rec.operational);
  const availableBalance = num(operational.available_balance ?? operational.availableBalance);
  return {
    cashier: {
      cashierId: str(cashier.cashier_id ?? cashier.cashierId),
      login: str(cashier.login),
      fullName: str(cashier.full_name ?? cashier.fullName),
      pointName: str(cashier.point_name ?? cashier.pointName),
      city: str(cashier.city),
      networkId: str(cashier.network_id ?? cashier.networkId),
    },
    operational: {
      accountId: str(operational.account_id ?? operational.accountId),
      currency: str(operational.currency || 'TMTM'),
      availableBalance,
      status: str(operational.status),
      migrationState: str((operational.migration_state ?? operational.migrationState) || 'staging'),
      version: num(operational.version) ?? 0,
      legacyFloatDiagnostic: num(
        operational.legacy_float_diagnostic ?? operational.legacyFloatDiagnostic,
      ),
    },
    activationPending: rec.activation_pending !== false && rec.activationPending !== false,
  };
}

function mapTransfers(raw: unknown): Record<string, unknown> {
  const rec = asRecord(raw);
  const rows = asRows(rec.rows).map((row) => {
    const item = asRecord(row);
    return {
      id: str(item.id),
      transferNo: item.transfer_no ?? item.transferNo ?? null,
      transferType: str(item.transfer_type ?? item.transferType),
      currency: str(item.currency),
      amount: num(item.amount),
      fromAccountId: str(item.from_account_id ?? item.fromAccountId),
      toAccountId: str(item.to_account_id ?? item.toAccountId),
      actorRole: str(item.actor_role ?? item.actorRole),
      createdAt: str(item.created_at ?? item.createdAt),
    };
  });
  return {
    rows,
    total: num(rec.total) ?? rows.length,
    limit: num(rec.limit) ?? 100,
    offset: num(rec.offset) ?? 0,
  };
}

function requireAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw staffError('AMOUNT_REQUIRED', 400);
  return n;
}

function requireIdempotencyKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) throw staffError('IDEMPOTENCY_KEY_REQUIRED', 400);
  if (key.length > 250) throw staffError('IDEMPOTENCY_KEY_TOO_LONG', 400);
  return key;
}

function requirePlayerPublicId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!/^[0-9]{6}$/.test(id)) throw staffError('PLAYER_NOT_FOUND', 404);
  return id;
}

function requirePayoutCode(value: unknown): string {
  const code = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(code)) throw staffError('PAYOUT_CODE_INVALID', 400);
  return code;
}

function optionalNote(value: unknown): string | null {
  if (value == null || value === '') return null;
  const note = String(value).trim();
  return note || null;
}

function stripBrowserAuthority(rec: Record<string, unknown>): void {
  delete rec.cashierId;
  delete rec.cashier_id;
  delete rec.networkId;
  delete rec.network_id;
  delete rec.operationalAccountId;
  delete rec.operational_account_id;
  delete rec.actorUserId;
  delete rec.actor_user_id;
  delete rec.actorRole;
  delete rec.actor_role;
  delete rec.walletId;
  delete rec.wallet_id;
}

type ControlAction =
  | { kind: 'me' }
  | { kind: 'finance' }
  | { kind: 'transfers' }
  | { kind: 'deposit' }
  | { kind: 'payoutLookup'; code: string }
  | { kind: 'payoutConfirm'; code: string };

function matchControl(method: string, pathname: string): ControlAction | 'method' | null {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();
  if (path === '/api/cashier/me') return m === 'GET' ? { kind: 'me' } : 'method';
  if (path === '/api/cashier/finance') return m === 'GET' ? { kind: 'finance' } : 'method';
  if (path === '/api/cashier/transfers') return m === 'GET' ? { kind: 'transfers' } : 'method';
  if (path === '/api/cashier/deposits') return m === 'POST' ? { kind: 'deposit' } : 'method';
  const payoutConfirm = path.match(/^\/api\/cashier\/payouts\/([^/]+)\/confirm$/);
  if (payoutConfirm) {
    return m === 'POST' ? { kind: 'payoutConfirm', code: payoutConfirm[1] } : 'method';
  }
  const payoutLookup = path.match(/^\/api\/cashier\/payouts\/([^/]+)$/);
  if (payoutLookup) {
    return m === 'GET' ? { kind: 'payoutLookup', code: payoutLookup[1] } : 'method';
  }
  return null;
}

function allowFor(path: string): string {
  if (path === '/api/cashier/deposits' || path.endsWith('/confirm')) return 'POST';
  return 'GET';
}

async function runControl(
  action: ControlAction,
  rpc: CashierRpcPort,
  query: URLSearchParams,
  body: unknown,
): Promise<unknown> {
  if (query.get('cashierId') || query.get('cashier_id') || query.get('networkId') || query.get('network_id')) {
    /* ignored — authority is JWT only */
  }
  const rec = asRecord(body);
  stripBrowserAuthority(rec);
  switch (action.kind) {
    case 'me':
      return null;
    case 'finance':
      return mapOverview(await rpc.invoke('cashier_operational_overview'));
    case 'transfers':
      return mapTransfers(await rpc.invoke('cashier_list_operational_transfers', {
        p_limit: query.get('limit') ? Number(query.get('limit')) : 100,
        p_offset: query.get('offset') ? Number(query.get('offset')) : 0,
      }));
    case 'deposit':
      return rpc.invoke('cashier_deposit_player', {
        p_player_public_id: requirePlayerPublicId(rec.playerPublicId ?? rec.player_public_id),
        p_amount: requireAmount(rec.amount),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
        p_note: optionalNote(rec.note),
      });
    case 'payoutLookup':
      return rpc.invoke('cashier_lookup_player_payout', {
        p_code: requirePayoutCode(action.code),
      });
    case 'payoutConfirm': {
      const confirmed = await rpc.invoke('cashier_confirm_player_payout', {
        p_code: requirePayoutCode(action.code),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
      });
      // SQL returns (does not RAISE) after lazy expiry+release so the
      // WITHDRAWAL_RELEASE commits. Map that payload to HTTP 409 here.
      if (
        confirmed
        && typeof confirmed === 'object'
        && !Array.isArray(confirmed)
        && (confirmed as { ok?: unknown }).ok === false
      ) {
        const code = String((confirmed as { error?: unknown }).error ?? 'PAYOUT_EXPIRED');
        throw staffError(code, 409);
      }
      return confirmed;
    }
    default:
      throw staffError('NOT_FOUND', 404);
  }
}

export async function handleCashierControlRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: CashierControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const matched = matchControl(method, path);
  let sessionCookies: string[] | undefined;

  try {
    if (!isCashierControlPath(path) || matched === null) {
      throw staffError('NOT_FOUND', 404);
    }
    if (matched === 'method') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    const sessionPorts = deps.sessionPorts ?? liveCashierAuthPorts();
    const resolved = await resolveCashierSession(sessionPorts, input.cookie, secure);
    sessionCookies = resolved.cookies;
    if (matched.kind === 'me') {
      return {
        status: 200,
        body: { ok: true, staff: publicCashierStaff(resolved.staff) },
        cookies: sessionCookies,
      };
    }

    if (matched.kind === 'payoutLookup') {
      assertCashierPayoutRateLimit(resolved.staff.authUserId, 'lookup');
    }
    if (matched.kind === 'payoutConfirm') {
      assertCashierPayoutRateLimit(resolved.staff.authUserId, 'confirm');
    }

    const rpc = (deps.rpcFactory ?? createCashierJwtRpc)(resolved.accessToken);
    const data = await runControl(
      matched,
      rpc,
      queryOf(searchFrom(input.pathname, input.search)),
      parseJsonPayload(input.body),
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
          ? { Allow: allowFor(path) }
          : undefined,
        cookies: error.httpStatus === 401 ? clearCashierCookies(secure) : sessionCookies,
      };
    }
    log.error('cashier_control_unhandled', {
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
    if (url.pathname.startsWith('/api/cashier/')) {
      return { pathname: url.pathname, search: url.search };
    }
  } catch {
    /* fall through */
  }
  const [path, search = ''] = (rawUrl || fallbackPath).split('?');
  return { pathname: path || fallbackPath, search: search ? `?${search}` : '' };
}

export async function attachCashierControlHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const { pathname, search } = pathnameAndSearch(raw, '/');
  if (!isCashierControlPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleCashierControlRequest(
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
    log.error('cashier_control_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelCashierControl(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  fallbackPathname: string,
  deps: CashierControlDeps = {},
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
    if (joined) pathname = `/api/cashier/${joined}`;
  }
  const result = await handleCashierControlRequest(
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
