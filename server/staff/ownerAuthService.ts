import { createAnonAuthClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from './env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from './errors.js';
import {
  assertActiveOwnerContext,
  publicOwnerStaff,
  type OwnerStaffContext,
} from './ownerContext.js';
import { clearOwnerCookies, readOwnerCookies, serializeOwnerCookies } from './ownerCookies.js';
import type { StaffAuthRateLimitPorts } from './staffAuthRateLimit.js';

export interface OwnerAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface OwnerAuthGatewayPorts {
  signInWithPassword: (email: string, password: string) => Promise<OwnerAuthTokens>;
  refreshSession: (refreshToken: string) => Promise<OwnerAuthTokens>;
  currentStaffContext: (accessToken: string) => Promise<unknown>;
  signOutCurrentSession: (
    accessToken: string,
    refreshToken: string | null,
  ) => Promise<void>;
  staffAuthRateLimit?: StaffAuthRateLimitPorts;
}

export interface OwnerAuthHttpResult {
  status: number;
  body: Record<string, unknown>;
  cookies?: string[];
  headers?: Record<string, string>;
}

function ownerContextError(err: unknown): StaffOnboardingError {
  if (err instanceof StaffOnboardingError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? raw;
  if (
    code === 'OWNER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
  ) {
    return staffError(code, 403);
  }
  if (
    code === 'SESSION_EXPIRED'
    || code === 'JWT_INVALID'
    || code === 'JWT_REQUIRED'
    || code === 'AUTH_REQUIRED'
  ) {
    return staffError(code, 401);
  }
  const lower = raw.toLowerCase();
  if (lower.includes('jwt') || lower.includes('expired') || lower.includes('unauthorized')) {
    return staffError('JWT_INVALID', 401);
  }
  return staffError('AUTH_FAILED', 401);
}

function isRefreshableAuthError(err: unknown): boolean {
  const mapped = ownerContextError(err);
  return mapped.httpStatus === 401;
}

async function staffFromAccessToken(
  ports: OwnerAuthGatewayPorts,
  accessToken: string,
): Promise<OwnerStaffContext> {
  try {
    return assertActiveOwnerContext(await ports.currentStaffContext(accessToken));
  } catch (err) {
    throw ownerContextError(err);
  }
}

export function liveOwnerAuthPorts(): OwnerAuthGatewayPorts {
  const env = loadOwnerAuthEnv();
  return {
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
    async signOutCurrentSession(accessToken, refreshToken) {
      await signOutCurrentSupabaseSession(env, accessToken, refreshToken);
    },
    async currentStaffContext(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('current_staff_binding_context');
      if (error) {
        const text = rpcMessage(error);
        const code = extractErrorCode(text);
        if (code === 'SESSION_EXPIRED' || code === 'AUTH_REQUIRED') {
          throw staffError(code, 401);
        }
        if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
          throw staffError('JWT_INVALID', 401);
        }
        if (code) {
          throw staffError(
            code,
            /OWNER|MANAGER|CASHIER|STAFF_/.test(code) ? 403 : 401,
          );
        }
        throw staffError('JWT_INVALID', 401);
      }
      return data;
    },
  };
}

export async function loginOwnerWithPassword(
  ports: OwnerAuthGatewayPorts,
  email: string,
  password: string,
  secure: boolean,
): Promise<OwnerAuthHttpResult> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    return {
      status: 400,
      body: { ok: false, error: 'EMAIL_PASSWORD_REQUIRED' },
      cookies: clearOwnerCookies(secure),
    };
  }
  let tokens: OwnerAuthTokens;
  try {
    tokens = await ports.signInWithPassword(trimmed, password);
  } catch (err) {
    const mapped = ownerContextError(err);
    return {
      status: mapped.httpStatus === 403 ? 401 : 401,
      body: { ok: false, error: 'AUTH_FAILED' },
      cookies: clearOwnerCookies(secure),
    };
  }
  try {
    const staff = await staffFromAccessToken(ports, tokens.accessToken);
    return {
      status: 200,
      body: { ok: true, staff: publicOwnerStaff(staff) },
      cookies: serializeOwnerCookies(tokens.accessToken, tokens.refreshToken, secure),
    };
  } catch (err) {
    const mapped = ownerContextError(err);
    return {
      status: mapped.httpStatus === 403 ? 403 : 403,
      body: { ok: false, error: mapped.code },
      cookies: clearOwnerCookies(secure),
    };
  }
}

