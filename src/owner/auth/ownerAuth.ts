export const OWNER_AUTH_LOGIN_PATH = '/api/owner/auth/login';
export const OWNER_AUTH_SESSION_PATH = '/api/owner/auth/session';
export const OWNER_AUTH_LOGOUT_PATH = '/api/owner/auth/logout';
export const OWNER_AUTH_STORAGE_KEY = 'nextpari-owner-auth-v1';
export const LEGACY_OWNER_SESSION_KEY = 'nextpari-owner-session';
export const LEGACY_BACKOFFICE_SESSION_KEY = 'nextpari-backoffice-session';

export interface OwnerStaffContext {
  authUserId: string;
  role: 'owner';
  status: 'active';
  displayName: string;
  networkId: string | null;
}

export interface OwnerGatewayResponse {
  ok: boolean;
  staff?: OwnerStaffContext;
  error?: string;
}

export interface OwnerAuthFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseOwnerStaffJson(raw: unknown): OwnerStaffContext | null {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  if (rec.role !== 'owner' || rec.status !== 'active') return null;
  const authUserId = String(rec.authUserId ?? rec.auth_user_id ?? '');
  if (!authUserId) return null;
  return {
    authUserId,
    role: 'owner',
    status: 'active',
    displayName: String(rec.displayName ?? rec.display_name ?? ''),
    networkId: rec.networkId == null && rec.network_id == null
      ? null
      : String(rec.networkId ?? rec.network_id),
  };
}

export function assertActiveOwnerContext(raw: unknown): OwnerStaffContext {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  const role = String(rec.role ?? '');
  const status = String(rec.status ?? '');
  if (role !== 'owner') {
    throw new Error(role ? 'OWNER_REQUIRED' : 'STAFF_ACCOUNT_NOT_FOUND');
  }
  if (status !== 'active') {
    throw new Error(status === 'blocked' ? 'STAFF_ACCOUNT_BLOCKED' : 'STAFF_ACCOUNT_DISABLED');
  }
  const parsed = parseOwnerStaffJson(rec);
  if (!parsed) throw new Error('STAFF_ACCOUNT_NOT_FOUND');
  return parsed;
}

export function ownerAuthErrorMessage(code: string): string {
  if (code.includes('STAFF_ACCOUNT_NOT_FOUND')) return 'Доступ запрещён: сотрудник не найден';
  if (code.includes('OWNER_REQUIRED')) return 'Доступ запрещён: требуется роль владельца';
  if (code.includes('STAFF_ACCOUNT_BLOCKED')) return 'Доступ запрещён: аккаунт заблокирован';
  if (code.includes('STAFF_ACCOUNT_DISABLED')) return 'Доступ запрещён: аккаунт отключён';
  if (code === 'EMAIL_PASSWORD_REQUIRED') return 'Введите email и пароль';
  if (code === 'AUTH_FAILED' || code.toLowerCase().includes('invalid login')) {
    return 'Неверный email или пароль';
  }
  return code || 'Доступ запрещён';
}

async function readJson(res: Response): Promise<OwnerGatewayResponse> {
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  return {
    ok: rec.ok === true,
    staff: parseOwnerStaffJson(rec.staff) ?? undefined,
    error: rec.error == null ? undefined : String(rec.error),
  };
}

export async function loginOwnerViaGateway(
  fetchFn: OwnerAuthFetch,
  email: string,
  password: string,
): Promise<OwnerStaffContext> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    throw new Error('EMAIL_PASSWORD_REQUIRED');
  }
  const res = await fetchFn(OWNER_AUTH_LOGIN_PATH, {
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

export async function restoreOwnerViaGateway(
  fetchFn: OwnerAuthFetch,
): Promise<OwnerStaffContext | null> {
  const res = await fetchFn(OWNER_AUTH_SESSION_PATH, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    if (res.status === 403) throw new Error(payload.error || 'OWNER_REQUIRED');
    return null;
  }
  return payload.staff;
}

export async function logoutOwnerViaGateway(fetchFn: OwnerAuthFetch): Promise<void> {
  await fetchFn(OWNER_AUTH_LOGOUT_PATH, {
    method: 'POST',
    credentials: 'include',
  });
}

export function clearOwnerAuthStorage(storage: {
  removeItem: (key: string) => void;
}): void {
  storage.removeItem(OWNER_AUTH_STORAGE_KEY);
  storage.removeItem(LEGACY_OWNER_SESSION_KEY);
  storage.removeItem(LEGACY_BACKOFFICE_SESSION_KEY);
}
