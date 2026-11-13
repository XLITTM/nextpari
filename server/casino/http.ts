import type { IncomingMessage, ServerResponse } from 'node:http';
import { casinoDemoApi, validCasinoDemoId } from '../../src/lib/casinoDemo.js';
import { GAME_NO_STORE_HEADERS } from '../games/httpCache.js';
import { readPlayerCookies, requestIsSecure } from '../player/playerCookies.js';
import { livePlayerAuthPorts, resolvePlayerSession } from '../player/playerAuthService.js';
import { PLAYER_EXTERNAL_CASINO_GATE_RPC, PLAYER_EXTERNAL_CASINO_RESTRICTED } from '../player/playerSecurityRestrictionGate.js';
import { StaffOnboardingError, staffError } from '../staff/errors.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { parseJsonPayload, readJsonBody, writeStaffJson, type StaffHttpResult, type StaffJsonResponse } from '../staff/httpHandler.js';
import { createServiceRoleClient } from '../supabase/admin.js';
import { asRecord, softAggregator } from './softAggregator.js';

type Headers = IncomingMessage['headers'];

function header(headers: Headers, key: string) {
  const value = headers[key];
  return typeof value === 'string' ? value : undefined;
}

async function authorize(headers: Headers) {
  const cookieHeader = header(headers, 'cookie');
  const parsed = readPlayerCookies(cookieHeader);
  if (!parsed.accessToken && !parsed.refreshToken) throw staffError('JWT_REQUIRED', 401);
  const ports = livePlayerAuthPorts();
  const session = await resolvePlayerSession(ports, cookieHeader, requestIsSecure(headers));
  const { id } = await ports.getAuthUser(session.accessToken);
  const env = loadStaffOnboardingEnv();
  const { error } = await createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey)
    .rpc(PLAYER_EXTERNAL_CASINO_GATE_RPC, { p_player_user_id: id });
  if (error) {
    if (error.message.includes(PLAYER_EXTERNAL_CASINO_RESTRICTED)) {
      throw staffError(PLAYER_EXTERNAL_CASINO_RESTRICTED, 403);
    }
    throw staffError('CASINO_DEMO_ACCESS_UNAVAILABLE', 503);
  }
  return session.cookies;
}

export async function casinoDemoRequest(
  req: { method?: string; url?: string; headers: Headers; body?: unknown },
  deps = { authorize, provider: softAggregator },
): Promise<StaffHttpResult> {
  const headers = { ...GAME_NO_STORE_HEADERS, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  let cookies: string[] | undefined;
  try {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'METHOD_NOT_ALLOWED' }, headers: { ...headers, Allow: 'GET, POST' } };
    }
    const url = new URL(req.url ?? casinoDemoApi, 'http://localhost');
    if (method === 'GET') {
      return { status: 200, body: { ok: true, ...await deps.provider.list(url.searchParams) }, headers, cookies };
    }
    const origin = header(req.headers, 'origin');
    const host = header(req.headers, 'host');
    const local = process.env.NODE_ENV !== 'production' && /^127\.0\.0\.1:\d+$/.test(host ?? '');
    const sameOrigin = host && (host === 'nextpari.net' || host === process.env.VERCEL_URL || local) &&
      origin === `${local ? 'http' : 'https'}://${host}`;
    if (!sameOrigin || !origin) throw staffError('CASINO_DEMO_ORIGIN_DENIED', 403);
    if (!/^application\/json(?:;|$)/i.test(header(req.headers, 'content-type') ?? '')) {
      throw staffError('BODY_INVALID', 400);
    }
    const body = asRecord(parseJsonPayload(req.body));
    if (typeof body.id !== 'string' || !validCasinoDemoId(body.id) ||
        (body.device !== 'mobile' && body.device !== 'desktop')) throw staffError('BODY_INVALID', 400);
    cookies = await deps.authorize(req.headers);
    return { status: 200, body: { ok: true, ...await deps.provider.launch(body.id, body.device, origin) }, headers, cookies };
  } catch (error) {
    const status = error instanceof StaffOnboardingError ? error.httpStatus : 503;
    const code = error instanceof StaffOnboardingError ? error.code : 'CASINO_DEMO_UNAVAILABLE';
    return { status, body: { ok: false, error: code }, headers, cookies };
  }
}

export async function casinoDemoVercel(req: Parameters<typeof casinoDemoRequest>[0], res: StaffJsonResponse) {
  writeStaffJson(res, await casinoDemoRequest(req));
}

export async function attachCasinoDemoHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.url?.split('?')[0] !== casinoDemoApi) return false;
  try {
    await casinoDemoVercel({ method: req.method, url: req.url, headers: req.headers,
      body: req.method === 'POST' ? await readJsonBody(req) : undefined }, res);
  } catch (error) {
    if (!(error instanceof StaffOnboardingError)) throw error;
    writeStaffJson(res, { status: error.httpStatus, body: { ok: false, error: error.code }, headers: GAME_NO_STORE_HEADERS });
  }
  return true;
}
