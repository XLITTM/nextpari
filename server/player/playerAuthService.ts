import { createAnonAuthClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';
import {
  clearPlayerCookies,
  readPlayerCookies,
  serializePlayerCookies,
} from './playerCookies.js';
import {
  normalizePlayerPhone,
  validatePlayerEmail,
  validatePlayerPassword,
  validatePlayerPhone,
} from './playerValidators.js';

export interface PlayerAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PlayerAuthUser {
  id: string;
  email: string;
}

export interface PlayerAccountProvision {
  walletId: string;
  publicId: string;
  legacyBalance: number | null;
  migrationState: string | null;
}

export interface PlayerOwnWallet {
  balance: number;
  currency: string;
  status: string;
  publicId?: string;
}

export interface PlayerAuthGatewayPorts {
  signInWithPassword: (email: string, password: string) => Promise<PlayerAuthTokens>;
  signUp: (email: string, password: string, phone: string) => Promise<PlayerAuthTokens>;
  refreshSession: (refreshToken: string) => Promise<PlayerAuthTokens>;
  getAuthUser: (accessToken: string) => Promise<PlayerAuthUser>;
  ensurePlayerAccount: (accessToken: string) => Promise<PlayerAccountProvision>;
  loadOwnWallet: (accessToken: string, walletId: string) => Promise<PlayerOwnWallet>;
  signOut?: (accessToken: string, refreshToken: string | null) => Promise<void>;
}

export interface PlayerAuthHttpResult {
  status: number;
  body: Record<string, unknown>;
  cookies?: string[];
  headers?: Record<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstRow(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function playerAuthError(err: unknown): StaffOnboardingError {
  if (err instanceof StaffOnboardingError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? raw;
  if (code === 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER') {
    return staffError(code, 403);
  }
  if (code === 'EMAIL_CONFIRMATION_REQUIRED') {
    return staffError(code, 409);
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
  return playerAuthError(err).httpStatus === 401;
}

function publicPlayerSnapshot(input: {
  email: string;
  publicId: string;
  balance: number;
  currency: string;
  status: string;
  migrationState: string | null;
}): Record<string, unknown> {
  return {
    ok: true,
    authenticated: true,
    player: {
      publicId: input.publicId,
      email: input.email,
    },
    wallet: {
      balance: input.balance,
      currency: input.currency,
      status: input.status,
      migrationState: input.migrationState,
    },
  };
}

async function snapshotFromAccessToken(
  ports: PlayerAuthGatewayPorts,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const user = await ports.getAuthUser(accessToken);
  if (!user.id) {
    throw staffError('AUTH_REQUIRED', 401);
  }
  const provision = await ports.ensurePlayerAccount(accessToken);
  const publicId = provision.publicId.replace(/\D/g, '');
  if (!provision.walletId || !publicId) {
    throw staffError('WALLET_UNAVAILABLE', 503);
  }
  const own = await ports.loadOwnWallet(accessToken, provision.walletId);
  const tableBalance = Number(own.balance);
  const rpcBalance = Number(provision.legacyBalance);
  const balance = Number.isFinite(tableBalance)
    ? tableBalance
    : Number.isFinite(rpcBalance)
      ? rpcBalance
      : NaN;
  if (!Number.isFinite(balance)) {
    throw staffError('WALLET_UNAVAILABLE', 503);
  }
  return publicPlayerSnapshot({
    email: user.email,
    publicId: own.publicId?.replace(/\D/g, '') || publicId,
    balance,
    currency: own.currency || 'TMTM',
    status: own.status || 'active',
    migrationState: provision.migrationState,
  });
}

async function issuedSession(
  ports: PlayerAuthGatewayPorts,
  tokens: PlayerAuthTokens,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  try {
    const body = await snapshotFromAccessToken(ports, tokens.accessToken);
    return {
      status: 200,
      body,
      cookies: serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure),
    };
  } catch (err) {
    const mapped = playerAuthError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, authenticated: false, error: mapped.code },
      cookies: clearPlayerCookies(secure),
    };
  }
}

export function livePlayerAuthPorts(): PlayerAuthGatewayPorts {
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
    async signUp(email, password, phone) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { phone } },
      });
      if (error) {
        throw staffError('AUTH_FAILED', 401);
      }
      if (data.user && !data.session) {
        throw staffError('EMAIL_CONFIRMATION_REQUIRED', 409);
      }
      const accessToken = data.session?.access_token?.trim() ?? '';
      const refreshToken = data.session?.refresh_token?.trim() ?? '';
      if (!accessToken || !refreshToken) {
        throw staffError('EMAIL_CONFIRMATION_REQUIRED', 409);
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
    async getAuthUser(accessToken) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user?.id) {
        throw staffError('AUTH_REQUIRED', 401);
      }
      return {
        id: data.user.id,
        email: String(data.user.email ?? ''),
      };
    },
    async ensurePlayerAccount(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('ensure_player_account');
      if (error) {
        const text = rpcMessage(error);
        if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
          throw staffError('JWT_INVALID', 401);
        }
        const code = extractErrorCode(text);
        if (code === 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER') {
          throw staffError(code, 403);
        }
        if (code) {
          throw staffError(code, /STAFF_|OWNER_|MANAGER_|CASHIER_/.test(code) ? 403 : 401);
        }
        throw staffError('WALLET_UNAVAILABLE', 503);
      }
      const row = firstRow(data);
      return {
        walletId: String(row.wallet_id ?? row.walletId ?? ''),
        publicId: String(row.public_id ?? row.publicId ?? ''),
        legacyBalance: row.legacy_balance == null && row.legacyBalance == null
          ? null
          : Number(row.legacy_balance ?? row.legacyBalance),
        migrationState: row.migration_state == null && row.migrationState == null
          ? null
          : String(row.migration_state ?? row.migrationState),
      };
    },
    async loadOwnWallet(accessToken, walletId) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const own = await client
        .from('wallets')
        .select('id, balance, currency, public_id')
        .eq('id', walletId)
        .maybeSingle();
      if (own.error) {
        throw staffError('WALLET_UNAVAILABLE', 503);
      }
      const ownId = String(own.data?.id ?? '');
      if (ownId && ownId !== walletId) {
        throw staffError('WALLET_UNAVAILABLE', 503);
      }
      return {
        balance: Number(own.data?.balance),
        currency: String(own.data?.currency ?? 'TMTM') || 'TMTM',
        status: 'active',
        publicId: own.data?.public_id == null ? undefined : String(own.data.public_id),
      };
    },
    async signOut(accessToken, refreshToken) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      if (refreshToken) {
        await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
      await client.auth.signOut();
    },
  };
}

