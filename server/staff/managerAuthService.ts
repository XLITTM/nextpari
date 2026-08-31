import { extractErrorCode, staffError, StaffOnboardingError } from './errors.js';
import {
  liveOwnerAuthPorts,
  type OwnerAuthGatewayPorts,
  type OwnerAuthHttpResult,
  type OwnerAuthTokens,
} from './ownerAuthService.js';
import {
  assertActiveManagerContext,
  publicManagerStaff,
  type ManagerStaffContext,
} from './managerContext.js';
import { clearManagerCookies, readManagerCookies, serializeManagerCookies } from './managerCookies.js';

export type ManagerAuthGatewayPorts = OwnerAuthGatewayPorts;
export type ManagerAuthHttpResult = OwnerAuthHttpResult;
export type ManagerAuthTokens = OwnerAuthTokens;

export function liveManagerAuthPorts(): ManagerAuthGatewayPorts {
  return liveOwnerAuthPorts();
}

function managerContextError(err: unknown): StaffOnboardingError {
  if (err instanceof StaffOnboardingError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? raw;
  if (
    code === 'MANAGER_REQUIRED'
    || code === 'OWNER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
  ) {
    return staffError(code, 403);
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
  return managerContextError(err).httpStatus === 401;
}

async function staffFromAccessToken(
  ports: ManagerAuthGatewayPorts,
  accessToken: string,
): Promise<ManagerStaffContext> {
  try {
    return assertActiveManagerContext(await ports.currentStaffContext(accessToken));
  } catch (err) {
    throw managerContextError(err);
  }
}

export async function loginManagerWithPassword(
  ports: ManagerAuthGatewayPorts,
  email: string,
  password: string,
  secure: boolean,
): Promise<ManagerAuthHttpResult> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    return {
      status: 400,
      body: { ok: false, error: 'EMAIL_PASSWORD_REQUIRED' },
      cookies: clearManagerCookies(secure),
    };
  }
  let tokens: ManagerAuthTokens;
  try {
    tokens = await ports.signInWithPassword(trimmed, password);
  } catch {
    return {
      status: 401,
      body: { ok: false, error: 'AUTH_FAILED' },
      cookies: clearManagerCookies(secure),
    };
  }
  try {
    const staff = await staffFromAccessToken(ports, tokens.accessToken);
    return {
      status: 200,
      body: { ok: true, staff: publicManagerStaff(staff) },
      cookies: serializeManagerCookies(tokens.accessToken, tokens.refreshToken, secure),
    };
  } catch (err) {
    const mapped = managerContextError(err);
    return {
      status: 403,
      body: { ok: false, error: mapped.code },
      cookies: clearManagerCookies(secure),
    };
  }
}

export async function resolveManagerSession(
  ports: ManagerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ staff: ManagerStaffContext; accessToken: string; cookies?: string[] }> {
  const cookies = readManagerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  if (cookies.accessToken) {
    try {
      const staff = await staffFromAccessToken(ports, cookies.accessToken);
      return { staff, accessToken: cookies.accessToken };
    } catch (err) {
      if (!isRefreshableAuthError(err) || !cookies.refreshToken) {
        throw managerContextError(err);
      }
    }
  }

  if (!cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let tokens: ManagerAuthTokens;
  try {
    tokens = await ports.refreshSession(cookies.refreshToken);
  } catch {
    throw staffError('JWT_INVALID', 401);
  }
  const staff = await staffFromAccessToken(ports, tokens.accessToken);
  return {
    staff,
    accessToken: tokens.accessToken,
    cookies: serializeManagerCookies(tokens.accessToken, tokens.refreshToken, secure),
  };
}

export async function readManagerSession(
  ports: ManagerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<ManagerAuthHttpResult> {
  try {
    const resolved = await resolveManagerSession(ports, cookieHeader, secure);
    return {
      status: 200,
      body: { ok: true, staff: publicManagerStaff(resolved.staff) },
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = managerContextError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, error: mapped.code },
      cookies: clearManagerCookies(secure),
    };
  }
}

export function logoutManagerSession(secure: boolean): ManagerAuthHttpResult {
  return {
    status: 200,
    body: { ok: true },
    cookies: clearManagerCookies(secure),
  };
}
