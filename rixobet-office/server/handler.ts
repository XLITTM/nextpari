import { BRAND } from '../src/brand';
import { ROLE_CEILING, type OfficeRole, type Permission } from '../src/access/model';
import { canAccess } from '../src/access/guard';
import { matchRoute } from '../src/nav/catalog';
import { operationalFlagsClosed } from './catalog';
import {
  createMfaSecret,
  dummyPasswordHash,
  hashPassword,
  hashSecret,
  loginAccepted,
  passwordAccepted,
  randomToken,
  totpMatches,
  verifyPassword,
} from './crypto';
import { isVerifiedRole, type OfficeRepository, type SessionRecord, type StaffRecord } from './repository';
import { requestOriginAllowed } from './origin';
import { createLimiter } from './rateLimit';

const CHALLENGE_MS = 5 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const COOKIE = 'rxo_office_session';
const PREFIX = '/api/rixobet/office/v1';

const MUTATION_PREFIXES = [
  '/owner/treasury',
  '/owner/payments',
  '/owner/reports/sportsbook',
  '/owner/reports/casino',
  '/owner/reports/financial',
  '/owner/staff',
  '/cashier/deposits',
  '/cashier/withdrawals',
  '/cashier/confirmations',
  '/security/restrictions',
  '/players',
];

export interface OfficeRequest {
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  body: unknown;
}

export interface OfficeResponse {
  status: number;
  body: unknown;
  setCookie: string[];
}

interface ReadyOffice {
  repository: OfficeRepository;
  pepper: string;
  now: () => number;
  secureCookie: boolean;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function loginOf(body: Record<string, unknown>): string {
  const login = text(body.login).trim().toLowerCase();
  const email = text(body.email).trim().toLowerCase();
  if (login && email && login !== email) return '';
  return login || email;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pathnameOf(path: string): string {
  const withoutQuery = path.split('?')[0] ?? '/';
  const stripped = withoutQuery.startsWith(PREFIX) ? withoutQuery.slice(PREFIX.length) || '/' : withoutQuery;
  if (stripped.length > 1 && stripped.endsWith('/')) return stripped.slice(0, -1);
  return stripped || '/';
}

function cookieValue(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=') || null;
  }
  return null;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/api/rixobet/office/v1',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function unavailable(diagnostic?: string): OfficeResponse {
  const body = diagnostic
    ? { brandCode: BRAND.code, status: 'unavailable' as const, diagnostic }
    : { brandCode: BRAND.code, status: 'unavailable' as const };
  return { status: 503, body, setCookie: [] };
}

function denied(status = 401): OfficeResponse {
  return { status, body: { brandCode: BRAND.code, accepted: false }, setCookie: [] };
}

function limited(): OfficeResponse {
  return { status: 429, body: { brandCode: BRAND.code, accepted: false }, setCookie: [] };
}

const buckets = new WeakMap<OfficeRepository, { login: ReturnType<typeof createLimiter>; activation: ReturnType<typeof createLimiter> }>();

function limitsFor(repository: OfficeRepository) {
  const existing = buckets.get(repository);
  if (existing) return existing;
  const created = { login: createLimiter(8, 15 * 60 * 1000), activation: createLimiter(5, 15 * 60 * 1000) };
  buckets.set(repository, created);
  return created;
}

function clientIp(headers: OfficeRequest['headers']): string {
  const forwarded = headers['x-forwarded-for']?.split(',')[0]?.trim() ?? '';
  return /^[0-9a-fA-F:.]{3,64}$/.test(forwarded) ? forwarded : 'absent';
}

function sessionBody(session: SessionRecord, role: OfficeRole) {
  return {
    sessionId: session.publicId,
    brandCode: BRAND.code,
    role,
    permissions: [...ROLE_CEILING[role]],
    mfaSatisfied: true as const,
    expiresAt: session.expiresAt,
    staffId: session.staffId,
    displayName: session.displayName,
  };
}

async function officeReady(office: ReadyOffice): Promise<boolean> {
  const flags = await office.repository.flags();
  return operationalFlagsClosed(flags);
}

async function authenticated(office: ReadyOffice, request: OfficeRequest): Promise<
  | { ok: true; session: SessionRecord; role: OfficeRole }
  | { ok: false; response: OfficeResponse }
> {
  if (!(await officeReady(office))) return { ok: false, response: unavailable() };
  const token = cookieValue(request.headers.cookie);
  if (!token) return { ok: false, response: denied(401) };
  const session = await office.repository.readSession(hashSecret(office.pepper, token));
  if (!session || session.revokedAt || session.status !== 'active') return { ok: false, response: denied(401) };
  if (session.brandCode !== BRAND.code) return { ok: false, response: denied(403) };
  if (session.mfaSatisfied !== true) return { ok: false, response: denied(401) };
  if (Date.parse(session.expiresAt) <= office.now()) return { ok: false, response: denied(401) };
  if (!isVerifiedRole(session.role)) return { ok: false, response: denied(403) };
  return { ok: true, session, role: session.role };
}

function permissionsFor(role: OfficeRole): readonly Permission[] {
  return ROLE_CEILING[role];
}

async function issueSession(office: ReadyOffice, staff: StaffRecord): Promise<OfficeResponse> {
  if (!isVerifiedRole(staff.role)) return denied(403);
  if (!/^[A-Za-z0-9:_-]{4,80}$/.test(staff.id)) return denied(401);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s'.-]{0,79}$/u.test(staff.displayName)) return denied(401);
  const token = randomToken(32);
  const issuedAt = new Date(office.now()).toISOString();
  const expiresAt = new Date(office.now() + SESSION_MS).toISOString();
  const session = await office.repository.createSession({
    staffId: staff.id,
    secretHash: hashSecret(office.pepper, token),
    expiresAt,
    issuedAt,
    mfaSatisfied: true,
  });
  if (session.brandCode !== BRAND.code || session.mfaSatisfied !== true || session.role !== staff.role) return denied(403);
  return {
    status: 200,
    body: sessionBody(session, staff.role),
    setCookie: [sessionCookie(token, Math.floor(SESSION_MS / 1000), office.secureCookie)],
  };
}

async function login(office: ReadyOffice, request: OfficeRequest, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== BRAND.code) return denied(403);
  const login = loginOf(body);
  const password = text(body.password);
  if (!limitsFor(office.repository).login.allow(`${clientIp(request.headers)}|${login}`, office.now())) return limited();
  if (!loginAccepted(login) || !passwordAccepted(password)) return denied(401);
  const staff = await office.repository.findStaffByEmail(login);
  const hash = staff?.passwordHash ?? dummyPasswordHash();
  const passwordOk = verifyPassword(password, hash);
  if (!staff || staff.brandCode !== BRAND.code || !passwordOk) return denied(401);
  if (!isVerifiedRole(staff.role)) return denied(403);
  if (staff.status !== 'active' || !staff.identityVerifiedAt || staff.authUserId !== null) return denied(401);
  if (staff.mfaSecret) {
    const challenge = await office.repository.createChallenge(staff.id, new Date(office.now() + CHALLENGE_MS).toISOString());
    return {
      status: 200,
      body: { brandCode: BRAND.code, status: 'mfa_required', challengeId: challenge.id },
      setCookie: [],
    };
  }
  return issueSession(office, staff);
}

