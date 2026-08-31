export const MANAGER_AUTH_LOGIN_PATH = '/api/manager/auth/login';
export const MANAGER_AUTH_SESSION_PATH = '/api/manager/auth/session';
export const MANAGER_AUTH_LOGOUT_PATH = '/api/manager/auth/logout';
export const MANAGER_AUTH_STORAGE_KEY = 'nextpari-manager-auth-v1';
export const LEGACY_MANAGER_SESSION_KEY = 'nextpari-manager-session';
export const LEGACY_STAFF_SESSION_KEY = 'nextpari-staff-session';
export const LEGACY_BACKOFFICE_SESSION_KEY = 'nextpari-backoffice-session';

export interface ManagerStaffContext {
  authUserId: string;
  role: 'manager';
  status: 'active';
  displayName: string;
  networkId: string | null;
  legacyManagerAccountId: string | null;
}

export interface ManagerGatewayResponse {
  ok: boolean;
  staff?: ManagerStaffContext;
  error?: string;
}

export interface ManagerAuthFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseManagerStaffJson(raw: unknown): ManagerStaffContext | null {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  if (rec.role !== 'manager' || rec.status !== 'active') return null;
  const authUserId = String(rec.authUserId ?? rec.auth_user_id ?? '');
  if (!authUserId) return null;
  return {
    authUserId,
    role: 'manager',
    status: 'active',
    displayName: String(rec.displayName ?? rec.display_name ?? ''),
    networkId: rec.networkId == null && rec.network_id == null
      ? null
      : String(rec.networkId ?? rec.network_id),
    legacyManagerAccountId: rec.legacyManagerAccountId == null && rec.legacy_manager_account_id == null
      ? null
      : String(rec.legacyManagerAccountId ?? rec.legacy_manager_account_id),
  };
}

export function assertActiveManagerContext(raw: unknown): ManagerStaffContext {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'manager') {
    throw new Error(role ? 'MANAGER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const parsed = parseManagerStaffJson(rec);
  if (!parsed) throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  return parsed;
}

export function managerAuthErrorMessage(code: string): string {
  if (code.includes('STAFF_ACCOUNT_NOT_FOUND')) return 'Доступ запрещён: сотрудник не найден';
  if (code.includes('MANAGER_REQUIRED')) return 'Доступ запрещён: требуется роль менеджера';
  if (code.includes('OWNER_REQUIRED')) return 'Доступ запрещён: требуется роль менеджера';
  if (code.includes('STAFF_ACCOUNT_BLOCKED')) return 'Доступ запрещён: аккаунт заблокирован';
  if (code.includes('STAFF_ACCOUNT_DISABLED')) return 'Доступ запрещён: аккаунт отключён';
  if (code === 'EMAIL_PASSWORD_REQUIRED') return 'Введите email и пароль';
  if (code === 'AUTH_FAILED' || code.toLowerCase().includes('invalid login')) {
    return 'Неверный email или пароль';
  }
  return code || 'Доступ запрещён';
}

async function readJson(res: Response): Promise<ManagerGatewayResponse> {
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  return {
    ok: rec.ok === true,
    staff: parseManagerStaffJson(rec.staff) ?? undefined,
    error: rec.error == null ? undefined : String(rec.error),
  };
}

export async function loginManagerViaGateway(
  fetchFn: ManagerAuthFetch,
  email: string,
  password: string,
): Promise<ManagerStaffContext> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    throw new Error('EMAIL_PASSWORD_REQUIRED');
  }
  const res = await fetchFn(MANAGER_AUTH_LOGIN_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed, password }),
  });
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    throw new Error(payload.error || 'AUTH_FAILED');
  }
  return payload.staff;
}

export async function restoreManagerViaGateway(
  fetchFn: ManagerAuthFetch,
): Promise<ManagerStaffContext | null> {
  const res = await fetchFn(MANAGER_AUTH_SESSION_PATH, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    if (res.status === 403) throw new Error(payload.error || 'MANAGER_REQUIRED');
    return null;
  }
  return payload.staff;
}

export async function logoutManagerViaGateway(fetchFn: ManagerAuthFetch): Promise<void> {
  await fetchFn(MANAGER_AUTH_LOGOUT_PATH, {
    method: 'POST',
    credentials: 'include',
  });
}

export function clearManagerAuthStorage(storage: {
  removeItem: (key: string) => void;
}): void {
  storage.removeItem(MANAGER_AUTH_STORAGE_KEY);
  storage.removeItem(LEGACY_MANAGER_SESSION_KEY);
  storage.removeItem(LEGACY_STAFF_SESSION_KEY);
  storage.removeItem(LEGACY_BACKOFFICE_SESSION_KEY);
}

export function managerOfficeSession(staff: ManagerStaffContext): {
  id: string;
  login: string;
  fullName: string;
  role: 'manager';
  networkId: string | null;
  networkName: string;
} {
  return {
    id: staff.legacyManagerAccountId || staff.authUserId,
    login: staff.displayName || 'manager',
    fullName: staff.displayName,
    role: 'manager',
    networkId: staff.networkId,
    networkName: 'Сеть',
  };
}
