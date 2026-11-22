import type { IncomingMessage, ServerResponse } from 'node:http';
import { reportServerException } from '../observability/sentry.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
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
import { requestIsSecure } from '../staff/ownerCookies.js';
import type { StaffLog } from '../staff/types.js';
import {
  livePlayerAuthPorts,
  resolvePlayerSession,
  type PlayerAuthGatewayPorts,
} from '../player/playerAuthService.js';
import {
  archiveExpress,
  archiveExpiredExpresses,
  createExpressDraft,
  listPublishedExpresses,
  MemoryExpressCatalog,
  publicPlayerExpress,
  publishExpress,
  revalidateExpressForCoupon,
  searchExpressEvents,
  unpublishExpress,
  updateExpressDraft,
  type ExpressAuditEvent,
  type ExpressCatalogPort,
  type ExpressOfDay,
  type ExpressSelectionInput,
  type ExpressStore,
} from './expressOfDay.js';

export const OWNER_EXPRESS_PATH = '/api/owner/express';
export const PLAYER_EXPRESS_PATH = '/api/player/sports/express';

export interface ExpressAuditPort {
  append(event: ExpressAuditEvent): Promise<void>;
}

export class MemoryExpressAudit implements ExpressAuditPort {
  readonly events: ExpressAuditEvent[] = [];
  async append(event: ExpressAuditEvent): Promise<void> {
    this.events.push(event);
  }
}

export class SchemaUnavailableExpressStore implements ExpressStore {
  async list(): Promise<ExpressOfDay[]> {
    return [];
  }
  async get(_id: string): Promise<ExpressOfDay | null> {
    return null;
  }
  async save(_row: ExpressOfDay): Promise<ExpressOfDay> {
    throw staffError('EXPRESS_SCHEMA_UNAVAILABLE', 503);
  }
}

