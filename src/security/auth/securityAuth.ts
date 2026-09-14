export const SECURITY_AUTH_LOGIN_PATH = '/api/security/auth/login';
export const SECURITY_AUTH_ME_PATH = '/api/security/auth/me';
export const SECURITY_AUTH_LOGOUT_PATH = '/api/security/auth/logout';
export const SECURITY_AUTH_STORAGE_KEY = 'nextpari-security-auth-v1';

export interface SecurityStaffContext {
  authUserId: string;
  role: 'security';
  status: 'active';
  displayName: string;
  login: string | null;
}

export interface SecurityGatewayResponse {
  ok: boolean;
  staff?: SecurityStaffContext;
  error?: string;
}

export interface SecurityAuthFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseSecurityStaffJson(raw: unknown): SecurityStaffContext | null {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  if (rec.role !== 'security' || rec.status !== 'active') return null;
  const authUserId = String(rec.authUserId ?? rec.auth_user_id ?? '');
  if (!authUserId) return null;
  const loginRaw = rec.login ?? rec.login_name ?? rec.loginName;
  return {
    authUserId,
    role: 'security',
    status: 'active',
    displayName: String(rec.displayName ?? rec.display_name ?? ''),
    login: loginRaw == null || loginRaw === '' ? null : String(loginRaw),
  };
}

export function securityAuthErrorMessage(code: string): string {
  if (code.includes('STAFF_ACCOUNT_NOT_FOUND')) return 'Доступ запрещён: сотрудник не найден';
  if (code.includes('SECURITY_REQUIRED')) return 'Доступ запрещён: требуется роль службы безопасности';
  if (code.includes('OWNER_REQUIRED') || code.includes('MANAGER_REQUIRED') || code.includes('CASHIER_REQUIRED')) {
    return 'Доступ запрещён: требуется роль службы безопасности';
  }
  if (code.includes('STAFF_ACCOUNT_BLOCKED')) return 'Доступ запрещён: аккаунт заблокирован';
  if (code.includes('STAFF_ACCOUNT_DISABLED')) return 'Доступ запрещён: аккаунт отключён';
  if (code === 'LOGIN_PASSWORD_REQUIRED') return 'Введите логин и пароль';
  if (code === 'AUTH_FAILED' || code.toLowerCase().includes('invalid login')) {
    return 'Неверный логин или пароль';
  }
  return code || 'Доступ запрещён';
}

async function readJson(res: Response): Promise<SecurityGatewayResponse> {
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  return {
    ok: rec.ok === true,
    staff: parseSecurityStaffJson(rec.staff) ?? undefined,
    error: rec.error == null ? undefined : String(rec.error),
  };
}

export async function loginSecurityViaGateway(
  fetchFn: SecurityAuthFetch,
  login: string,
  password: string,
): Promise<SecurityStaffContext> {
  const trimmed = login.trim();
  if (!trimmed || !password) {
    throw new Error('LOGIN_PASSWORD_REQUIRED');
  }
  const res = await fetchFn(SECURITY_AUTH_LOGIN_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: trimmed, password }),
  });
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    throw new Error(payload.error || 'AUTH_FAILED');
  }
  return payload.staff;
}

export async function restoreSecurityViaGateway(
  fetchFn: SecurityAuthFetch,
): Promise<SecurityStaffContext | null> {
  const res = await fetchFn(SECURITY_AUTH_ME_PATH, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    if (res.status === 403) throw new Error(payload.error || 'SECURITY_REQUIRED');
    return null;
  }
  return payload.staff;
}

export async function logoutSecurityViaGateway(fetchFn: SecurityAuthFetch): Promise<void> {
  await fetchFn(SECURITY_AUTH_LOGOUT_PATH, {
    method: 'POST',
    credentials: 'include',
  });
}

export function clearSecurityAuthStorage(storage: {
  removeItem: (key: string) => void;
}): void {
  storage.removeItem(SECURITY_AUTH_STORAGE_KEY);
}
