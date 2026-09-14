import { createAnonAuthClient, createServiceRoleClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv, loadStaffOnboardingEnv } from './env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from './errors.js';
import {
  assertActiveSecurityContext,
  publicSecurityStaff,
  type SecurityStaffContext,
} from './securityContext.js';
import {
  clearSecurityCookies,
  readSecurityCookies,
  serializeSecurityCookies,
} from './securityCookies.js';

export interface SecurityAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SecurityAuthGatewayPorts {
  lookupLoginEmail: (login: string) => Promise<string>;
  signInWithPassword: (email: string, password: string) => Promise<SecurityAuthTokens>;
  refreshSession: (refreshToken: string) => Promise<SecurityAuthTokens>;
  currentStaffContext: (accessToken: string) => Promise<unknown>;
}

export interface SecurityAuthHttpResult {
  status: number;
  body: Record<string, unknown>;
  cookies?: string[];
  headers?: Record<string, string>;
}

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;

export function normalizeSecurityLogin(raw: unknown): string {
  const login = String(raw ?? '').trim().toLowerCase();
  if (!login || !LOGIN_RE.test(login)) {
    throw staffError('LOGIN_INVALID', 400);
  }
  return login;
}

function securityContextError(err: unknown): StaffOnboardingError {
  if (err instanceof StaffOnboardingError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? raw;
  if (
    code === 'SECURITY_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
    || code === 'OWNER_REQUIRED'
    || code === 'MANAGER_REQUIRED'
    || code === 'CASHIER_REQUIRED'
  ) {
    return staffError(code === 'OWNER_REQUIRED' || code === 'MANAGER_REQUIRED' || code === 'CASHIER_REQUIRED'
      ? 'SECURITY_REQUIRED'
      : code, 403);
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
  return securityContextError(err).httpStatus === 401;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function staffFromAccessToken(
  ports: SecurityAuthGatewayPorts,
  accessToken: string,
): Promise<SecurityStaffContext> {
  try {
    return assertActiveSecurityContext(await ports.currentStaffContext(accessToken));
  } catch (err) {
    throw securityContextError(err);
  }
}

export function liveSecurityAuthPorts(): SecurityAuthGatewayPorts {
  const env = loadOwnerAuthEnv();
  return {
    async lookupLoginEmail(login) {
      const onboard = loadStaffOnboardingEnv();
      const client = createServiceRoleClient(onboard.supabaseUrl, onboard.supabaseServiceRoleKey);
      const { data, error } = await client.rpc('security_lookup_login_email', { p_login: login });
      if (error) {
        const code = extractErrorCode(rpcMessage(error)) ?? 'AUTH_FAILED';
        if (code === 'STAFF_ACCOUNT_BLOCKED' || code === 'STAFF_ACCOUNT_DISABLED') {
          throw staffError(code, 403);
        }
        if (code === 'LOGIN_INVALID') {
          throw staffError('LOGIN_INVALID', 400);
        }
        throw staffError('AUTH_FAILED', 401);
      }
      const rec = asRecord(Array.isArray(data) ? data[0] : data);
      const email = String(rec.auth_email ?? rec.authEmail ?? '').trim();
      if (!email) throw staffError('AUTH_FAILED', 401);
      return email;
    },
    async signInWithPassword(email, password) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      const accessToken = data.session?.access_token?.trim() ?? '';
      const refreshToken = data.session?.refresh_token?.trim() ?? '';
      if (error || !accessToken || !refreshToken) {
        throw staffError('AUTH_FAILED', 401);
      }
      return { accessToken, refreshToken };
    },
    async refreshSession(refreshToken) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      const accessToken = data.session?.access_token?.trim() ?? '';
      const nextRefresh = data.session?.refresh_token?.trim() ?? refreshToken;
      if (error || !accessToken || !nextRefresh) {
        throw staffError('JWT_INVALID', 401);
      }
      return { accessToken, refreshToken: nextRefresh };
    },
    async currentStaffContext(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('security_current_staff');
      if (error) {
        const text = rpcMessage(error);
        if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
          throw staffError('JWT_INVALID', 401);
        }
        const code = extractErrorCode(text);
        if (code) {
          throw staffError(code, /OWNER|MANAGER|CASHIER|SECURITY|STAFF_/.test(code) ? 403 : 401);
        }
        throw staffError('JWT_INVALID', 401);
      }
      return data;
    },
  };
}