export interface ExpressHttpDeps {
  ownerSession?: OwnerAuthGatewayPorts;
  playerSession?: PlayerAuthGatewayPorts;
  ownerAuth?: (cookie: string | undefined, secure: boolean) => Promise<{ staff: { authUserId: string }; cookies?: string[] }>;
  playerAuth?: (cookie: string | undefined, secure: boolean) => Promise<{ cookies?: string[] }>;
  store?: ExpressStore;
  catalog?: ExpressCatalogPort;
  audit?: ExpressAuditPort;
  now?: () => string;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function headerValue(headers: IncomingMessage['headers'] | Record<string, string | string[] | undefined>, name: string): string | undefined {
  const rec = headers as Record<string, string | string[] | undefined>;
  const value = rec[name] ?? rec[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function queryOf(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

function toResult(result: StaffHttpResult): StaffHttpResult {
  return {
    ...result,
    headers: { ...GAME_NO_STORE_HEADERS, ...result.headers },
  };
}

export function isOwnerExpressPath(pathname: string): boolean {
  return normalizePath(pathname).startsWith(OWNER_EXPRESS_PATH);
}

export function isPlayerExpressPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === PLAYER_EXPRESS_PATH || path.startsWith(`${PLAYER_EXPRESS_PATH}/`);
}

function liveDeps(overrides: ExpressHttpDeps = {}): Required<Pick<ExpressHttpDeps, 'store' | 'catalog' | 'audit' | 'now'>> & ExpressHttpDeps {
  return {
    store: overrides.store ?? new SchemaUnavailableExpressStore(),
    catalog: overrides.catalog ?? new MemoryExpressCatalog(),
    audit: overrides.audit ?? new MemoryExpressAudit(),
    now: overrides.now ?? (() => new Date().toISOString()),
    ownerSession: overrides.ownerSession,
    playerSession: overrides.playerSession,
  };
}

export async function handleOwnerExpressRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: ExpressHttpDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const ports = liveDeps(deps);
  let sessionCookies: string[] | undefined;
  try {
    if (!isOwnerExpressPath(path)) throw staffError('NOT_FOUND', 404);
    const resolved = deps.ownerAuth
      ? await deps.ownerAuth(input.cookie, input.cookieSecure === true)
      : await resolveOwnerSession(ports.ownerSession ?? liveOwnerAuthPorts(), input.cookie, input.cookieSecure === true);
    sessionCookies = resolved.cookies;
    const actorId = resolved.staff.authUserId;
    const nowIso = ports.now();
    const query = queryOf(input.search);
    const rec = asRecord(parseJsonPayload(input.body));

    if (path === `${OWNER_EXPRESS_PATH}/events`) {
      if (method !== 'GET') throw staffError('METHOD_NOT_ALLOWED', 405);
      return toResult({
        status: 200,
        body: { ok: true, data: await searchExpressEvents(ports.catalog, query.get('q') ?? '') },
        cookies: sessionCookies,
      });
    }

    const item = path.match(/^\/api\/owner\/express\/([^/]+)(?:\/(publish|unpublish|archive|preview))?$/);
    if (path === OWNER_EXPRESS_PATH) {
      if (method === 'GET') {
        const archived = archiveExpiredExpresses(await ports.store.list(), nowIso);
        for (const row of archived) {
          if (row.status === 'archived') await ports.store.save(row);
        }
        return toResult({ status: 200, body: { ok: true, data: archived }, cookies: sessionCookies });
      }
      if (method === 'POST') {
        const created = await createExpressDraft({
          title: String(rec.title ?? ''),
          description: rec.description == null ? '' : String(rec.description),
          expiresAt: rec.expiresAt == null ? null : String(rec.expiresAt),
          selections: Array.isArray(rec.selections) ? rec.selections as ExpressSelectionInput[] : [],
          creatorId: actorId,
          nowIso,
          catalog: ports.catalog,
        });
        const saved = await ports.store.save(created);
        await ports.audit.append({
          action: 'EXPRESS_CREATED',
          targetId: saved.id,
          actorId,
          payload: { status: saved.status },
        });
        return toResult({ status: 200, body: { ok: true, data: saved }, cookies: sessionCookies });
      }
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    if (!item) throw staffError('NOT_FOUND', 404);
    const current = await ports.store.get(decodeURIComponent(item[1]));
    if (!current) throw staffError('EXPRESS_NOT_FOUND', 404);
    const action = item[2];

    if (!action && method === 'GET') {
      return toResult({ status: 200, body: { ok: true, data: current }, cookies: sessionCookies });
    }
    if (!action && method === 'PATCH') {
      const updated = await updateExpressDraft(current, {
        title: rec.title == null ? undefined : String(rec.title),
        description: rec.description == null ? undefined : String(rec.description),
        expiresAt: rec.expiresAt === undefined ? undefined : rec.expiresAt == null ? null : String(rec.expiresAt),
        selections: Array.isArray(rec.selections) ? rec.selections as ExpressSelectionInput[] : undefined,
      }, nowIso, ports.catalog);
      const saved = await ports.store.save(updated);
      await ports.audit.append({
        action: 'EXPRESS_UPDATED',
        targetId: saved.id,
        actorId,
        payload: { status: saved.status },
      });
      return toResult({ status: 200, body: { ok: true, data: saved }, cookies: sessionCookies });
    }
    if (action === 'publish' && method === 'POST') {
      const saved = await ports.store.save(await publishExpress(current, actorId, nowIso, ports.catalog));
      await ports.audit.append({
        action: 'EXPRESS_PUBLISHED',
        targetId: saved.id,
        actorId,
        payload: { combinedOdds: saved.combinedOdds },
      });
      return toResult({ status: 200, body: { ok: true, data: saved }, cookies: sessionCookies });
    }
    if (action === 'unpublish' && method === 'POST') {
      const saved = await ports.store.save(unpublishExpress(current, nowIso));
      await ports.audit.append({
        action: 'EXPRESS_UNPUBLISHED',
        targetId: saved.id,
        actorId,
        payload: {},
      });
      return toResult({ status: 200, body: { ok: true, data: saved }, cookies: sessionCookies });
    }
    if (action === 'archive' && method === 'POST') {
      const saved = await ports.store.save(archiveExpress(current, nowIso));
      await ports.audit.append({
        action: 'EXPRESS_ARCHIVED',
        targetId: saved.id,
        actorId,
        payload: {},
      });
      return toResult({ status: 200, body: { ok: true, data: saved }, cookies: sessionCookies });
    }
    if (action === 'preview' && method === 'GET') {
      return toResult({ status: 200, body: { ok: true, data: current }, cookies: sessionCookies });
    }
    throw staffError('METHOD_NOT_ALLOWED', 405);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return toResult({
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        cookies: sessionCookies,
      });
    }
    log.error('owner_express_unhandled', { message: error instanceof Error ? error.message : 'UNHANDLED' });
    await reportServerException(error, {
      subsystem: 'owner_express',
      route: path,
      method,
      eventName: 'owner_express_unhandled',
    });
    return toResult({ status: 500, body: { ok: false, error: 'INTERNAL_ERROR' }, cookies: sessionCookies });
  }
}

export async function handlePlayerExpressRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: ExpressHttpDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const ports = liveDeps(deps);
  let sessionCookies: string[] | undefined;
  try {
    if (!isPlayerExpressPath(path)) throw staffError('NOT_FOUND', 404);
    const resolved = deps.playerAuth
      ? await deps.playerAuth(input.cookie, input.cookieSecure === true)
      : await resolvePlayerSession(ports.playerSession ?? livePlayerAuthPorts(), input.cookie, input.cookieSecure === true);
    sessionCookies = resolved.cookies;
    const nowIso = ports.now();
    if (path === PLAYER_EXPRESS_PATH) {
      if (method !== 'GET') throw staffError('METHOD_NOT_ALLOWED', 405);
      const data = listPublishedExpresses(await ports.store.list(), nowIso);
      return toResult({ status: 200, body: { ok: true, data }, cookies: sessionCookies });
    }
    const match = path.match(/^\/api\/player\/sports\/express\/([^/]+)(?:\/(coupon-validate))?$/);
    if (!match) throw staffError('NOT_FOUND', 404);
    if (method !== 'GET' && method !== 'POST') throw staffError('METHOD_NOT_ALLOWED', 405);
    const row = publicPlayerExpress(await ports.store.get(decodeURIComponent(match[1])) ?? {
      id: '',
      title: '',
      description: '',
      status: 'draft',
      publishedAt: null,
      expiresAt: null,
      combinedOdds: null,
      oddsComputedAt: null,
      creatorId: '',
      publisherId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      selections: [],
    }, nowIso);
    if (!row || !row.id) throw staffError('EXPRESS_NOT_FOUND', 404);
    if (match[2] === 'coupon-validate') {
      if (method !== 'POST') throw staffError('METHOD_NOT_ALLOWED', 405);
      const validation = await revalidateExpressForCoupon(row, ports.catalog, nowIso);
      if (!validation.ok) {
        return toResult({
          status: 409,
          body: { ok: false, error: validation.issues[0]?.code ?? 'EXPRESS_INVALID', issues: validation.issues },
          cookies: sessionCookies,
        });
      }
      return toResult({
        status: 200,
        body: { ok: true, data: { ...row, combinedOdds: validation.combinedOdds } },
        cookies: sessionCookies,
      });
    }
    if (method !== 'GET') throw staffError('METHOD_NOT_ALLOWED', 405);
    return toResult({ status: 200, body: { ok: true, data: row }, cookies: sessionCookies });
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return toResult({
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        cookies: sessionCookies,
      });
    }
    log.error('player_express_unhandled', { message: error instanceof Error ? error.message : 'UNHANDLED' });
    await reportServerException(error, {
      subsystem: 'player_express',
      route: path,
      method,
      eventName: 'player_express_unhandled',
    });
    return toResult({ status: 500, body: { ok: false, error: 'INTERNAL_ERROR' }, cookies: sessionCookies });
  }
}

