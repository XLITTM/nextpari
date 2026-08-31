export interface CashierStaffContext {
  authUserId: string;
  role: 'cashier';
  status: 'active';
  displayName: string;
  networkId: string;
  legacyCashierId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return asRecord(data[0]);
  return asRecord(data);
}

export function assertActiveCashierContext(raw: unknown): CashierStaffContext {
  const rec = firstRow(raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'cashier') {
    throw new Error(role ? 'CASHIER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const authUserId = String(rec.auth_user_id ?? rec.authUserId ?? '');
  const networkId = rec.network_id == null && rec.networkId == null
    ? ''
    : String(rec.network_id ?? rec.networkId);
  const legacyCashierId = rec.legacy_cashier_id == null && rec.legacyCashierId == null
    ? ''
    : String(rec.legacy_cashier_id ?? rec.legacyCashierId);
  if (!authUserId || !networkId || !legacyCashierId) {
    throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  }
  return {
    authUserId,
    role: 'cashier',
    status: 'active',
    displayName: String(rec.display_name ?? rec.displayName ?? ''),
    networkId,
    legacyCashierId,
  };
}

export function publicCashierStaff(staff: CashierStaffContext): {
  role: 'cashier';
  status: 'active';
  displayName: string;
  networkId: string;
  legacyCashierId: string;
} {
  return {
    role: staff.role,
    status: staff.status,
    displayName: staff.displayName,
    networkId: staff.networkId,
    legacyCashierId: staff.legacyCashierId,
  };
}
