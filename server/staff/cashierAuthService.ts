import { extractErrorCode, staffError, StaffOnboardingError } from './errors.js';
import {
  liveOwnerAuthPorts,
  type OwnerAuthGatewayPorts,
  type OwnerAuthHttpResult,
  type OwnerAuthTokens,
} from './ownerAuthService.js';
import {
  assertActiveCashierContext,
  publicCashierStaff,
  type CashierStaffContext,
} from './cashierContext.js';
import { clearCashierCookies, readCashierCookies, serializeCashierCookies } from './cashierCookies.js';

export type CashierAuthGatewayPorts = OwnerAuthGatewayPorts;
export type CashierAuthHttpResult = OwnerAuthHttpResult;
export type CashierAuthTokens = OwnerAuthTokens;

export function liveCashierAuthPorts(): CashierAuthGatewayPorts {
  return liveOwnerAuthPorts();
}

function cashierContextError(err: unknown): StaffOnboardingError {
  if (err instanceof StaffOnboardingError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? raw;
  if (
    code === 'CASHIER_REQUIRED'
    || code === 'OWNER_REQUIRED'
    || code === 'MANAGER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
  ) {
    return staffError(code === 'OWNER_REQUIRED' || code === 'MANAGER_REQUIRED' ? 'CASHIER_REQUIRED' : code, 403);
  }
  if (code === 'JWT_INVALID' || code === 'JWT_REQUIRED' || code === 'AUTH_REQUIRED') {
    return staffError(code, 401);
  }
  const lower = raw.toLowerCase();
  if (lower.includes('jwt') || lower.includes('expired') || lower.includes('unauthorized')) {
    return staffError('JWT_INVALID', 401);
  }
  return staffError('AUTH_FAILED', 401);
}

function isRefreshableAuthError(err: unknown): boolean {
  return cashierContextError(err).httpStatus === 401;
}

async function staffFromAccessToken(
  ports: CashierAuthGatewayPorts,
  accessToken: string,
): Promise<CashierStaffContext> {
  try {
    return assertActiveCashierContext(await ports.currentStaffContext(accessToken));
  } catch (err) {
    throw cashierContextError(err);
  }
}

export async function loginCashierWithPassword(
  ports: CashierAuthGatewayPorts,
  email: string,
  password: string,
  secure: boolean,
): Promise<CashierAuthHttpResult> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    return {
      status: 400,
      body: { ok: false, error: 'EMAIL_PASSWORD_REQUIRED' },
      cookies: clearCashierCookies(secure),
    };
  }
  let tokens: CashierAuthTokens;
  try {
    tokens = await ports.signInWithPassword(trimmed, password);
  } catch {
    return {
      status: 401,
      body: { ok: false, error: 'AUTH_FAILED' },
      cookies: clearCashierCookies(secure),
    };
  }
  try {
    const staff = await staffFromAccessToken(ports, tokens.accessToken);
    return {
      status: 200,
      body: { ok: true, staff: publicCashierStaff(staff) },
      cookies: serializeCashierCookies(tokens.accessToken, tokens.refreshToken, secure),
    };
  } catch (err) {
    const mapped = cashierContextError(err);
    return {
      status: 403,
      body: { ok: false, error: mapped.code },
      cookies: clearCashierCookies(secure),
    };
  }
}

export async function resolveCashierSession(
  ports: CashierAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ staff: CashierStaffContext; accessToken: string; cookies?: string[] }> {
  const cookies = readCashierCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  if (cookies.accessToken) {
    try {
      const staff = await staffFromAccessToken(ports, cookies.accessToken);
      return { staff, accessToken: cookies.accessToken };
    } catch (err) {
      if (!isRefreshableAuthError(err) || !cookies.refreshToken) {
        throw cashierContextError(err);
      }
    }
  }

  if (!cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let tokens: CashierAuthTokens;
  try {
    tokens = await ports.refreshSession(cookies.refreshToken);
  } catch {
    throw staffError('JWT_INVALID', 401);
  }
  const staff = await staffFromAccessToken(ports, tokens.accessToken);
  return {
    staff,
    accessToken: tokens.accessToken,
    cookies: serializeCashierCookies(tokens.accessToken, tokens.refreshToken, secure),
  };
}

export async function readCashierSession(
  ports: CashierAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<CashierAuthHttpResult> {
  try {
    const resolved = await resolveCashierSession(ports, cookieHeader, secure);
    return {
      status: 200,
      body: { ok: true, staff: publicCashierStaff(resolved.staff) },
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = cashierContextError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, error: mapped.code },
      cookies: clearCashierCookies(secure),
    };
  }
}

export function logoutCashierSession(secure: boolean): CashierAuthHttpResult {
  return {
    status: 200,
    body: { ok: true },
    cookies: clearCashierCookies(secure),
  };
}
