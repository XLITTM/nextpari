export interface ManagerStaffContext {
  authUserId: string;
  role: 'manager';
  status: 'active';
  displayName: string;
  networkId: string | null;
  legacyManagerAccountId: string | null;
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

export function assertActiveManagerContext(raw: unknown): ManagerStaffContext {
  const rec = firstRow(raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'manager') {
    throw new Error(role ? 'MANAGER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const authUserId = String(rec.auth_user_id ?? rec.authUserId ?? '');
  if (!authUserId) throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  return {
    authUserId,
    role: 'manager',
    status: 'active',
    displayName: String(rec.display_name ?? rec.displayName ?? ''),
    networkId: rec.network_id == null && rec.networkId == null
      ? null
      : String(rec.network_id ?? rec.networkId),
    legacyManagerAccountId: rec.legacy_manager_account_id == null && rec.legacyManagerAccountId == null
      ? null
      : String(rec.legacy_manager_account_id ?? rec.legacyManagerAccountId),
  };
}

export function publicManagerStaff(staff: ManagerStaffContext): ManagerStaffContext {
  return {
    authUserId: staff.authUserId,
    role: staff.role,
    status: staff.status,
    displayName: staff.displayName,
    networkId: staff.networkId,
    legacyManagerAccountId: staff.legacyManagerAccountId,
  };
}