export async function loginSecurityWithPassword(
  ports: SecurityAuthGatewayPorts,
  login: string,
  password: string,
  secure: boolean,
): Promise<SecurityAuthHttpResult> {
  let normalized: string;
  try {
    normalized = normalizeSecurityLogin(login);
  } catch (err) {
    const mapped = securityContextError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, error: mapped.code },
      cookies: clearSecurityCookies(secure),
    };
  }
  if (!password) {
    return {
      status: 400,
      body: { ok: false, error: 'PASSWORD_REQUIRED' },
      cookies: clearSecurityCookies(secure),
    };
  }

  let email: string;
  try {
    email = await ports.lookupLoginEmail(normalized);
  } catch (err) {
    const mapped = securityContextError(err);
    return {
      status: mapped.code === 'STAFF_ACCOUNT_BLOCKED' || mapped.code === 'STAFF_ACCOUNT_DISABLED'
        ? 403
        : mapped.httpStatus === 400 ? 400 : 401,
      body: { ok: false, error: mapped.code === 'LOGIN_INVALID' ? 'AUTH_FAILED' : mapped.code },
      cookies: clearSecurityCookies(secure),
    };
  }

  let tokens: SecurityAuthTokens;
  try {
    tokens = await ports.signInWithPassword(email, password);
  } catch {
    return {
      status: 401,
      body: { ok: false, error: 'AUTH_FAILED' },
      cookies: clearSecurityCookies(secure),
    };
  }

  try {
    const staff = await staffFromAccessToken(ports, tokens.accessToken);
    return {
      status: 200,
      body: { ok: true, staff: publicSecurityStaff({ ...staff, login: staff.login ?? normalized }) },
      cookies: serializeSecurityCookies(tokens.accessToken, tokens.refreshToken, secure),
    };
  } catch (err) {
    const mapped = securityContextError(err);
    return {
      status: mapped.httpStatus === 403 ? 403 : 403,
      body: { ok: false, error: mapped.code },
      cookies: clearSecurityCookies(secure),
    };
  }
}

export async function resolveSecuritySession(
  ports: SecurityAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ staff: SecurityStaffContext; accessToken: string; cookies?: string[] }> {
  const cookies = readSecurityCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  if (cookies.accessToken) {
    try {
      const staff = await staffFromAccessToken(ports, cookies.accessToken);
      return { staff, accessToken: cookies.accessToken };
    } catch (err) {
      if (!isRefreshableAuthError(err) || !cookies.refreshToken) {
        throw securityContextError(err);
      }
    }
  }

  if (!cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let tokens: SecurityAuthTokens;
  try {
    tokens = await ports.refreshSession(cookies.refreshToken);
  } catch {
    throw staffError('JWT_INVALID', 401);
  }
  const staff = await staffFromAccessToken(ports, tokens.accessToken);
  return {
    staff,
    accessToken: tokens.accessToken,
    cookies: serializeSecurityCookies(tokens.accessToken, tokens.refreshToken, secure),
  };
}

export async function readSecuritySession(
  ports: SecurityAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<SecurityAuthHttpResult> {
  try {
    const resolved = await resolveSecuritySession(ports, cookieHeader, secure);
    return {
      status: 200,
      body: { ok: true, staff: publicSecurityStaff(resolved.staff) },
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = securityContextError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, error: mapped.code },
      cookies: clearSecurityCookies(secure),
    };
  }
}

export function logoutSecuritySession(secure: boolean): SecurityAuthHttpResult {
  return {
    status: 200,
    body: { ok: true },
    cookies: clearSecurityCookies(secure),
  };
}
