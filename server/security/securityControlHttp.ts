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
  liveSecurityAuthPorts,
  resolveSecuritySession,
  type SecurityAuthGatewayPorts,
} from '../staff/securityAuthService.js';
import { publicSecurityStaff } from '../staff/securityContext.js';
import { clearSecurityCookies, requestIsSecure } from '../staff/securityCookies.js';
import type { StaffLog } from '../staff/types.js';
import { createSecurityJwtRpc, type SecurityRpcPort } from './securityRpc.js';

export interface SecurityControlDeps {
  sessionPorts?: SecurityAuthGatewayPorts;
  rpcFactory?: (accessToken: string) => SecurityRpcPort;
}

function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  return withoutQuery.replace(/\/$/, '') || '/';
}

export function isSecurityControlPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/security/')) return false;
  if (path.startsWith('/api/security/auth/')) return false;
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

function requireReason(value: unknown): string {
  const reason = String(value ?? '').trim();
  if (!reason) throw staffError('REASON_REQUIRED', 400);
  if (reason.length > 500) throw staffError('REASON_TOO_LONG', 400);
  return reason;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value === 'boolean') return value;
  throw staffError(code, 400);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, requiredCode: string, invalidCode: string): string {
  const id = String(value ?? '').trim();
  if (!id) throw staffError(requiredCode, 400);
  if (!UUID_RE.test(id)) throw staffError(invalidCode, 400);
  return id;
}

function requirePlayerPublicId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!id) throw staffError('PLAYER_ID_REQUIRED', 400);
  if (UUID_RE.test(id)) throw staffError('PLAYER_WALLET_ID_FORBIDDEN', 400);
  return id;
}

function requireAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw staffError('AMOUNT_REQUIRED', 400);
  if (n <= 0) throw staffError('AMOUNT_NOT_POSITIVE', 400);
  return n;
}

function optionalTimestamp(raw: string | null): string | null {
  if (raw == null || raw.trim() === '') return null;
  const value = raw.trim();
  if (!Number.isFinite(Date.parse(value))) throw staffError('PERIOD_INVALID', 400);
  return new Date(value).toISOString();
}

function optionalFilter(value: string | null, code: string, max = 64): string | null {
  if (value == null || value.trim() === '') return null;
  const text = value.trim();
  if (text.length > max) throw staffError(code, 400);
  return text;
}

type ControlAction =
  | { kind: 'me' }
  | { kind: 'overview' }
  | { kind: 'flags' }
  | { kind: 'flagReview'; flagId: string }
  | { kind: 'flagResolve'; flagId: string }
  | { kind: 'flagDismiss'; flagId: string }
  | { kind: 'dossier'; playerId: string }
  | { kind: 'restrictionGet'; playerId: string }
  | { kind: 'restrictionSet'; playerId: string }
  | { kind: 'sportsBets'; playerId: string }
  | { kind: 'sportsSummary'; playerId: string }
  | { kind: 'sportsBet'; playerId: string; betId: string }
  | { kind: 'activity' };

function matchControl(method: string, pathname: string): ControlAction | 'method' | null {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();

  if (path === '/api/security/me') return m === 'GET' ? { kind: 'me' } : 'method';
  if (path === '/api/security/overview') return m === 'GET' ? { kind: 'overview' } : 'method';
  if (path === '/api/security/flags') return m === 'GET' ? { kind: 'flags' } : 'method';
  if (path === '/api/security/activity') return m === 'GET' ? { kind: 'activity' } : 'method';

  const flagReview = path.match(/^\/api\/security\/flags\/([^/]+)\/review$/);
  if (flagReview) return m === 'POST' ? { kind: 'flagReview', flagId: flagReview[1] } : 'method';
  const flagResolve = path.match(/^\/api\/security\/flags\/([^/]+)\/resolve$/);
  if (flagResolve) return m === 'POST' ? { kind: 'flagResolve', flagId: flagResolve[1] } : 'method';
  const flagDismiss = path.match(/^\/api\/security\/flags\/([^/]+)\/dismiss$/);
  if (flagDismiss) return m === 'POST' ? { kind: 'flagDismiss', flagId: flagDismiss[1] } : 'method';

  const sportsBet = path.match(/^\/api\/security\/players\/([^/]+)\/sports\/([^/]+)$/);
  if (sportsBet) {
    if (sportsBet[2] === 'summary') {
      return m === 'GET' ? { kind: 'sportsSummary', playerId: sportsBet[1] } : 'method';
    }
    return m === 'GET' ? { kind: 'sportsBet', playerId: sportsBet[1], betId: sportsBet[2] } : 'method';
  }
  const sports = path.match(/^\/api\/security\/players\/([^/]+)\/sports$/);
  if (sports) return m === 'GET' ? { kind: 'sportsBets', playerId: sports[1] } : 'method';

  const restriction = path.match(/^\/api\/security\/players\/([^/]+)\/security-restriction$/);
  if (restriction) {
    if (m === 'GET') return { kind: 'restrictionGet', playerId: restriction[1] };
    if (m === 'POST') return { kind: 'restrictionSet', playerId: restriction[1] };
    return 'method';
  }

  const dossier = path.match(/^\/api\/security\/players\/([^/]+)$/);
  if (dossier) return m === 'GET' ? { kind: 'dossier', playerId: dossier[1] } : 'method';

  return null;
}

