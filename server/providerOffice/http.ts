import { randomBytes } from 'node:crypto';
import { acceptInvitation, authorizeReport, createInvitation, type Invitation, type OfficeActor } from './access.js';
import { activeContract, oddspapiContract } from './contract.js';
import { officeError, ProviderOfficeError } from './errors.js';
import { periodContaining } from './periods.js';
import { buildSportsbookReport, listContractPeriods, toCsv, type PublicSportsbookReport } from './report.js';
import { unconfiguredReportingSource, type ReportingSource } from './reportingSource.js';
import { publicProviderCatalog, SEED_DIRECTORY, type ProviderDirectory } from './terms.js';

export const PROVIDER_ACCESS_COOKIE = 'np_provider_access';
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_LIMIT = 5;
const SESSION_MS = 8 * 60 * 60 * 1000;

export interface ProviderSession {
  id: string;
  userId: string;
  providerId: string;
  aal: 'aal1' | 'aal2';
  expiresAt: number;
  revoked: boolean;
}

export interface ProviderOfficePorts {
  now(): number;
  authenticate(email: string, password: string): Promise<
    | { status: 'unconfigured' }
    | { status: 'invalid' }
    | { status: 'disabled' }
    | { status: 'ok'; userId: string; providerId: string; mfaEnrolled: boolean }
  >;
  verifyTotp(userId: string, code: string): Promise<boolean>;
  sessions: Map<string, ProviderSession>;
  failures: Map<string, number[]>;
  directory: ProviderDirectory;
  reporting: ReportingSource;
  snapshots: Map<string, PublicSportsbookReport>;
  invitations: Map<string, Invitation>;
}

export interface ProviderHttpResult {
  status: number;
  body: Record<string, unknown> | string;
  cookies?: string[];
  headers?: Record<string, string>;
  contentType?: string;
}

export function unconfiguredProviderPorts(): ProviderOfficePorts {
  return {
    now: () => Date.now(),
    async authenticate() {
      return { status: 'unconfigured' };
    },
    async verifyTotp() {
      return false;
    },
    sessions: new Map(),
    failures: new Map(),
    directory: SEED_DIRECTORY,
    reporting: unconfiguredReportingSource(),
    snapshots: new Map(),
    invitations: new Map(),
  };
}