export async function registerPlayerWithPassword(
  ports: PlayerAuthGatewayPorts,
  input: { email: string; password: string; phone: string },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const email = input.email.trim();
  const phone = normalizePlayerPhone(input.phone);
  if (validatePlayerEmail(email)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_EMAIL' },
      cookies: clearPlayerCookies(secure),
    };
  }
  if (validatePlayerPassword(input.password)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_PASSWORD' },
      cookies: clearPlayerCookies(secure),
    };
  }
  if (validatePlayerPhone(phone)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_PHONE' },
      cookies: clearPlayerCookies(secure),
    };
  }

  let tokens: PlayerAuthTokens;
  try {
    tokens = await ports.signUp(email, input.password, phone);
  } catch (err) {
    const mapped = playerAuthError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, authenticated: false, error: mapped.code },
      cookies: clearPlayerCookies(secure),
    };
  }
  return issuedSession(ports, tokens, secure);
}

export async function loginPlayerWithPassword(
  ports: PlayerAuthGatewayPorts,
  email: string,
  password: string,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const trimmed = email.trim();
  if (validatePlayerEmail(trimmed)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_EMAIL' },
      cookies: clearPlayerCookies(secure),
    };
  }
  if (validatePlayerPassword(password)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_PASSWORD' },
      cookies: clearPlayerCookies(secure),
    };
  }

  let tokens: PlayerAuthTokens;
  try {
    tokens = await ports.signInWithPassword(trimmed, password);
  } catch {
    return {
      status: 401,
      body: { ok: false, authenticated: false, error: 'AUTH_FAILED' },
      cookies: clearPlayerCookies(secure),
    };
  }
  return issuedSession(ports, tokens, secure);
}

export async function resolvePlayerSession(
  ports: PlayerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ body: Record<string, unknown>; accessToken: string; cookies?: string[] }> {
  const cookies = readPlayerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  if (cookies.accessToken) {
    try {
      const body = await snapshotFromAccessToken(ports, cookies.accessToken);
      return { body, accessToken: cookies.accessToken };
    } catch (err) {
      if (!isRefreshableAuthError(err) || !cookies.refreshToken) {
        throw playerAuthError(err);
      }
    }
  }

  if (!cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let tokens: PlayerAuthTokens;
  try {
    tokens = await ports.refreshSession(cookies.refreshToken);
  } catch {
    throw staffError('JWT_INVALID', 401);
  }
  const body = await snapshotFromAccessToken(ports, tokens.accessToken);
  return {
    body,
    accessToken: tokens.accessToken,
    cookies: serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure),
  };
}

export async function readPlayerSession(
  ports: PlayerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  try {
    const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
    return {
      status: 200,
      body: resolved.body,
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = playerAuthError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, authenticated: false, error: mapped.code },
      cookies: clearPlayerCookies(secure),
    };
  }
}

export async function logoutPlayerSession(
  ports: PlayerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const cookies = readPlayerCookies(cookieHeader);
  if (ports.signOut && cookies.accessToken) {
    try {
      await ports.signOut(cookies.accessToken, cookies.refreshToken);
    } catch {
      /* still clear cookies */
    }
  }
  return {
    status: 200,
    body: { ok: true },
    cookies: clearPlayerCookies(secure),
  };
}
