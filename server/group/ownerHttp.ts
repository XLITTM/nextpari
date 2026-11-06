import { GroupControlError } from './errors.js';
import {
  GROUP_OWNER_ACCESS_COOKIE,
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
  loadModel(): Promise<GroupReadModel>;
  readNextpariStats(accessToken: string): Promise<'unavailable' | 'no-currency'>;
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

function clearCookies(secure: boolean): string[] {
  return [GROUP_OWNER_ACCESS_COOKIE, GROUP_OWNER_REFRESH_COOKIE].map(
    (name) => `${name}=; ${cookieFlags(0, secure)}`,
  );
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

function ownerError(error: unknown, secure: boolean): GroupOwnerHttpResult {
  if (error instanceof GroupControlError) {
    if (
      error.code === 'GROUP_SCHEMA_NOT_EXPOSED'
      || error.code === 'GROUP_COLUMN_MISMATCH'
      || error.code === 'GROUP_SCHEMA_UNAVAILABLE'
    ) {
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
      if (!token) return fail(401, 'AUTH_REQUIRED', secure);
      await ports.verifyAccessToken(token);
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

    if (path === '/api/group-owner/auth/session' && method === 'GET') {
      const token = readCookie(input.cookie, GROUP_OWNER_ACCESS_COOKIE);
      if (!token) return fail(401, 'AUTH_REQUIRED');
      const access = await ports.verifyAccessToken(token);
      if (access.aal !== 'aal2') return { status: 200, body: { ok: true, mfaRequired: true }, headers: { 'Cache-Control': 'no-store' } };
      const owner = await ports.loadOwner(access.userId);
      if (!owner || owner.status !== 'active') return fail(403, owner ? 'OWNER_DISABLED' : 'OWNER_UNKNOWN');
      return {
        status: 200,
        body: { ok: true, mfa: 'aal2', ownerId: owner.id, permissions: [...owner.permissions] },
        headers: { 'Cache-Control': 'no-store' },
      };
    }

    if (path === '/api/group-owner/treasury' && method === 'POST') {
      return fail(403, 'TREASURY_WRITES_DISABLED');
    }
    if (path === '/api/group-owner/staff' && method === 'POST') {
      return fail(403, 'STAFF_WRITES_DISABLED');
    }

    const permission = READS[path];
    if (!permission || method !== 'GET') return fail(404, 'NOT_FOUND');
    const { owner, token } = await requireOwner(ports, input.cookie, permission);
    const model = scopeReadModel(await ports.loadModel(), owner.id);
    const nextpari = permission === 'brands.read' || owner.permissions.includes('reports.read')
      ? await ports.readNextpariStats(token)
      : 'unavailable';
    return {
      status: 200,
      body: {
        ok: true,
        source: 'group_control',
        synthetic: false,
        nextpari: nextpari === 'no-currency'
          ? { available: true, brandCode: '001', currencySeparated: false, reason: 'NEXTPARI_STATS_HAVE_NO_CURRENCY' }
          : { available: false, reason: 'NEXTPARI_OWNER_CONTEXT_REQUIRED' },
        data: stripPrivateFields(payloadFor(path, model)),
      },
      headers: { 'Cache-Control': 'no-store' },
    };
  } catch (error) {
    return ownerError(error, secure);
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