export async function resolveOwnerSession(
  ports: OwnerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ staff: OwnerStaffContext; accessToken: string; cookies?: string[] }> {
  const cookies = readOwnerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  if (cookies.accessToken) {
    try {
      const staff = await staffFromAccessToken(ports, cookies.accessToken);
      return { staff, accessToken: cookies.accessToken };
    } catch (err) {
      if (!isRefreshableAuthError(err) || !cookies.refreshToken) {
        throw ownerContextError(err);
      }
    }
  }

  if (!cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let tokens: OwnerAuthTokens;
  try {
    tokens = await ports.refreshSession(cookies.refreshToken);
  } catch {
    throw staffError('JWT_INVALID', 401);
  }
  const staff = await staffFromAccessToken(ports, tokens.accessToken);
  return {
    staff,
    accessToken: tokens.accessToken,
    cookies: serializeOwnerCookies(tokens.accessToken, tokens.refreshToken, secure),
  };
}

export async function readOwnerSession(
  ports: OwnerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<OwnerAuthHttpResult> {
  try {
    const resolved = await resolveOwnerSession(ports, cookieHeader, secure);
    return {
      status: 200,
      body: { ok: true, staff: publicOwnerStaff(resolved.staff) },
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = ownerContextError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, error: mapped.code },
      cookies: clearOwnerCookies(secure),
    };
  }
}

export async function logoutOwnerSession(
  ports: OwnerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<OwnerAuthHttpResult> {
  const cookies = readOwnerCookies(cookieHeader);
  return completeStaffLogout(
    ports,
    cookies.accessToken,
    cookies.refreshToken,
    clearOwnerCookies(secure),
  );
}

export async function signOutCurrentSupabaseSession(
  env: { supabaseUrl: string; supabaseAnonKey: string },
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  const access = accessToken.trim();
  const refresh = refreshToken?.trim() ?? '';
  if (!access && !refresh) return;

  if (access && refresh) {
    const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
    const { error: sessionError } = await client.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });
    if (sessionError) throw sessionError;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return;
  }

  if (refresh) {
    const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
    const { error: refreshError } = await client.auth.refreshSession({ refresh_token: refresh });
    if (refreshError) throw refreshError;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return;
  }

  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, access);
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

const SERVICE_FAILURE = /fetch failed|econnrefused|econnreset|enotfound|etimedout|network|timeout|socket|\b5\d\d\b/i;

export function staffSessionAlreadyRevoked(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (SERVICE_FAILURE.test(raw)) return false;
  return /session|refresh|jwt|expired|invalid|not found|unauthorized|auth|\b401\b|\b403\b/i.test(raw);
}

export async function completeStaffLogout(
  ports: Pick<OwnerAuthGatewayPorts, 'signOutCurrentSession'>,
  accessToken: string | null,
  refreshToken: string | null,
  clearedCookies: string[],
): Promise<OwnerAuthHttpResult> {
  if (!accessToken && !refreshToken) {
    return { status: 200, body: { ok: true }, cookies: clearedCookies };
  }
  try {
    await ports.signOutCurrentSession(accessToken ?? '', refreshToken);
    return { status: 200, body: { ok: true }, cookies: clearedCookies };
  } catch (err) {
    if (staffSessionAlreadyRevoked(err)) {
      return { status: 200, body: { ok: true }, cookies: clearedCookies };
    }
    return {
      status: 503,
      body: { ok: false, error: 'STAFF_SESSION_REVOCATION_FAILED' },
      cookies: clearedCookies,
    };
  }
}
