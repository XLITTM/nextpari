import { isBrandCode, type BrandCode } from './catalog.js';

export const GROUP_OWNER_ACCESS_COOKIE = 'np_group_access';
export const GROUP_OWNER_REFRESH_COOKIE = 'np_group_refresh';

const FORBIDDEN_KEYS = [
  'email',
  'phone',
  'passport',
  'firstName',
  'lastName',
  'first_name',
  'last_name',
  'balance',
  'walletId',
  'wallet_id',
  'password',
  'secret',
  'service_role',
];

export interface GroupOwnerRecord {
  id: string;
  status: 'active' | 'disabled';
  permissions: readonly string[];
}

export interface GroupBrandRow {
  code: BrandCode;
  slug: string;
  displayName: string;
  status: string;
  domain: string | null;
}

export interface GroupStaffRow {
  brandCode: BrandCode;
  role: 'manager' | 'cashier' | 'security';
  staffSubject: string;
}

export interface GroupPlayerRow {
  brandCode: BrandCode;
  publicId: string;
  source: string;
}

export interface GroupFinanceRow {
  brandCode: BrandCode;
  currency: string;
  playerCount: number;
  operationalStatus: string;
  deposits: string;
  withdrawals: string;
  ggr: string;
}

export interface GroupAuditRow {
  id: string;
  brandCode: BrandCode | null;
  actor: string;
  action: string;
  at: string;
}

export interface GroupBrandOwnerRow {
  ownerId: string;
  brandCode: BrandCode;
}

export interface GroupReadModel {
  brands: GroupBrandRow[];
  brandOwners: GroupBrandOwnerRow[];
  grants: GroupStaffRow[];
  players: GroupPlayerRow[];
  finance: GroupFinanceRow[];
  audit: GroupAuditRow[];
}

export function scopeReadModel(model: GroupReadModel, ownerId: string): GroupReadModel {
  const allowed = new Set(
    model.brandOwners.filter((row) => row.ownerId === ownerId).map((row) => row.brandCode),
  );
  const keep = (brandCode: BrandCode | null): boolean => brandCode != null && allowed.has(brandCode);
  return {
    brands: model.brands.filter((row) => allowed.has(row.code)),
    brandOwners: model.brandOwners.filter((row) => row.ownerId === ownerId),
    grants: model.grants.filter((row) => allowed.has(row.brandCode)),
    players: model.players.filter((row) => allowed.has(row.brandCode)),
    finance: model.finance.filter((row) => allowed.has(row.brandCode)),
    audit: model.audit.filter((row) => keep(row.brandCode)),
  };
}

export function stripPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripPrivateFields(item));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key)) continue;
    out[key] = stripPrivateFields(item);
  }
  return out;
}

export function readJwtClaims(token: string): { sub: string; aal: string } | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { sub?: unknown; aal?: unknown };
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const aal = typeof payload.aal === 'string' ? payload.aal : '';
    if (!/^[0-9a-f-]{36}$/i.test(sub)) return null;
    return { sub: sub.toLowerCase(), aal };
  } catch {
    return null;
  }
}

export function asBrandCode(value: unknown): BrandCode | null {
  const code = String(value ?? '');
  return isBrandCode(code) ? code : null;
}
