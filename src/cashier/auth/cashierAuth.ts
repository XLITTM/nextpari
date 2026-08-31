export const CASHIER_AUTH_LOGIN_PATH = '/api/cashier/auth/login';
export const CASHIER_AUTH_SESSION_PATH = '/api/cashier/auth/session';
export const CASHIER_AUTH_LOGOUT_PATH = '/api/cashier/auth/logout';
export const CASHIER_AUTH_STORAGE_KEY = 'nextpari-cashier-auth-v1';
export const LEGACY_CASHIER_SESSION_KEY = 'mobcash-cashier-session';
export const LEGACY_STAFF_SESSION_KEY = 'nextpari-staff-session';
export const LEGACY_AGENT_SESSION_KEY = 'nextpari-agent-session';

export interface CashierStaffContext {
  role: 'cashier';
  status: 'active';
  displayName: string;
  networkId: string;
  legacyCashierId: string;
}

export interface CashierGatewayResponse {
  ok: boolean;
  staff?: CashierStaffContext;
  error?: string;
}

export interface CashierAuthFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseCashierStaffJson(raw: unknown): CashierStaffContext | null {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  if (rec.role !== 'cashier' || rec.status !== 'active') return null;
  const networkId = rec.networkId == null && rec.network_id == null
    ? ''
    : String(rec.networkId ?? rec.network_id);
  const legacyCashierId = rec.legacyCashierId == null && rec.legacy_cashier_id == null
    ? ''
    : String(rec.legacyCashierId ?? rec.legacy_cashier_id);
  if (!networkId || !legacyCashierId) return null;
  return {
    role: 'cashier',
    status: 'active',
    displayName: String(rec.displayName ?? rec.display_name ?? ''),
    networkId,
    legacyCashierId,
  };
}

export function cashierAuthErrorMessage(code: string): string {
  if (code.includes('STAFF_ACCOUNT_NOT_FOUND')) return 'Доступ запрещён: сотрудник не найден';
  if (code.includes('CASHIER_REQUIRED')) return 'Доступ запрещён: требуется роль кассира';
  if (code.includes('OWNER_REQUIRED') || code.includes('MANAGER_REQUIRED')) {
    return 'Доступ запрещён: требуется роль кассира';
  }
  if (code.includes('STAFF_ACCOUNT_BLOCKED')) return 'Доступ запрещён: аккаунт заблокирован';
  if (code.includes('STAFF_ACCOUNT_DISABLED')) return 'Доступ запрещён: аккаунт отключён';
  if (code === 'EMAIL_PASSWORD_REQUIRED') return 'Введите email и пароль';
  if (code === 'AUTH_FAILED' || code.toLowerCase().includes('invalid login')) {
    return 'Неверный email или пароль';
  }
  return code || 'Доступ запрещён';
}

async function readJson(res: Response): Promise<CashierGatewayResponse> {
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  return {
    ok: rec.ok === true,
    staff: parseCashierStaffJson(rec.staff) ?? undefined,
    error: rec.error == null ? undefined : String(rec.error),
  };
}

export async function loginCashierViaGateway(
  fetchFn: CashierAuthFetch,
  email: string,
  password: string,
): Promise<CashierStaffContext> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    throw new Error('EMAIL_PASSWORD_REQUIRED');
  }
  const res = await fetchFn(CASHIER_AUTH_LOGIN_PATH, {
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

export async function restoreCashierViaGateway(
  fetchFn: CashierAuthFetch,
): Promise<CashierStaffContext | null> {
  const res = await fetchFn(CASHIER_AUTH_SESSION_PATH, {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  const payload = await readJson(res);
  if (!res.ok || !payload.ok || !payload.staff) {
    if (res.status === 403) throw new Error(payload.error || 'CASHIER_REQUIRED');
    return null;
  }
  return payload.staff;
}

export async function logoutCashierViaGateway(fetchFn: CashierAuthFetch): Promise<void> {
  await fetchFn(CASHIER_AUTH_LOGOUT_PATH, {
    method: 'POST',
    credentials: 'include',
  });
}

export function clearCashierAuthStorage(storage: {
  removeItem: (key: string) => void;
}): void {
  storage.removeItem(CASHIER_AUTH_STORAGE_KEY);
  storage.removeItem(LEGACY_CASHIER_SESSION_KEY);
  storage.removeItem(LEGACY_STAFF_SESSION_KEY);
  storage.removeItem(LEGACY_AGENT_SESSION_KEY);
}
