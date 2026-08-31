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
  liveOwnerAuthPorts,
  resolveOwnerSession,
  type OwnerAuthGatewayPorts,
} from '../staff/ownerAuthService.js';
import { publicOwnerStaff } from '../staff/ownerContext.js';
import { clearOwnerCookies, requestIsSecure } from '../staff/ownerCookies.js';
import type { StaffLog } from '../staff/types.js';
import { createOwnerJwtRpc, type OwnerRpcPort } from './ownerRpc.js';

export interface OwnerControlDeps {
  sessionPorts?: OwnerAuthGatewayPorts;
  rpcFactory?: (accessToken: string) => OwnerRpcPort;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isOwnerControlPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/owner/')) return false;
  if (path.startsWith('/api/owner/auth/')) return false;
  if (path.startsWith('/api/owner/staff/')) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function queryOf(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

function parseLimit(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw staffError('LIMIT_INVALID', 400);
  return Math.min(200, Math.max(0, Math.floor(n)));
}

function parseOffset(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw staffError('OFFSET_INVALID', 400);
  return Math.floor(n);
}

function requireId(value: string, code: string): string {
  const id = value.trim();
  if (!id) throw staffError(code, 400);
  return id;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value === 'boolean') return value;
  throw staffError(code, 400);
}

type ControlAction =
  | { kind: 'me' }
  | { kind: 'dashboard' }
  | { kind: 'cashiers' }
  | { kind: 'ledger'; cashierId: string }
  | { kind: 'freeze'; cashierId: string }
  | { kind: 'risk' }
  | { kind: 'players' }
  | { kind: 'dossier'; playerId: string }
  | { kind: 'block'; playerId: string }
  | { kind: 'withdrawals' }
  | { kind: 'message' };

function matchControl(method: string, pathname: string): ControlAction | 'method' | null {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();

  const ledger = path.match(/^\/api\/owner\/cashiers\/([^/]+)\/ledger$/);
  if (ledger) return m === 'GET' ? { kind: 'ledger', cashierId: ledger[1] } : 'method';

  const freeze = path.match(/^\/api\/owner\/cashiers\/([^/]+)\/freeze$/);
  if (freeze) return m === 'POST' ? { kind: 'freeze', cashierId: freeze[1] } : 'method';

  const block = path.match(/^\/api\/owner\/players\/([^/]+)\/block$/);
  if (block) return m === 'POST' ? { kind: 'block', playerId: block[1] } : 'method';

  const dossier = path.match(/^\/api\/owner\/players\/([^/]+)$/);
  if (dossier) return m === 'GET' ? { kind: 'dossier', playerId: dossier[1] } : 'method';

  if (path === '/api/owner/me') return m === 'GET' ? { kind: 'me' } : 'method';
  if (path === '/api/owner/dashboard') return m === 'GET' ? { kind: 'dashboard' } : 'method';
  if (path === '/api/owner/cashiers') return m === 'GET' ? { kind: 'cashiers' } : 'method';
  if (path === '/api/owner/risk-bets') return m === 'GET' ? { kind: 'risk' } : 'method';
  if (path === '/api/owner/players') return m === 'GET' ? { kind: 'players' } : 'method';
  if (path === '/api/owner/withdrawals') return m === 'GET' ? { kind: 'withdrawals' } : 'method';
  if (path === '/api/owner/messages') return m === 'POST' ? { kind: 'message' } : 'method';
  return null;
}

async function runControl(
  action: ControlAction,
  rpc: OwnerRpcPort,
  query: URLSearchParams,
  body: unknown,
): Promise<unknown> {
  const rec = asRecord(body);
  switch (action.kind) {
    case 'me':
      return null;
    case 'dashboard':
      return rpc.invoke('owner_dashboard_stats');
    case 'cashiers':
      return rpc.invoke('owner_list_cashiers');
    case 'ledger':
      return rpc.invoke('owner_cashier_ledger', {
        p_cashier_id: requireId(decodeURIComponent(action.cashierId), 'CASHIER_ID_REQUIRED'),
        p_from: query.get('from') || null,
      });
    case 'freeze':
      return rpc.invoke('owner_set_cashier_frozen', {
        p_cashier_id: requireId(decodeURIComponent(action.cashierId), 'CASHIER_ID_REQUIRED'),
        p_frozen: requireBoolean(rec.frozen, 'FROZEN_REQUIRED'),
        p_reason: rec.reason == null ? null : String(rec.reason).trim() || null,
      });
    case 'risk':
      return rpc.invoke('owner_list_risk_bets');
    case 'players':
      return rpc.invoke('owner_list_players', {
        p_search: query.get('search')?.trim() || null,
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'dossier':
      return rpc.invoke('owner_player_dossier', {
        p_player_id: requireId(decodeURIComponent(action.playerId), 'PLAYER_ID_REQUIRED'),
      });
    case 'block':
      return rpc.invoke('owner_set_player_blocked', {
        p_player_id: requireId(decodeURIComponent(action.playerId), 'PLAYER_ID_REQUIRED'),
        p_blocked: requireBoolean(rec.blocked, 'BLOCKED_REQUIRED'),
        p_reason: rec.reason == null ? null : String(rec.reason).trim() || null,
      });
    case 'withdrawals':
      return rpc.invoke('owner_list_withdrawals', {
        p_status: query.get('status')?.trim() || null,
        p_limit: parseLimit(query.get('limit'), 100),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'message': {
      const targetType = rec.targetType === 'all' || rec.targetType === 'player'
        ? rec.targetType
        : '';
      if (!targetType) throw staffError('TARGET_TYPE_INVALID', 400);
      const bodyText = String(rec.body ?? '');
      if (!bodyText.trim()) throw staffError('MESSAGE_BODY_REQUIRED', 400);
      return rpc.invoke('owner_send_message', {
        p_target_type: targetType,
        p_target_player_id: targetType === 'player' ? (rec.targetPlayerId ?? null) : null,
        p_title: rec.title == null ? null : String(rec.title).trim() || null,
        p_body: bodyText,
      });
    }
    default:
      throw staffError('NOT_FOUND', 404);
  }
}

export async function handleOwnerControlRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: OwnerControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const matched = matchControl(method, path);
  let sessionCookies: string[] | undefined;

  try {
    if (!isOwnerControlPath(path) || matched === null) {
      throw staffError('NOT_FOUND', 404);
    }
    if (matched === 'method') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    const sessionPorts = deps.sessionPorts ?? liveOwnerAuthPorts();
    const resolved = await resolveOwnerSession(sessionPorts, input.cookie, secure);
    sessionCookies = resolved.cookies;
    if (matched.kind === 'me') {
      return {
        status: 200,
        body: { ok: true, staff: publicOwnerStaff(resolved.staff) },
        cookies: sessionCookies,
      };
    }

    const rpc = (deps.rpcFactory ?? createOwnerJwtRpc)(resolved.accessToken);
    const data = await runControl(matched, rpc, queryOf(input.search), parseJsonPayload(input.body));
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
        cookies: error.httpStatus === 401 ? clearOwnerCookies(secure) : sessionCookies,
      };
    }
    log.error('owner_control_unhandled', {
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
    if (url.pathname.startsWith('/api/owner/')) {
      return { pathname: url.pathname, search: url.search };
    }
  } catch {
    /* fall through */
  }
  const [path, search = ''] = (rawUrl || fallbackPath).split('?');
  return { pathname: path || fallbackPath, search: search ? `?${search}` : '' };
}

export async function attachOwnerControlHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const { pathname, search } = pathnameAndSearch(raw, '/');
  if (!isOwnerControlPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleOwnerControlRequest(
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
    log.error('owner_control_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelOwnerControl(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  fallbackPathname: string,
  deps: OwnerControlDeps = {},
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
    if (joined) pathname = `/api/owner/${joined}`;
  }
  const result = await handleOwnerControlRequest(
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