export async function handleVercelOwnerExpress(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown },
  res: StaffJsonResponse,
  pathname: string,
  deps?: ExpressHttpDeps,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handleOwnerExpressRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    deps,
  );
  writeStaffJson(res, result);
}

export async function handleVercelPlayerExpress(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown },
  res: StaffJsonResponse,
  pathname: string,
  deps?: ExpressHttpDeps,
): Promise<void> {
  const cookie = req.headers.cookie;
  const result = await handlePlayerExpressRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    deps,
  );
  writeStaffJson(res, result);
}

export async function attachOwnerExpressHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: ExpressHttpDeps,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isOwnerExpressPath(pathname)) return false;
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
  const result = await handleOwnerExpressRequest({
    method,
    pathname,
    search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
    cookie: headerValue(req.headers, 'cookie'),
    cookieSecure: requestIsSecure(req.headers),
    body,
  }, deps);
  writeStaffJson(res, result);
  return true;
}

export async function attachPlayerExpressHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: ExpressHttpDeps,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerExpressPath(pathname)) return false;
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
  const result = await handlePlayerExpressRequest({
    method,
    pathname,
    search: (req.url ?? '').includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '',
    cookie: headerValue(req.headers, 'cookie'),
    cookieSecure: requestIsSecure(req.headers),
    body,
  }, deps);
  writeStaffJson(res, result);
  return true;
}
