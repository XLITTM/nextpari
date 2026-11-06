import { timingSafeEqual } from 'node:crypto';
import { authorizeBrandStaff, type BrandResource, type BrandStaffGrant, type OwnerIdentity } from './access.js';
import { CentralPlayerIdAllocator } from './allocator.js';
import { GROUP_BRANDS, isBrandCode } from './catalog.js';
import { GroupControlError } from './errors.js';
import { aggregateGroupReport, type BrandOperationalSnapshot } from './reporting.js';

export type CallerKind = 'internal-service' | 'android' | 'browser';

export interface GroupCaller {
  kind: CallerKind;
  serviceToken?: string;
}

export interface GroupControlState {
  allocator: CentralPlayerIdAllocator;
  available: boolean;
  grants: BrandStaffGrant[];
  owners: OwnerIdentity[];
  snapshots: BrandOperationalSnapshot[];
}

export function tokensMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function assertInternalService(caller: GroupCaller, expectedServiceToken: string): void {
  if (caller.kind === 'android' || caller.kind === 'browser') {
    throw new GroupControlError('CREDENTIALS_NOT_FOR_CLIENT');
  }
  if (caller.kind !== 'internal-service' || !caller.serviceToken || !tokensMatch(caller.serviceToken, expectedServiceToken)) {
    throw new GroupControlError('INTERNAL_AUTH_FAILED');
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GroupControlError('REQUEST_INVALID');
  }
  return value as Record<string, unknown>;
}

function httpFor(error: GroupControlError): number {
  if (error.code === 'CENTRAL_ALLOCATOR_UNAVAILABLE') return 503;
  if (error.code === 'INTERNAL_AUTH_FAILED') return 401;
  if (error.code === 'REQUEST_INVALID') return 400;
  return 403;
}

export async function handleGroupControlRequest(
  input: {
    caller: GroupCaller;
    expectedServiceToken: string;
    action: 'allocate' | 'register-brand' | 'authorize' | 'report';
    body?: unknown;
  },
  state: GroupControlState,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    assertInternalService(input.caller, input.expectedServiceToken);
    if (input.action === 'allocate') {
      const body = asRecord(input.body);
      const brandCode = String(body.brandCode ?? '');
      if (!isBrandCode(brandCode)) throw new GroupControlError('BRAND_UNKNOWN');
      const publicId = await state.allocator.allocate({
        brandCode,
        idempotencyKey: String(body.idempotencyKey ?? ''),
      });
      return { status: 200, body: { ok: true, brandCode, publicId } };
    }
    if (input.action === 'register-brand') {
      const body = asRecord(input.body);
      const code = String(body.code ?? '');
      const brand = GROUP_BRANDS.find((item) => item.code === code);
      if (!brand) throw new GroupControlError('BRAND_UNKNOWN');
      return {
        status: 200,
        body: { ok: true, code: brand.code, slug: brand.slug, status: brand.status },
      };
    }
    if (input.action === 'authorize') {
      const body = asRecord(input.body);
      const grant = state.grants.find((item) => item.staffSubject === String(body.staffSubject ?? '').toLowerCase());
      if (!grant) throw new GroupControlError('STAFF_GRANT_NOT_FOUND');
      const brandCode = authorizeBrandStaff(
        grant,
        String(body.brandCode ?? ''),
        String(body.resource ?? 'players') as BrandResource,
      );
      return { status: 200, body: { ok: true, brandCode, role: grant.role } };
    }
    const owner = state.owners.find((item) => item.id === 'group-owner');
    if (!owner?.permissions.includes('reports.read')) throw new GroupControlError('OWNER_PERMISSION_DENIED');
    const report = aggregateGroupReport(state.snapshots, state.grants);
    return { status: 200, body: { ok: true, report } };
  } catch (error) {
    if (error instanceof GroupControlError) {
      return { status: httpFor(error), body: { ok: false, error: error.code } };
    }
    throw error;
  }
}

export function emptyGroupState(allocator: CentralPlayerIdAllocator): GroupControlState {
  return {
    allocator,
    available: true,
    grants: [],
    owners: [{ id: 'group-owner', permissions: ['brands.read', 'reports.read', 'brands.register', 'staff.map', 'ids.reserve'] }],
    snapshots: [],
  };
}