export async function handleProviderOfficeRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    secure?: boolean;
    body?: unknown;
    clientIp?: string;
  },
  ports: ProviderOfficePorts,
): Promise<ProviderHttpResult> {
  const path = normalize(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.secure === true;
  const body = asRecord(input.body);

  try {
    if (path === '/api/provider-office/auth/login' && method === 'POST') {
      return login(ports, body, input.clientIp ?? 'unknown', secure);
    }
    if (path === '/api/provider-office/auth/mfa' && method === 'POST') {
      return mfa(ports, input.cookie, body, secure);
    }
    if (path === '/api/provider-office/auth/logout' && method === 'POST') {
      return logout(ports, input.cookie, secure);
    }
    if (path === '/api/provider-office/auth/accept' && method === 'POST') {
      const providerId = acceptInvitation(
        ports.invitations,
        String(body.invitationId ?? ''),
        String(body.token ?? ''),
        ports.now(),
      );
      return json(200, { ok: true, providerId, passwordIssued: false });
    }
    if (method !== 'GET') return json(403, { ok: false, error: 'READ_ONLY' });

    const session = requireSession(ports, input.cookie, 'aal2');
    const actor: OfficeActor = { kind: 'provider', providerId: session.providerId };
    if (path === '/api/provider-office/account') {
      const provider = ports.directory.providers.find((item) => item.id === session.providerId);
      return json(200, {
        ok: true,
        readOnly: true,
        providerId: session.providerId,
        legalEntity: provider?.legalEntity ?? '',
        access: 'read',
        language: provider?.defaultLanguage ?? 'en',
        mfa: session.aal,
      });
    }
    const contract = activeContract(ports.directory, session.providerId, todayUtc(ports.now()));
    if (!contract) return json(403, { ok: false, error: 'CONTRACT_NOT_FOUND' });
    if (path === '/api/provider-office/periods') {
      return json(200, {
        ok: true,
        periods: listContractPeriods(contract.commencementDate, todayUtc(ports.now()), contract.periodStartDay),
      });
    }
    if (path !== '/api/provider-office/report') return json(404, { ok: false, error: 'NOT_FOUND' });
    return await report(ports, actor, input.search ?? '', contract.periodStartDay);
  } catch (error) {
    const code = officeError(error);
    const status = code === 'AUTH_REQUIRED' || code === 'SESSION_REVOKED' || code === 'SESSION_EXPIRED' ? 401 : 403;
    return json(status, { ok: false, error: code });
  }
}

export function isGroupProviderPath(pathname: string): boolean {
  const path = normalize(pathname);
  return path.startsWith('/api/group-owner/provider')
    || path === '/api/group-owner/sportsbook-ggr'
    || path === '/api/group-owner/casino-ggr';
}

export async function handleGroupProviderRoute(
  input: { method: string; pathname: string; search?: string },
  reporting: ReportingSource = unconfiguredReportingSource(),
): Promise<ProviderHttpResult | null> {
  const path = normalize(input.pathname);
  const method = input.method.toUpperCase();
  const providerPath = path.startsWith('/api/group-owner/provider')
    || path === '/api/group-owner/sportsbook-ggr'
    || path === '/api/group-owner/casino-ggr';
  if (!providerPath) return null;
  if (method === 'POST') return json(409, { ok: false, error: 'PROVIDER_WRITES_DISABLED', applied: false });
  if (method !== 'GET') return json(404, { ok: false, error: 'NOT_FOUND' });
  if (path === '/api/group-owner/providers' || path === '/api/group-owner/provider-contracts' || path === '/api/group-owner/provider-accounts') {
    return json(200, {
      ok: true,
      source: 'provider_office',
      synthetic: false,
      writesEnabled: false,
      accountsIssued: false,
      catalog: publicProviderCatalog(),
    });
  }
  if (path === '/api/group-owner/casino-ggr') {
    return json(200, { ok: true, available: false, error: 'CASINO_SOURCE_UNAVAILABLE', includedInOddspapi: false });
  }
  if (path !== '/api/group-owner/sportsbook-ggr') return json(404, { ok: false, error: 'NOT_FOUND' });

  const params = new URLSearchParams(input.search ?? '');
  const brandCode = params.get('brand');
  const requestedAsOf = params.get('asOf') ?? '';
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(requestedAsOf) ? requestedAsOf : todayUtc(Date.now());
  let authorizedBrand = '001';
  try {
    authorizedBrand = authorizeReport({ kind: 'group_owner' }, SEED_DIRECTORY, {
      providerId: oddspapiContract(SEED_DIRECTORY).providerId,
      brandCode,
      scope: 'sportsbook_ggr',
      onDate: asOf,
    }).brandCode;
  } catch (error) {
    return json(403, { ok: false, error: officeError(error) });
  }
  const loaded = await reporting.load(authorizedBrand, periodContaining(asOf, 23));
  if (!loaded.ok) {
    const status = loaded.error === 'BRAND_DATABASE_NOT_CONNECTED' ? 403 : 503;
    return json(status, { ok: false, error: loaded.error });
  }
  const built = buildSportsbookReport({
    actor: { kind: 'group_owner' },
    directory: SEED_DIRECTORY,
    brandCode: '001',
    asOf,
    facts: loaded.facts,
    loadedAt: loaded.loadedAt,
    rate: loaded.rate,
  });
  if (!built.ok) return json(403, { ok: false, error: built.error });
  return json(200, { ok: true, synthetic: false, report: built });
}

export function issueInvitation(ports: ProviderOfficePorts, providerId: string): { invitationId: string; token: string } {
  return createInvitation(ports.invitations, providerId, ports.now());
}

async function login(
  ports: ProviderOfficePorts,
  body: Record<string, unknown>,
  clientIp: string,
  secure: boolean,
): Promise<ProviderHttpResult> {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) return json(400, { ok: false, error: 'EMAIL_PASSWORD_REQUIRED' });
  const key = `${email}|${clientIp}`;
  if (limited(ports, key)) return json(429, { ok: false, error: 'LOGIN_RATE_LIMITED' });
  const result = await ports.authenticate(email, password);
  if (result.status === 'unconfigured') return json(503, { ok: false, error: 'AUTH_NOT_CONFIGURED' });
  if (result.status === 'disabled') return json(403, { ok: false, error: 'PROVIDER_DISABLED' });
  if (result.status !== 'ok') {
    recordFailure(ports, key);
    return json(401, { ok: false, error: 'AUTH_FAILED' });
  }
  ports.failures.delete(key);
  const session = createSession(ports, result.userId, result.providerId, 'aal1');
  return {
    status: 200,
    body: { ok: true, mfa: 'required', readOnly: true },
    cookies: [writeCookie(session.id, secure)],
    headers: { 'Cache-Control': 'no-store' },
  };
}