function sportsListArgs(playerId: string, query: URLSearchParams): Record<string, unknown> {
  return {
    p_player_id: requirePlayerPublicId(decodeURIComponent(playerId)),
    p_from: optionalTimestamp(query.get('from')),
    p_to: optionalTimestamp(query.get('to')),
    p_feed_type: optionalFilter(query.get('feedType') ?? query.get('feed_type'), 'FEED_TYPE_INVALID'),
    p_mode: optionalFilter(query.get('mode'), 'SPORTS_MODE_INVALID'),
    p_status: optionalFilter(query.get('status'), 'SPORTS_STATUS_INVALID'),
    p_league: optionalFilter(query.get('league'), 'LEAGUE_INVALID', 120),
    p_fixture: optionalFilter(query.get('fixture'), 'FIXTURE_INVALID', 120),
    p_market: optionalFilter(query.get('market'), 'MARKET_INVALID', 120),
    p_min_stake: query.get('minStake') || query.get('min_stake')
      ? requireAmount(query.get('minStake') ?? query.get('min_stake'))
      : null,
    p_min_odds: query.get('minOdds') || query.get('min_odds')
      ? requireAmount(query.get('minOdds') ?? query.get('min_odds'))
      : null,
    p_limit: parseLimit(query.get('limit'), 50),
    p_offset: parseOffset(query.get('offset')),
  };
}

async function runControl(
  action: ControlAction,
  rpc: SecurityRpcPort,
  query: URLSearchParams,
  body: unknown,
): Promise<unknown> {
  const rec = asRecord(body);
  switch (action.kind) {
    case 'me':
      return null;
    case 'overview':
      return rpc.invoke('security_security_overview');
    case 'flags':
      return rpc.invoke('security_list_security_flags', {
        p_status: optionalFilter(query.get('status'), 'FLAG_STATUS_INVALID'),
        p_severity: optionalFilter(query.get('severity') ?? query.get('priority'), 'FLAG_SEVERITY_INVALID'),
        p_flag_type: optionalFilter(query.get('flagType') ?? query.get('flag_type'), 'FLAG_TYPE_INVALID'),
        p_player_id: (query.get('playerId') ?? query.get('player_id'))?.trim()
          ? requirePlayerPublicId(query.get('playerId') ?? query.get('player_id'))
          : null,
        p_from: optionalTimestamp(query.get('from')),
        p_to: optionalTimestamp(query.get('to')),
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'flagReview':
      return rpc.invoke('security_resolve_security_flag', {
        p_flag_id: requireUuid(decodeURIComponent(action.flagId), 'FLAG_ID_REQUIRED', 'FLAG_ID_INVALID'),
        p_action: 'review',
        p_reason: rec.reason == null ? '' : String(rec.reason),
      });
    case 'flagResolve':
      return rpc.invoke('security_resolve_security_flag', {
        p_flag_id: requireUuid(decodeURIComponent(action.flagId), 'FLAG_ID_REQUIRED', 'FLAG_ID_INVALID'),
        p_action: 'resolve',
        p_reason: requireReason(rec.reason),
      });
    case 'flagDismiss':
      return rpc.invoke('security_resolve_security_flag', {
        p_flag_id: requireUuid(decodeURIComponent(action.flagId), 'FLAG_ID_REQUIRED', 'FLAG_ID_INVALID'),
        p_action: 'dismiss',
        p_reason: requireReason(rec.reason),
      });
    case 'dossier':
      return rpc.invoke('security_player_security', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
      });
    case 'restrictionGet':
      return rpc.invoke('security_player_security_restriction', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
      });
    case 'restrictionSet':
      return rpc.invoke('security_set_player_security_restriction', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_restricted: requireBoolean(rec.restricted, 'RESTRICTED_REQUIRED'),
        p_reason: requireReason(rec.reason),
      });
    case 'sportsBets':
      return rpc.invoke('security_player_sports_bets', sportsListArgs(action.playerId, query));
    case 'sportsSummary':
      return rpc.invoke('security_player_sports_summary', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_from: optionalTimestamp(query.get('from')),
        p_to: optionalTimestamp(query.get('to')),
      });
    case 'sportsBet':
      return rpc.invoke('security_player_sports_bet', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_bet_id: requireUuid(decodeURIComponent(action.betId), 'BET_ID_REQUIRED', 'BET_ID_INVALID'),
      });
    case 'activity':
      return rpc.invoke('security_activity_feed', {
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    default:
      throw staffError('NOT_FOUND', 404);
  }
}

export async function handleSecurityControlRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: SecurityControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const matched = matchControl(method, path);
  let sessionCookies: string[] | undefined;

  try {
    if (!isSecurityControlPath(path) || matched === null) {
      throw staffError('NOT_FOUND', 404);
    }
    if (matched === 'method') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    const sessionPorts = deps.sessionPorts ?? liveSecurityAuthPorts();
    const resolved = await resolveSecuritySession(sessionPorts, input.cookie, secure);
    sessionCookies = resolved.cookies;
    if (matched.kind === 'me') {
      return {
        status: 200,
        body: { ok: true, staff: publicSecurityStaff(resolved.staff) },
        cookies: sessionCookies,
      };
    }

    const rpc = (deps.rpcFactory ?? createSecurityJwtRpc)(resolved.accessToken);
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
        cookies: error.httpStatus === 401 ? clearSecurityCookies(secure) : sessionCookies,
      };
    }
    log.error('security_control_unhandled', {
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
    if (url.pathname.startsWith('/api/security/')) {
      return { pathname: url.pathname, search: url.search };
    }
  } catch {
    /* fall through */
  }
  const [path, search = ''] = (rawUrl || fallbackPath).split('?');
  return { pathname: path || fallbackPath, search: search ? `?${search}` : '' };
}

export async function attachSecurityControlHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const { pathname, search } = pathnameAndSearch(raw, '/');
  if (!isSecurityControlPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleSecurityControlRequest(
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
    log.error('security_control_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelSecurityControl(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  fallbackPathname: string,
  deps: SecurityControlDeps = {},
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
    if (joined) pathname = `/api/security/${joined}`;
  }
  const result = await handleSecurityControlRequest(
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