async function confirmMfa(office: ReadyOffice, request: OfficeRequest, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== BRAND.code) return denied(403);
  if (!limitsFor(office.repository).login.allow(`${clientIp(request.headers)}|mfa|${text(body.challengeId)}`, office.now())) {
    return limited();
  }
  const challenge = await office.repository.readChallenge(text(body.challengeId));
  if (!challenge || challenge.brandCode !== BRAND.code || challenge.consumedAt) return denied(401);
  if (Date.parse(challenge.expiresAt) <= office.now() || challenge.attemptCount >= MAX_ATTEMPTS) return denied(401);
  const owner = await office.repository.findStaffById(challenge.staffId);
  if (!owner || owner.brandCode !== BRAND.code || owner.status !== 'active' || !owner.mfaSecret || !isVerifiedRole(owner.role)) {
    return denied(401);
  }
  if (!/^[A-Za-z0-9:_-]{4,80}$/.test(owner.id)) return denied(401);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s'.-]{0,79}$/u.test(owner.displayName)) return denied(401);
  const step = totpMatches(owner.mfaSecret, text(body.code), office.now(), owner.mfaLastStep);
  if (step === null) {
    await office.repository.failChallenge(challenge.id);
    return denied(401);
  }
  const claimed = await office.repository.claimChallenge(challenge.id, new Date(office.now()).toISOString());
  if (!claimed) return denied(401);
  await office.repository.recordMfaStep(owner.id, step);
  return issueSession(office, owner);
}

