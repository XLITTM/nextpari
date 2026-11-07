import { BRAND, type BrandCode } from '../brand';
import { isOfficeRole, isPermission, ROLE_CEILING, type OfficeRole, type Permission } from './model';

export interface OfficeSession {
  sessionId: string;
  brandCode: BrandCode;
  role: OfficeRole;
  permissions: readonly Permission[];
  mfaSatisfied: true;
  expiresAt: string;
  staffId: string;
  displayName: string;
}

export type SessionRejection = 'malformed' | 'brand' | 'role' | 'permissions' | 'mfa' | 'expired';

export type ParsedSession =
  | { ok: true; session: OfficeSession }
  | { ok: false; reason: SessionRejection };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readToken(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  if (!/^[A-Za-z0-9:_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return null;
  if (/[\u0000-\u001F]/.test(trimmed)) return null;
  return trimmed;
}

export function parseSession(input: unknown, now = Date.now()): ParsedSession {
  if (!isRecord(input)) return { ok: false, reason: 'malformed' };
  if (input.brandCode !== BRAND.code) return { ok: false, reason: 'brand' };
  if (!isOfficeRole(input.role)) return { ok: false, reason: 'role' };
  if (input.mfaSatisfied !== true) return { ok: false, reason: 'mfa' };

  const sessionId = readToken(input.sessionId, 8, 128);
  const staffId = readToken(input.staffId, 4, 80);
  const displayName = readName(input.displayName);
  if (!sessionId || !staffId || !displayName) return { ok: false, reason: 'malformed' };
  if (typeof input.expiresAt !== 'string') return { ok: false, reason: 'malformed' };
  const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(expires)) return { ok: false, reason: 'malformed' };
  if (expires <= now) return { ok: false, reason: 'expired' };
  if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
    return { ok: false, reason: 'permissions' };
  }

  const ceiling = new Set<Permission>(ROLE_CEILING[input.role]);
  const permissions: Permission[] = [];
  for (const entry of input.permissions) {
    if (!isPermission(entry) || !ceiling.has(entry)) return { ok: false, reason: 'permissions' };
    if (!permissions.includes(entry)) permissions.push(entry);
  }

  const session: OfficeSession = {
    sessionId,
    brandCode: BRAND.code,
    role: input.role,
    permissions,
    mfaSatisfied: true,
    expiresAt: new Date(expires).toISOString(),
    staffId,
    displayName,
  };
  return { ok: true, session };
}

export function sessionHas(session: OfficeSession, permission: Permission): boolean {
  return session.brandCode === BRAND.code && session.permissions.includes(permission);
}
