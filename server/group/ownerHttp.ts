import { GroupControlError } from './errors.js';
import { sanitizeAuthAudit, type GroupAuthAudit } from './ownerAudit.js';
import {
  GROUP_OWNER_ACCESS_COOKIE,
  GROUP_OWNER_RECOVERY_COOKIE,
  GROUP_OWNER_RECOVERY_REFRESH_COOKIE,
  GROUP_OWNER_REFRESH_COOKIE,
  asBrandCode,
  readJwtClaims,
  scopeReadModel,
  stripPrivateFields,
  type GroupAuditRow,
  type GroupBrandOwnerRow,
  type GroupBrandRow,
  type GroupFinanceRow,
  type GroupOwnerRecord,
  type GroupPlayerRow,
  type GroupReadModel,
  type GroupStaffRow,
} from './ownerReadModel.js';

export interface VerifiedGroupAccess {
  userId: string;
  aal: 'aal1' | 'aal2';
}

export interface GroupOwnerPorts {
  signInWithPassword(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }>;
  verifyAccessToken(accessToken: string): Promise<VerifiedGroupAccess>;
  listVerifiedTotpFactor(accessToken: string): Promise<string | null>;
  verifyTotp(accessToken: string, factorId: string, code: string): Promise<{ accessToken: string; refreshToken: string }>;
  enrollTotp(accessToken: string): Promise<{ factorId: string; uri: string }>;
  loadOwner(userId: string): Promise<GroupOwnerRecord | null>;
  loadModel(ownerId: string): Promise<GroupReadModel>;
  auditAuthFailure(event: GroupAuthAudit): void;
  requestPasswordRecovery(email: string): Promise<void>;
  verifyRecoverySession(accessToken: string): Promise<VerifiedGroupAccess>;
  updateRecoveredPassword(accessToken: string, refreshToken: string, password: string): Promise<void>;
}

export interface GroupOwnerHttpResult {
  status: number;
  body: Record<string, unknown>;
  cookies?: string[];
  headers?: Record<string, string>;
}

const READS: Record<string, string> = {
  '/api/group-owner/overview': 'brands.read',
  '/api/group-owner/brands': 'brands.read',
  '/api/group-owner/staff': 'staff.map',
  '/api/group-owner/players': 'reports.read',
  '/api/group-owner/finance': 'reports.read',
  '/api/group-owner/access': 'staff.map',
  '/api/group-owner/audit': 'reports.read',
  '/api/group-owner/treasury': 'reports.read',
};

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function writeCookies(accessToken: string, refreshToken: string, secure: boolean): string[] {
  return [
    `${GROUP_OWNER_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(60 * 60, secure)}`,
    `${GROUP_OWNER_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(60 * 60 * 24 * 7, secure)}`,
  ];
}

function clearNamed(names: readonly string[], secure: boolean): string[] {
  return names.map((name) => `${name}=; ${cookieFlags(0, secure)}`);
}

function clearCookies(secure: boolean): string[] {
  return clearNamed([
    GROUP_OWNER_ACCESS_COOKIE,
    GROUP_OWNER_REFRESH_COOKIE,
    GROUP_OWNER_RECOVERY_COOKIE,
    GROUP_OWNER_RECOVERY_REFRESH_COOKIE,
  ], secure);
}

function writeRecoveryCookies(accessToken: string, refreshToken: string, secure: boolean): string[] {
  return [
    `${GROUP_OWNER_RECOVERY_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(10 * 60, secure)}`,
    `${GROUP_OWNER_RECOVERY_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(10 * 60, secure)}`,
    ...clearNamed([GROUP_OWNER_ACCESS_COOKIE, GROUP_OWNER_REFRESH_COOKIE], secure),
  ];
}

function readCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return '';
}

function fail(status: number, error: string, secure = false): GroupOwnerHttpResult {
  return {
    status,
    body: { ok: false, error },
    headers: { 'Cache-Control': 'no-store' },
    cookies: status === 401 ? clearCookies(secure) : undefined,
  };
}

function recordFailure(
  ports: GroupOwnerPorts,
  pathname: string,
  code: string,
  userId: string | null,
): void {
  const event = sanitizeAuthAudit({ code, pathname, userId });
  if (event) ports.auditAuthFailure(event);
}

