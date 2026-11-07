import { BRAND } from '../src/brand';
import { ROLE_CEILING, type OfficeRole, type Permission } from '../src/access/model';
import { canAccess } from '../src/access/guard';
import { matchRoute } from '../src/nav/catalog';
import { operationalFlagsClosed } from './catalog';
import {
  createMfaSecret,
  dummyPasswordHash,
  emailAccepted,
  hashPassword,
  hashSecret,
  passwordAccepted,
  randomToken,
  secretsMatch,
  totpMatches,
  verifyPassword,
} from './crypto';
import { isVerifiedRole, type OfficeRepository, type SessionRecord } from './repository';

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

function unavailable(): OfficeResponse {
  return { status: 503, body: { brandCode: BRAND.code, status: 'unavailable' }, setCookie: [] };
}

function denied(status = 401): OfficeResponse {
  return { status, body: { brandCode: BRAND.code, accepted: false }, setCookie: [] };
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

async function login(office: ReadyOffice, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== BRAND.code) return denied(403);
  const email = text(body.email).trim().toLowerCase();
  const password = text(body.password);
  if (!emailAccepted(email) || !passwordAccepted(password)) return denied(401);
  const staff = await office.repository.findStaffByEmail(email);
  const hash = staff?.passwordHash ?? dummyPasswordHash();
  const passwordOk = verifyPassword(password, hash);
  if (!staff || staff.brandCode !== BRAND.code || !passwordOk) return denied(401);
  if (!isVerifiedRole(staff.role)) return denied(403);
  if (staff.status !== 'active' || !staff.identityVerifiedAt || !staff.mfaSecret || staff.authUserId !== null) {
    return denied(401);
  }
  const challenge = await office.repository.createChallenge(staff.id, new Date(office.now() + CHALLENGE_MS).toISOString());
  return {
    status: 200,
    body: { brandCode: BRAND.code, status: 'mfa_required', challengeId: challenge.id },
    setCookie: [],
  };
}

async function confirmMfa(office: ReadyOffice, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== BRAND.code) return denied(403);
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
  const token = randomToken(32);
  const issuedAt = new Date(office.now()).toISOString();
  const expiresAt = new Date(office.now() + SESSION_MS).toISOString();
  const session = await office.repository.createSession({
    staffId: owner.id,
    secretHash: hashSecret(office.pepper, token),
    expiresAt,
    issuedAt,
    mfaSatisfied: true,
  });
  if (session.brandCode !== BRAND.code || session.mfaSatisfied !== true) return denied(403);
  return {
    status: 200,
    body: sessionBody(session, owner.role),
    setCookie: [sessionCookie(token, Math.floor(SESSION_MS / 1000), office.secureCookie)],
  };
}

async function activation(office: ReadyOffice, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== undefined && body.brandCode !== BRAND.code) return denied(403);
  const email = text(body.email).trim().toLowerCase();
  const token = text(body.invitationToken);
  const password = text(body.password);
  if (!emailAccepted(email) || token.length < 20 || !passwordAccepted(password)) return denied(401);
  const invited = (await office.repository.listInvitedOwners()).filter((row) => row.brandCode === BRAND.code);
  const staff = invited.find((row) => row.email.toLowerCase() === email);
  if (invited.length !== 1 || !staff || staff.role !== 'owner' || staff.authUserId !== null) return unavailable();
  if (!staff.invitationDeliveredAt || !staff.invitationTokenHash) return unavailable();
  if (!secretsMatch(staff.invitationTokenHash, hashSecret(office.pepper, token))) return denied(401);
  if (staff.identityVerifiedAt) return unavailable();
  const secret = createMfaSecret();
  const enrolled = await office.repository.enrollInvitedOwner(staff.id, hashPassword(password), secret);
  if (!enrolled) return unavailable();
  return {
    status: 200,
    body: {
      brandCode: BRAND.code,
      status: 'verification_required',
      otpauthUri: `otpauth://totp/RIXO%20BET:${encodeURIComponent(email)}?secret=${secret}&issuer=RIXO%20BET&digits=6&period=30`,
    },
    setCookie: [],
  };
}

async function confirmActivation(office: ReadyOffice, body: Record<string, unknown>): Promise<OfficeResponse> {
  if (!(await officeReady(office))) return unavailable();
  if (body.brandCode !== undefined && body.brandCode !== BRAND.code) return denied(403);
  const email = text(body.email).trim().toLowerCase();
  const staff = (await office.repository.listInvitedOwners()).find((row) => row.email.toLowerCase() === email);
  if (!staff || staff.brandCode !== BRAND.code || staff.status !== 'invited' || !staff.invitationDeliveredAt) return unavailable();
  if (!staff.passwordHash || !staff.mfaSecret || staff.identityVerifiedAt || staff.authUserId !== null) return unavailable();
  const step = totpMatches(staff.mfaSecret, text(body.code), office.now(), staff.mfaLastStep);
  if (step === null) return denied(401);
  const verified = await office.repository.verifyInvitedOwner(staff.id, new Date(office.now()).toISOString(), step);
  if (!verified) return unavailable();
  return { status: 200, body: { brandCode: BRAND.code, status: 'identity_verified' }, setCookie: [] };
}

export async function handleOffice(request: OfficeRequest, office: ReadyOffice | null): Promise<OfficeResponse> {
  try {
    return await dispatchOffice(request, office);
  } catch {
    return unavailable();
  }
}
async function dispatchOffice(request: OfficeRequest, office: ReadyOffice | null): Promise<OfficeResponse> {
  if (!office) return unavailable();
  const path = pathnameOf(request.path);
  const body = record(request.body) ?? {};
  if (request.method === 'POST' && path === '/auth/login') return login(office, body);
  if (request.method === 'POST' && path === '/auth/mfa') return confirmMfa(office, body);
  if (request.method === 'POST' && path === '/auth/activation') return activation(office, body);
  if (request.method === 'POST' && path === '/auth/activation/confirm') return confirmActivation(office, body);

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
