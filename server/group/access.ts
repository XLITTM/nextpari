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