async function mfa(
  ports: ProviderOfficePorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<ProviderHttpResult> {
  const session = requireSession(ports, cookieHeader, 'aal1');
  const code = String(body.code ?? '');
  if (!/^\d{6}$/.test(code)) return json(400, { ok: false, error: 'MFA_INVALID' });
  const key = `mfa|${session.userId}`;
  if (limited(ports, key)) return json(429, { ok: false, error: 'LOGIN_RATE_LIMITED' });
  if (!await ports.verifyTotp(session.userId, code)) {
    recordFailure(ports, key);
    return json(401, { ok: false, error: 'MFA_INVALID' });
  }
  session.aal = 'aal2';
  return {
    status: 200,
    body: { ok: true, mfa: 'aal2', readOnly: true },
    cookies: [writeCookie(session.id, secure)],
    headers: { 'Cache-Control': 'no-store' },
  };
}

function logout(ports: ProviderOfficePorts, cookieHeader: string | undefined, secure: boolean): ProviderHttpResult {
  const id = readCookie(cookieHeader, PROVIDER_ACCESS_COOKIE);
  const session = id ? ports.sessions.get(id) : undefined;
  if (session) session.revoked = true;
  return { status: 200, body: { ok: true }, cookies: [clearCookie(secure)], headers: { 'Cache-Control': 'no-store' } };
}

async function report(
  ports: ProviderOfficePorts,
  actor: OfficeActor,
  search: string,
  startDay: number,
): Promise<ProviderHttpResult> {
  const params = new URLSearchParams(search);
  const brandCode = params.get('brand');
  const periodStart = params.get('period');
  const asOf = todayUtc(ports.now());
  if (actor.kind !== 'provider') return json(403, { ok: false, error: 'PROVIDER_ISOLATION' });
  const authorized = authorizeReport(actor, ports.directory, {
    providerId: actor.providerId,
    brandCode,
    scope: 'sportsbook_ggr',
    onDate: asOf,
  });
  const period = periodContaining(periodStart || asOf, startDay);
  const loaded = await ports.reporting.load(authorized.brandCode, period);
  if (!loaded.ok) return json(loaded.error === 'BRAND_DATABASE_NOT_CONNECTED' ? 403 : 503, { ok: false, error: loaded.error });
  const built = buildSportsbookReport({
    actor,
    directory: ports.directory,
    brandCode,
    asOf,
    periodStart,
    facts: loaded.facts,
    loadedAt: loaded.loadedAt,
    rate: loaded.rate,
    snapshots: ports.snapshots,
  });
  if (!built.ok) {
    const status = built.error === 'REPORTING_SOURCE_UNAVAILABLE' ? 503 : 403;
    return json(status, { ok: false, error: built.error });
  }
  if ((params.get('format') ?? '').toLowerCase() === 'csv') {
    return { status: 200, body: toCsv(built), contentType: 'text/csv; charset=utf-8', headers: { 'Cache-Control': 'no-store' } };
  }
  return json(200, { ok: true, synthetic: false, report: built });
}

function requireSession(ports: ProviderOfficePorts, cookieHeader: string | undefined, minimum: 'aal1' | 'aal2'): ProviderSession {
  const id = readCookie(cookieHeader, PROVIDER_ACCESS_COOKIE);
  if (!id) throw new ProviderOfficeError('AUTH_REQUIRED');
  const session = ports.sessions.get(id);
  if (!session) throw new ProviderOfficeError('SESSION_REVOKED');
  if (session.revoked) throw new ProviderOfficeError('SESSION_REVOKED');
  if (session.expiresAt <= ports.now()) throw new ProviderOfficeError('SESSION_EXPIRED');
  if (minimum === 'aal2' && session.aal !== 'aal2') throw new ProviderOfficeError('MFA_REQUIRED');
  return session;
}

function createSession(ports: ProviderOfficePorts, userId: string, providerId: string, aal: 'aal1' | 'aal2'): ProviderSession {
  const session: ProviderSession = {
    id: randomBytes(32).toString('hex'),
    userId,
    providerId,
    aal,
    expiresAt: ports.now() + SESSION_MS,
    revoked: false,
  };
  ports.sessions.set(session.id, session);
  return session;
}

function limited(ports: ProviderOfficePorts, key: string): boolean {
  const now = ports.now();
  const recent = (ports.failures.get(key) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
  ports.failures.set(key, recent);
  return recent.length >= FAILURE_LIMIT;
}

function recordFailure(ports: ProviderOfficePorts, key: string): void {
  const recent = (ports.failures.get(key) ?? []).filter((at) => ports.now() - at < FAILURE_WINDOW_MS);
  recent.push(ports.now());
  ports.failures.set(key, recent);
}

function todayUtc(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function writeCookie(value: string, secure: boolean): string {
  return `${PROVIDER_ACCESS_COOKIE}=${encodeURIComponent(value)}; ${cookieFlags(SESSION_MS / 1000, secure)}`;
}

function clearCookie(secure: boolean): string {
  return `${PROVIDER_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`;
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

function readCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalize(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function json(status: number, body: Record<string, unknown>, cookies?: string[]): ProviderHttpResult {
  return { status, body, cookies, headers: { 'Cache-Control': 'no-store' } };
}
