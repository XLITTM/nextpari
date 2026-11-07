import { isBrandCode, type BrandCode } from './catalog.js';
import { GroupControlError } from './errors.js';

export const OWNER_PERMISSIONS = [
  'brands.read',
  'reports.read',
  'brands.register',
  'staff.map',
  'ids.reserve',
] as const;

export type OwnerPermission = (typeof OWNER_PERMISSIONS)[number];

export type StaffRole = 'manager' | 'cashier' | 'security';

export type BrandResource = 'players' | 'balances' | 'transactions' | 'staff';

export const ROLE_PERMISSIONS: Record<StaffRole, readonly BrandResource[]> = {
  manager: ['players', 'balances', 'transactions', 'staff'],
  cashier: ['players', 'balances', 'transactions'],
  security: ['players'],
};

export function isStaffRole(value: string): value is StaffRole {
  return value === 'manager' || value === 'cashier' || value === 'security';
}

export function isBrandResource(value: string): value is BrandResource {
  return value === 'players' || value === 'balances' || value === 'transactions' || value === 'staff';
}

export interface OwnerIdentity {
  id: string;
  permissions: readonly OwnerPermission[];
}

export interface BrandStaffGrant {
  brandCode: BrandCode;
  role: StaffRole;
  /** Auth user id inside that brand's own database. Not an email. */
  staffSubject: string;
  status?: 'active' | 'suspended' | 'revoked' | null;
}

const SUBJECT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertStaffSubject(value: string): string {
  const subject = value.trim().toLowerCase();
  if (!SUBJECT_RE.test(subject)) throw new GroupControlError('STAFF_SUBJECT_INVALID');
  return subject;
}

export function requireOwnerPermission(owner: OwnerIdentity, permission: OwnerPermission): void {
  if (!owner.permissions.includes(permission)) throw new GroupControlError('OWNER_PERMISSION_DENIED');
}

/**
 * Test fixture only. Production owner access is a verified subject from the
 * group control-plane auth project, looked up in owner_identities.
 */
export const TEST_FIXTURE_OWNER_SUBJECT = '00000000-0000-4000-8000-000000000001';

const OWNER_SUBJECT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authenticateGroupOwner(owners: readonly OwnerIdentity[], subject: string): OwnerIdentity {
  const id = subject.trim().toLowerCase();
  if (!OWNER_SUBJECT_RE.test(id)) throw new GroupControlError('OWNER_SUBJECT_INVALID');
  const owner = owners.find((item) => item.id === id);
  if (!owner) throw new GroupControlError('OWNER_UNKNOWN');
  return owner;
}

export function authorizeStaffSubject(
  grants: readonly BrandStaffGrant[],
  requestedBrand: string,
  staffSubject: string,
  resource: BrandResource,
): BrandCode {
  const subject = assertStaffSubject(staffSubject);
  const exact = grants.find((grant) => grant.brandCode === requestedBrand && grant.staffSubject === subject);
  if (exact) return authorizeBrandStaff(exact, requestedBrand, resource);
  if (grants.some((grant) => grant.staffSubject === subject)) {
    throw new GroupControlError('CROSS_BRAND_ACCESS_DENIED');
  }
  throw new GroupControlError('STAFF_GRANT_NOT_FOUND');
}

export function authorizeBrandStaff(
  grant: BrandStaffGrant,
  requestedBrand: string,
  resource: BrandResource,
): BrandCode {
  if (!isBrandCode(requestedBrand)) throw new GroupControlError('BRAND_UNKNOWN');
  if (grant.brandCode !== requestedBrand) throw new GroupControlError('CROSS_BRAND_ACCESS_DENIED');
  const allowed = ROLE_PERMISSIONS[grant.role];
  if (!allowed?.includes(resource)) throw new GroupControlError('STAFF_PERMISSION_DENIED');
  return requestedBrand;
}

export interface StaffChangeRequest {
  action: 'invite' | 'revoke' | 'suspend';
  brandCode: BrandCode;
  staffSubject: string;
  role: StaffRole;
  permissions: readonly BrandResource[];
}

export function parseStaffChange(body: Record<string, unknown>, action: StaffChangeRequest['action']): StaffChangeRequest {
  const brandCode = String(body.brandCode ?? '');
  if (!isBrandCode(brandCode)) throw new GroupControlError('BRAND_UNKNOWN');
  const role = String(body.role ?? '');
  if (!isStaffRole(role)) throw new GroupControlError('STAFF_ROLE_INVALID');
  const staffSubject = assertStaffSubject(String(body.staffSubject ?? ''));
  const rawPermissions = Array.isArray(body.permissions) ? body.permissions.map((item) => String(item)) : [];
  const permissions = rawPermissions.filter(isBrandResource);
  if (permissions.length !== rawPermissions.length || new Set(permissions).size !== permissions.length) {
    throw new GroupControlError('STAFF_PERMISSION_DENIED');
  }
  const allowed = ROLE_PERMISSIONS[role];
  const outsideRole = permissions.some((permission) => !allowed.includes(permission));
  if (outsideRole || (action === 'invite' && permissions.length === 0)) {
    throw new GroupControlError('STAFF_PERMISSION_DENIED');
  }
  return { action, brandCode, staffSubject, role, permissions };
}

export function staffChangeRefusal(action: StaffChangeRequest['action']): string {
  if (action === 'revoke') return 'STAFF_REVOKE_NOT_APPLIED';
  if (action === 'suspend') return 'STAFF_SUSPEND_NOT_APPLIED';
  return 'STAFF_INVITE_NOT_APPLIED';
}
