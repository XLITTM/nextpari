import { StaffOnboardingError, staffError } from './errors';
import type {
  AuthAdminPort,
  OwnerStaffPort,
  StaffBindingRow,
  StaffBindResult,
  StaffLog,
  StaffOnboardInput,
  StaffOnboardRole,
  StaffOnboardSuccess,
} from './types';

const EMAIL_MAX = 254;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 72;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BINDING_PAGE = 200;
const BINDING_PAGE_CAP = 50;

const MONEY_RPC_NAMES = [
  'owner_capital_in',
  'owner_fund_manager',
  'owner_fund_cashier',
  'owner_fund_player',
  'manager_topup_cashier',
  'manager_collect_cashier',
  'manager_adjust_player_balance',
  'manager_settle_bet',
  'cashier_deposit_to_player',
  'cashier_payout_by_code',
  'player_create_cash_payout',
  'apply_operational_transfer',
  'apply_wallet_entry',
] as const;

export function assertNoMoneyRpc(name: string): void {
  if ((MONEY_RPC_NAMES as readonly string[]).includes(name)) {
    throw staffError('MONEY_RPC_FORBIDDEN', 500);
  }
}

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw staffError('EMAIL_INVALID', 400);
  }
  const email = raw.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    throw staffError('EMAIL_INVALID', 400);
  }
  return email;
}

export function normalizePassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw staffError('PASSWORD_REQUIRED', 400);
  }
  if (raw.length < PASSWORD_MIN) {
    throw staffError('PASSWORD_TOO_SHORT', 400);
  }
  if (raw.length > PASSWORD_MAX) {
    throw staffError('PASSWORD_TOO_LONG', 400);
  }
  return raw;
}

export function normalizeUuid(raw: unknown, code: string): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw.trim())) {
    throw staffError(code, 400);
  }
  return raw.trim().toLowerCase();
}

function sameUuid(left: string | null, right: string): boolean {
  return (left ?? '').toLowerCase() === right.toLowerCase();
}

export async function requireActiveOwner(owner: OwnerStaffPort): Promise<void> {
  const raw = await owner.currentStaffContext();
  const role = String(raw.role ?? '');
  const status = String(raw.status ?? '');
  if (role !== 'owner') {
    throw staffError(role ? 'OWNER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND', 403);
  }
  if (status !== 'active') {
    throw staffError(
      status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED',
      403,
    );
  }
}

export async function findExistingBinding(
  owner: OwnerStaffPort,
  role: StaffOnboardRole,
  legacyId: string,
): Promise<StaffBindingRow | null> {
  let offset = 0;
  for (let page = 0; page < BINDING_PAGE_CAP; page += 1) {
    const listed = await owner.listStaffAuthBindings(role, BINDING_PAGE, offset);
    const hit = listed.rows.find((row) =>
      role === 'manager'
        ? sameUuid(row.legacyManagerAccountId, legacyId)
        : sameUuid(row.legacyCashierId, legacyId),
    );
    if (hit) return hit;
    offset += BINDING_PAGE;
    if (offset >= listed.total || listed.rows.length === 0) break;
  }
  return null;
}

function toSuccess(row: StaffBindResult | StaffBindingRow): StaffOnboardSuccess {
  const role = row.role === 'cashier' ? 'cashier' : 'manager';
  return {
    ok: true,
    authUserId: row.authUserId,
    role,
    status: row.status,
    displayName: row.displayName,
    networkId: row.networkId,
    legacyManagerAccountId: row.legacyManagerAccountId,
    legacyCashierId: row.legacyCashierId,
  };
}

export async function onboardStaff(
  input: StaffOnboardInput,
  ports: { owner: OwnerStaffPort; admin: AuthAdminPort },
  log: StaffLog,
): Promise<StaffOnboardSuccess> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.temporaryPassword);
  const legacyId =
    input.role === 'manager'
      ? normalizeUuid(input.managerId, 'MANAGER_ID_INVALID')
      : normalizeUuid(input.cashierId, 'CASHIER_ID_INVALID');

  await requireActiveOwner(ports.owner);

  const existing = await findExistingBinding(ports.owner, input.role, legacyId);
  if (existing) {
    throw staffError('STAFF_ALREADY_ONBOARDED', 409, {
      ok: false,
      error: 'STAFF_ALREADY_ONBOARDED',
      authUserId: existing.authUserId,
      role: existing.role,
      status: existing.status,
      displayName: existing.displayName,
      networkId: existing.networkId,
      legacyManagerAccountId: existing.legacyManagerAccountId,
      legacyCashierId: existing.legacyCashierId,
    });
  }

  const created = await ports.admin.createUser(email, password);
  let bound: StaffBindResult;
  try {
    bound =
      input.role === 'manager'
        ? await ports.owner.bindManager(created.id, legacyId)
        : await ports.owner.bindCashier(created.id, legacyId);
  } catch (error) {
    try {
      await ports.admin.deleteUser(created.id);
    } catch {
      log.error('staff_onboarding_compensation_failed', {
        authUserId: created.id,
        legacyTargetId: legacyId,
        errorCode: error instanceof StaffOnboardingError ? error.code : 'BIND_FAILED',
        role: input.role,
      });
      throw staffError('ONBOARDING_COMPENSATION_FAILED', 500, {
        authUserId: created.id,
        legacyTargetId: legacyId,
      });
    }
    throw error;
  }

  return toSuccess(bound);
}
