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

export interface OwnerIdentity {
  id: string;
  permissions: readonly OwnerPermission[];
}

export interface BrandStaffGrant {
  brandCode: BrandCode;
  role: StaffRole;
  /** Auth user id inside that brand's own database. Not an email. */
  staffSubject: string;
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
 * Brand staff are scoped to one brand. A manager, cashier, or security
 * identity from brand A cannot read players, balances, transactions, or staff of brand B.
 */
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
  _resource: BrandResource,
): BrandCode {
  if (!isBrandCode(requestedBrand)) throw new GroupControlError('BRAND_UNKNOWN');
  if (grant.brandCode !== requestedBrand) throw new GroupControlError('CROSS_BRAND_ACCESS_DENIED');
  void _resource;
  return requestedBrand;
}
