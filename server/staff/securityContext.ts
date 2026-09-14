export interface SecurityStaffContext {
  authUserId: string;
  role: 'security';
  status: 'active';
  displayName: string;
  login: string | null;
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

export function assertActiveSecurityContext(raw: unknown): SecurityStaffContext {
  const rec = firstRow(raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'security') {
    throw new Error(role ? 'SECURITY_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const authUserId = String(rec.auth_user_id ?? rec.authUserId ?? '');
  if (!authUserId) throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  const loginRaw = rec.login ?? rec.login_name ?? rec.loginName;
  return {
    authUserId,
    role: 'security',
    status: 'active',
    displayName: String(rec.display_name ?? rec.displayName ?? ''),
    login: loginRaw == null || loginRaw === '' ? null : String(loginRaw),
  };
}

export function publicSecurityStaff(staff: SecurityStaffContext): {
  authUserId: string;
  role: 'security';
  status: 'active';
  displayName: string;
  login: string | null;
} {
  return {
    authUserId: staff.authUserId,
    role: staff.role,
    status: staff.status,
    displayName: staff.displayName,
    login: staff.login,
  };
}