const DATABASE_FAILURES = new Set([
  'GROUP_SCHEMA_NOT_EXPOSED',
  'GROUP_COLUMN_MISMATCH',
  'GROUP_SCHEMA_UNAVAILABLE',
  'GROUP_DATABASE_SSL',
  'GROUP_DATABASE_AUTH',
  'GROUP_DATABASE_FORBIDDEN',
  'GROUP_DATABASE_UNAVAILABLE',
  'GROUP_RLS_HIDES_OWNER',
]);

function ownerError(error: unknown, secure: boolean): GroupOwnerHttpResult {
  if (error instanceof GroupControlError) {
    if (DATABASE_FAILURES.has(error.code)) {
      return fail(503, error.code);
    }
    if (error.code === 'AUTH_FAILED' || error.code === 'AUTH_REQUIRED' || error.code === 'JWT_INVALID') {
      return fail(401, error.code, secure);
    }
    return fail(403, error.code);
  }
  return fail(401, 'AUTH_FAILED', secure);
}

async function requireOwner(
  ports: GroupOwnerPorts,
  cookie: string | undefined,
  permission: string,
): Promise<{ access: VerifiedGroupAccess; owner: GroupOwnerRecord; token: string }> {
  const token = readCookie(cookie, GROUP_OWNER_ACCESS_COOKIE);
  if (!token) throw new GroupControlError('AUTH_REQUIRED');
  const access = await ports.verifyAccessToken(token);
  const claims = readJwtClaims(token);
  if (!claims || claims.sub !== access.userId || claims.aal !== access.aal) {
    throw new GroupControlError('JWT_INVALID');
  }
  if (access.aal !== 'aal2') throw new GroupControlError('MFA_REQUIRED');
  const owner = await ports.loadOwner(access.userId);
  if (!owner) throw new GroupControlError('OWNER_UNKNOWN');
  if (owner.status !== 'active') throw new GroupControlError('OWNER_DISABLED');
  if (!owner.permissions.includes(permission)) throw new GroupControlError('OWNER_PERMISSION_DENIED');
  return { access, owner, token };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recoveryInvalid(
  ports: GroupOwnerPorts,
  pathname: string,
  secure: boolean,
  userId: string | null,
  code = 'RECOVERY_LINK_INVALID',
): GroupOwnerHttpResult {
  recordFailure(ports, pathname, code, userId);
  return {
    status: 400,
    body: { ok: false, error: 'RECOVERY_LINK_INVALID' },
    cookies: clearCookies(secure),
    headers: { 'Cache-Control': 'no-store' },
  };
}

function recoveryOwnerDenied(
  ports: GroupOwnerPorts,
  pathname: string,
  secure: boolean,
  userId: string,
  owner: GroupOwnerRecord | null,
): GroupOwnerHttpResult | null {
  if (owner && owner.status === 'active') return null;
  const code = owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN';
  recordFailure(ports, pathname, code, userId);
  return { ...fail(403, code), cookies: clearCookies(secure) };
}

function recoveryDatabaseFailure(
  ports: GroupOwnerPorts,
  pathname: string,
  userId: string,
  error: unknown,
): GroupOwnerHttpResult | null {
  if (!(error instanceof GroupControlError) || !DATABASE_FAILURES.has(error.code)) return null;
  recordFailure(ports, pathname, error.code, userId);
  return fail(503, error.code);
}

function isExpiredRecovery(error: unknown): boolean {
  return error instanceof GroupControlError
    && (error.code === 'JWT_INVALID' || error.code === 'RECOVERY_LINK_INVALID' || error.code === 'AUTH_FAILED');
}

function financeStaysSplit(rows: readonly GroupFinanceRow[]): GroupFinanceRow[] {
  return rows.map((row) => ({
    brandCode: row.brandCode,
    currency: row.currency,
    playerCount: row.playerCount,
    operationalStatus: row.operationalStatus,
    deposits: row.deposits,
    withdrawals: row.withdrawals,
    ggr: row.ggr,
  }));
}

export async function handleGroupOwnerRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    secure?: boolean;
    body?: unknown;
  },
  ports: GroupOwnerPorts,
): Promise<GroupOwnerHttpResult> {
  const path = input.pathname.replace(/\/$/, '') || '/';
  const method = input.method.toUpperCase();
  const secure = input.secure === true;
  const body = input.body && typeof input.body === 'object' ? input.body as Record<string, unknown> : {};

  try {
    if (path === '/api/group-owner/auth/login' && method === 'POST') {
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      if (!email || !password) return fail(400, 'EMAIL_PASSWORD_REQUIRED', secure);
      const tokens = await ports.signInWithPassword(email, password);
      const access = await ports.verifyAccessToken(tokens.accessToken);
      const owner = await ports.loadOwner(access.userId);
      if (!owner || owner.status !== 'active') {
        const code = owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN';
        recordFailure(ports, path, code, access.userId);
        return { ...fail(403, code), cookies: clearCookies(secure) };
      }
      if (access.aal === 'aal2') {
        return {
          status: 200,
          body: { ok: true, mfa: 'aal2' },
          cookies: writeCookies(tokens.accessToken, tokens.refreshToken, secure),
          headers: { 'Cache-Control': 'no-store' },
        };
      }
      const factorId = await ports.listVerifiedTotpFactor(tokens.accessToken);
      return {
        status: 200,
        body: { ok: true, mfaRequired: true, enrollmentRequired: factorId == null, factorId },
        cookies: writeCookies(tokens.accessToken, tokens.refreshToken, secure),
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/mfa' && method === 'POST') {
      const token = readCookie(input.cookie, GROUP_OWNER_ACCESS_COOKIE);
      const factorId = String(body.factorId ?? '');
      const code = String(body.code ?? '').trim();
      if (!token || !factorId || !/^[0-9]{6}$/.test(code)) return fail(400, 'MFA_CODE_REQUIRED', secure);
      const pending = await ports.verifyAccessToken(token);
      const owner = await ports.loadOwner(pending.userId);
      if (!owner || owner.status !== 'active') {
        const code = owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN';
        recordFailure(ports, path, code, pending.userId);
        return { ...fail(403, code), cookies: clearCookies(secure) };
      }
      const tokens = await ports.verifyTotp(token, factorId, code);
      const access = await ports.verifyAccessToken(tokens.accessToken);
      if (access.aal !== 'aal2') return fail(401, 'MFA_REQUIRED', secure);
      return {
        status: 200,
        body: { ok: true, mfa: 'aal2' },
        cookies: writeCookies(tokens.accessToken, tokens.refreshToken, secure),
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/enroll' && method === 'POST') {
      const token = readCookie(input.cookie, GROUP_OWNER_ACCESS_COOKIE);
      if (!token) {
        recordFailure(ports, path, 'AUTH_REQUIRED', null);
        return fail(401, 'AUTH_REQUIRED', secure);
      }
      const pending = await ports.verifyAccessToken(token);
      const owner = await ports.loadOwner(pending.userId);
      if (!owner || owner.status !== 'active') {
        const code = owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN';
        recordFailure(ports, path, code, pending.userId);
        return { ...fail(403, code), cookies: clearCookies(secure) };
      }
      const enrolled = await ports.enrollTotp(token);
      return {
        status: 200,
        body: { ok: true, factorId: enrolled.factorId, uri: enrolled.uri },
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/logout' && method === 'POST') {
      return { status: 200, body: { ok: true }, cookies: clearCookies(secure), headers: { 'Cache-Control': 'no-store' } };
    }

    if (path === '/api/group-owner/auth/recover' && method === 'POST') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 320) return fail(400, 'EMAIL_REQUIRED', secure);
      try {
        await ports.requestPasswordRecovery(email);
      } catch (error) {
        if (error instanceof GroupControlError && error.code === 'RECOVERY_UNAVAILABLE') {
          return fail(503, 'RECOVERY_UNAVAILABLE');
        }
        return {
          status: 200,
          body: { ok: true },
          headers: { 'Cache-Control': 'no-store' },
        };
      }
      return {
        status: 200,
        body: { ok: true },
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/recover/verify' && method === 'POST') {
      const accessToken = String(body.accessToken ?? '');
      const refreshToken = String(body.refreshToken ?? '');
      if (!accessToken || !refreshToken) return recoveryInvalid(ports, path, secure, null);
      let access: VerifiedGroupAccess;
      try {
        access = await ports.verifyRecoverySession(accessToken);
      } catch (error) {
        if (isExpiredRecovery(error)) return recoveryInvalid(ports, path, secure, null);
        throw error;
      }
      let owner: GroupOwnerRecord | null;
      try {
        owner = await ports.loadOwner(access.userId);
      } catch (error) {
        const failure = recoveryDatabaseFailure(ports, path, access.userId, error);
        if (failure) return failure;
        throw error;
      }
      const denied = recoveryOwnerDenied(ports, path, secure, access.userId, owner);
      if (denied) return denied;
      return {
        status: 200,
        body: { ok: true },
        cookies: writeRecoveryCookies(accessToken, refreshToken, secure),
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/recover/complete' && method === 'POST') {
      const password = String(body.password ?? '');
      const confirm = String(body.confirm ?? '');
      if (password.length < 8 || password !== confirm) return fail(400, 'PASSWORD_MISMATCH', secure);
      const accessToken = readCookie(input.cookie, GROUP_OWNER_RECOVERY_COOKIE);
      const refreshToken = readCookie(input.cookie, GROUP_OWNER_RECOVERY_REFRESH_COOKIE);
      if (!accessToken || !refreshToken) return recoveryInvalid(ports, path, secure, null);
      let access: VerifiedGroupAccess;
      try {
        access = await ports.verifyRecoverySession(accessToken);
      } catch (error) {
        if (isExpiredRecovery(error)) return recoveryInvalid(ports, path, secure, null);
        throw error;
      }
      let owner: GroupOwnerRecord | null;
      try {
        owner = await ports.loadOwner(access.userId);
      } catch (error) {
        const failure = recoveryDatabaseFailure(ports, path, access.userId, error);
        if (failure) return failure;
        throw error;
      }
      const denied = recoveryOwnerDenied(ports, path, secure, access.userId, owner);
      if (denied) return denied;
      try {
        await ports.updateRecoveredPassword(accessToken, refreshToken, password);
      } catch (error) {
        if (isExpiredRecovery(error)) return recoveryInvalid(ports, path, secure, access.userId);
        if (error instanceof GroupControlError && error.code === 'PASSWORD_REJECTED') {
          return fail(400, 'PASSWORD_REJECTED', secure);
        }
        throw error;
      }
      return {
        status: 200,
        body: { ok: true },
        cookies: clearCookies(secure),
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/auth/session' && method === 'GET') {
      const token = readCookie(input.cookie, GROUP_OWNER_ACCESS_COOKIE);
      if (!token) {
        recordFailure(ports, path, 'AUTH_REQUIRED', null);
        return fail(401, 'AUTH_REQUIRED');
      }
      const access = await ports.verifyAccessToken(token);
      if (access.aal !== 'aal2') return { status: 200, body: { ok: true, mfaRequired: true }, headers: { 'Cache-Control': 'no-store' } };
      const owner = await ports.loadOwner(access.userId);
      if (!owner || owner.status !== 'active') {
        const code = owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN';
        recordFailure(ports, path, code, access.userId);
        return { ...fail(403, code), cookies: clearCookies(secure) };
      }
      return {
        status: 200,
        body: { ok: true, mfa: 'aal2', ownerId: owner.id, permissions: [...owner.permissions] },
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/treasury' && method === 'POST') {
      recordFailure(ports, path, 'TREASURY_WRITES_DISABLED', null);
      return fail(403, 'TREASURY_WRITES_DISABLED');
    }
    if (path === '/api/group-owner/staff' && method === 'POST') {
      recordFailure(ports, path, 'STAFF_WRITES_DISABLED', null);
      return fail(403, 'STAFF_WRITES_DISABLED');
    }

    const permission = READS[path];
    if (!permission || method !== 'GET') return fail(404, 'NOT_FOUND');
    const { owner } = await requireOwner(ports, input.cookie, permission);
    const model = scopeReadModel(await ports.loadModel(owner.id), owner.id);
    return {
      status: 200,
      body: {
        ok: true,
        source: 'group_control',
        synthetic: false,
        nextpari: { available: false, reason: 'NEXTPARI_REPORT_ADAPTER_REQUIRED' },
        data: stripPrivateFields(payloadFor(path, model)),
      },
      headers: { 'Cache-Control': 'no-store' },
    };
  } catch (error) {
    const result = ownerError(error, secure);
    if (result.status === 401 || result.status === 403) {
      recordFailure(ports, path, String(result.body.error ?? 'AUTH_FAILED'), null);
    }
    return result;
  }
}

function payloadFor(path: string, model: GroupReadModel): unknown {
  if (path === '/api/group-owner/treasury') {
    return { available: false, reason: 'TREASURY_READ_UNAUDITED', rows: [] as GroupFinanceRow[] };
  }
  if (path === '/api/group-owner/brands') return model.brands;
  if (path === '/api/group-owner/staff' || path === '/api/group-owner/access') {
    return { permissionsRequired: 'staff.map', grants: model.grants, brandOwners: model.brandOwners };
  }
  if (path === '/api/group-owner/players') return model.players;
  if (path === '/api/group-owner/finance') return financeStaysSplit(model.finance);
  if (path === '/api/group-owner/audit') return model.audit;
  return {
    brands: model.brands,
    grants: model.grants,
    players: model.players,
    finance: financeStaysSplit(model.finance),
    audit: model.audit,
  };
}

export function mapGroupRows(input: {
  brands?: unknown[];
  brandOwners?: unknown[];
  grants?: unknown[];
  players?: unknown[];
  finance?: unknown[];
  audit?: unknown[];
}): GroupReadModel {
  const row = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' ? value as Record<string, unknown> : {}
  );
  return {
    brands: (input.brands ?? []).map((item): GroupBrandRow | null => {
      const record = row(item);
      const code = asBrandCode(record.code);
      if (!code) return null;
      return {
        code,
        slug: String(record.slug ?? ''),
        displayName: String(record.display_name ?? record.displayName ?? code),
        status: String(record.status ?? ''),
        domain: record.domain == null ? null : String(record.domain),
      };
    }).filter((item): item is GroupBrandRow => item != null),
    brandOwners: (input.brandOwners ?? []).map((item): GroupBrandOwnerRow | null => {
      const record = row(item);
      const brandCode = asBrandCode(record.brand_code ?? record.brandCode);
      const ownerId = String(record.owner_id ?? record.ownerId ?? '');
      if (!brandCode || !ownerId) return null;
      return { ownerId, brandCode };
    }).filter((item): item is GroupBrandOwnerRow => item != null),
    grants: (input.grants ?? []).map((item): GroupStaffRow | null => {
      const record = row(item);
      const brandCode = asBrandCode(record.brand_code ?? record.brandCode);
      const role = String(record.role ?? '');
      const staffSubject = String(record.staff_subject ?? record.staffSubject ?? '');
      if (!brandCode || (role !== 'manager' && role !== 'cashier' && role !== 'security') || !staffSubject) return null;
      return { brandCode, role, staffSubject };
    }).filter((item): item is GroupStaffRow => item != null),
    players: (input.players ?? []).map((item): GroupPlayerRow | null => {
      const record = row(item);
      const brandCode = asBrandCode(record.brand_code ?? record.brandCode);
      const publicId = String(record.public_id ?? record.publicId ?? '');
      if (!brandCode || !/^[0-9]{1,18}$/.test(publicId)) return null;
      return { brandCode, publicId, source: String(record.source ?? '') };
    }).filter((item): item is GroupPlayerRow => item != null),
    finance: (input.finance ?? []).map((item): GroupFinanceRow | null => {
      const record = row(item);
      const brandCode = asBrandCode(record.brand_code ?? record.brandCode);
      if (!brandCode) return null;
      return {
        brandCode,
        currency: String(record.currency ?? ''),
        playerCount: Number(record.player_count ?? record.playerCount ?? 0),
        operationalStatus: String(record.operational_status ?? record.operationalStatus ?? ''),
        deposits: String(record.deposits ?? ''),
        withdrawals: String(record.withdrawals ?? ''),
        ggr: String(record.ggr ?? ''),
      };
    }).filter((item): item is GroupFinanceRow => item != null),
    audit: (input.audit ?? []).map((item): GroupAuditRow | null => {
      const record = row(item);
      const brandValue = record.brand_code ?? record.brandCode;
      return {
        id: String(record.id ?? ''),
        brandCode: brandValue == null ? null : asBrandCode(brandValue),
        actor: String(record.actor ?? ''),
        action: String(record.action ?? ''),
        at: String(record.created_at ?? record.at ?? ''),
      };
    }).filter((item): item is GroupAuditRow => item != null),
  };
}