async function activation(office: ReadyOffice, request: OfficeRequest, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== undefined && body.brandCode !== BRAND.code) return denied(403);
  const login = loginOf(body);
  const token = text(body.invitationToken);
  const password = text(body.password);
  if (!limitsFor(office.repository).activation.allow(`${clientIp(request.headers)}|${login}`, office.now())) return limited();
  if (!loginAccepted(login) || token.length < 20 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token) || !passwordAccepted(password)) {
    return denied(401);
  }
  const staff = await office.repository.claimInvitation(login, hashSecret(office.pepper, token), new Date(office.now()).toISOString());
  if (!staff) return denied(401);
  const secret = body.enrollMfa === true ? createMfaSecret() : null;
  const enrolled = await office.repository.enrollInvitedOwner(staff.id, hashPassword(password), secret);
  if (!enrolled) return unavailable();
  if (!secret) {
    const activated = await office.repository.verifyInvitedOwner(staff.id, new Date(office.now()).toISOString(), null);
    if (!activated) return unavailable();
    return { status: 200, body: { brandCode: BRAND.code, status: 'activated' }, setCookie: [] };
  }
  return {
    status: 200,
    body: {
      brandCode: BRAND.code,
      status: 'verification_required',
      otpauthUri: `otpauth://totp/RIXO%20BET:${encodeURIComponent(login)}?secret=${secret}&issuer=RIXO%20BET&digits=6&period=30`,
    },
    setCookie: [],
  };
}

async function confirmActivation(office: ReadyOffice, request: OfficeRequest, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== undefined && body.brandCode !== BRAND.code) return denied(403);
  const login = loginOf(body);
  if (!limitsFor(office.repository).activation.allow(`${clientIp(request.headers)}|confirm|${login}`, office.now())) return limited();
  const staff = await office.repository.findStaffByEmail(login);
  if (!staff || staff.brandCode !== BRAND.code || staff.status !== 'invited' || staff.authUserId !== null) return denied(401);
  if (!staff.invitationConsumedAt || !staff.passwordHash || !staff.mfaSecret || staff.identityVerifiedAt) return denied(401);
  const step = totpMatches(staff.mfaSecret, text(body.code), office.now(), staff.mfaLastStep);
  if (step === null) return denied(401);
  const verified = await office.repository.verifyInvitedOwner(staff.id, new Date(office.now()).toISOString(), step);
  if (!verified) return unavailable();
  return { status: 200, body: { brandCode: BRAND.code, status: 'identity_verified' }, setCookie: [] };
}

export async function handleOffice(
  request: OfficeRequest,
  office: ReadyOffice | null,
  diagnostic?: string,
): Promise<OfficeResponse> {
  try {
    return await dispatchOffice(request, office, diagnostic);
  } catch {
    return unavailable(diagnostic ?? 'handler_failed');
  }
}
async function dispatchOffice(
  request: OfficeRequest,
  office: ReadyOffice | null,
  diagnostic?: string,
): Promise<OfficeResponse> {
  if (!office) return unavailable(diagnostic);
  if (!requestOriginAllowed(request.headers, request.method)) return denied(403);
  const path = pathnameOf(request.path);
  const body = record(request.body) ?? {};
  if (request.method === 'POST' && path === '/auth/login') return login(office, request, body);
  if (request.method === 'POST' && path === '/auth/mfa') return confirmMfa(office, request, body);
  if (request.method === 'POST' && path === '/auth/activation') return activation(office, request, body);
  if (request.method === 'POST' && path === '/auth/activation/confirm') return confirmActivation(office, request, body);

  const auth = await authenticated(office, request);
  if (request.method === 'GET' && path === '/auth/session') {
    if (!auth.ok) return auth.response;
    return { status: 200, body: sessionBody(auth.session, auth.role), setCookie: [] };
  }
  if (request.method === 'POST' && path === '/auth/logout') {
    const token = cookieValue(request.headers.cookie);
    if (token) await office.repository.revokeSession(hashSecret(office.pepper, token), new Date(office.now()).toISOString());
    return { status: 200, body: { brandCode: BRAND.code, status: 'signed_out' }, setCookie: [sessionCookie('', 0, office.secureCookie)] };
  }
  if (!auth.ok) return auth.response;

  const route = matchRoute(path);
  if (route && !canAccess({ ...sessionBody(auth.session, auth.role), permissions: permissionsFor(auth.role) }, route)) {
    return denied(403);
  }
  if (!route && !MUTATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return unavailable();
  }
  if (request.method === 'POST') return denied(403);
  return unavailable();
}

export function officeFor(
  repository: OfficeRepository,
  pepper: string,
  now = Date.now,
  secureCookie = true,
): ReadyOffice {
  return { repository, pepper, now, secureCookie };
}
