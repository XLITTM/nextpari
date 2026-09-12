import { createAnonAuthClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';
import {
  clearPlayerCookies,
  readPlayerCookies,
  serializePlayerCookies,
} from './playerCookies.js';
import {
  parseLoginPlayerId,
  normalizePlayerPhone,
  parsePlayerProfileFields,
  requireAgeConfirmed,
  validatePlayerEmail,
  validatePlayerPassword,
  validatePlayerPhone,
  type PlayerProfileFields,
} from './playerValidators.js';
import { generateOneClickPassword, publicAuthEmail } from '../auth/oneClickPassword.js';
import {
  claimPlayerLoginPhone,
  createManagedPasswordUser,
  deleteManagedAuthUser,
  resolvePlayerLoginEmail,
} from '../auth/playerIdentityAdmin.js';

export interface PlayerAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PlayerAuthUser {
  id: string;
  email: string;
  phone?: string;
  emailConfirmed?: boolean;
  phoneConfirmed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlayerSafeProfile {
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  passport: string;
  phone: string;
  email: string;
  phoneVerified: boolean;
  emailVerified: boolean;
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
  resolveLoginEmail?: (kind: 'public_id' | 'phone', value: string) => Promise<{
    ok: true;
    email: string;
  } | {
    ok: false;
    reason: 'missing' | 'ambiguous';
  }>;
  createManagedPasswordUser?: (input: {
    password: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ id: string; email: string }>;
  claimLoginPhone?: (authUserId: string, phone: string) => Promise<void>;
  deleteManagedAuthUser?: (id: string) => Promise<void>;
  generateOneClickPassword?: () => string;
  refreshSession: (refreshToken: string) => Promise<PlayerAuthTokens>;
  getAuthUser: (accessToken: string) => Promise<PlayerAuthUser>;
  ensurePlayerAccount: (accessToken: string) => Promise<PlayerAccountProvision>;
  loadOwnWallet: (accessToken: string, walletId: string) => Promise<PlayerOwnWallet>;
  savePlayerProfile: (
    accessToken: string,
    fields: PlayerProfileFields,
    refreshToken?: string | null,
  ) => Promise<void>;
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
  if (code === 'EMAIL_CONFIRMATION_REQUIRED' || code === 'REGISTRATION_FAILED' || code === 'PHONE_TAKEN') {
    return staffError(code === 'PHONE_TAKEN' ? 'REGISTRATION_FAILED' : code, 409);
  }
  if (code === 'AGE_REQUIRED' || code === 'INVALID_PHONE') {
    return staffError(code, 400);
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

function metaText(metadata: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!metadata) return '';
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function publicProfileFromUser(user: PlayerAuthUser): PlayerSafeProfile {
  const metadata = user.metadata ?? {};
  return {
    firstName: metaText(metadata, 'firstName', 'first_name'),
    lastName: metaText(metadata, 'lastName', 'last_name'),
    middleName: metaText(metadata, 'middleName', 'middle_name'),
    birthDate: metaText(metadata, 'birthDate', 'birth_date'),
    passport: metaText(metadata, 'passport'),
    phone: String(user.phone ?? '').trim() || metaText(metadata, 'phone'),
    email: publicAuthEmail(String(user.email ?? '').trim()),
    phoneVerified: user.phoneConfirmed === true,
    emailVerified: user.emailConfirmed === true && Boolean(publicAuthEmail(String(user.email ?? ''))),
  };
}

function publicPlayerSnapshot(input: {
  email: string;
  publicId: string;
  balance: number;
  currency: string;
  status: string;
  migrationState: string | null;
  profile: PlayerSafeProfile;
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
    profile: input.profile,
  };
}

function snapshotPublicId(value: string | undefined, fallback = ''): string {
  return parseLoginPlayerId(value ?? '') ?? parseLoginPlayerId(fallback) ?? '';
}

async function snapshotFromAccessToken(
  ports: PlayerAuthGatewayPorts,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const boot = await bootstrapPlayerSession(ports, { accessToken, refreshToken: '' }, false);
  if (boot.result.status !== 200 || !boot.result.body.ok) {
    throw staffError(String(boot.result.body.error ?? 'WALLET_UNAVAILABLE'), boot.result.status || 503);
  }
  return boot.result.body;
}

type PlayerSessionBootstrap = {
  provisioned: boolean;
  publicId: string;
  result: PlayerAuthHttpResult;
};

async function bootstrapPlayerSession(
  ports: PlayerAuthGatewayPorts,
  tokens: PlayerAuthTokens,
  secure: boolean,
): Promise<PlayerSessionBootstrap> {
  let provisioned = false;
  let publicId = '';
  try {
    const user = await ports.getAuthUser(tokens.accessToken);
    if (!user.id) {
      throw staffError('AUTH_REQUIRED', 401);
    }
    const provision = await ports.ensurePlayerAccount(tokens.accessToken);
    publicId = parseLoginPlayerId(provision.publicId) ?? '';
    if (!provision.walletId || !publicId) {
      throw staffError('WALLET_UNAVAILABLE', 503);
    }
    provisioned = true;

    const own = await ports.loadOwnWallet(tokens.accessToken, provision.walletId);
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
    const snapshotId = snapshotPublicId(own.publicId, publicId) || publicId;
    return {
      provisioned: true,
      publicId: snapshotId,
      result: {
        status: 200,
        body: publicPlayerSnapshot({
          email: publicAuthEmail(user.email),
          publicId: snapshotId,
          balance,
          currency: own.currency || 'TMTM',
          status: own.status || 'active',
          migrationState: provision.migrationState,
          profile: publicProfileFromUser(user),
        }),
        cookies: tokens.refreshToken
          ? serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure)
          : undefined,
      },
    };
  } catch (err) {
    const mapped = playerAuthError(err);
    return {
      provisioned,
      publicId,
      result: {
        status: mapped.httpStatus,
        body: { ok: false, authenticated: false, error: mapped.code },
        cookies: clearPlayerCookies(secure),
      },
    };
  }
}

async function abandonCreatedAuthUser(
  ports: PlayerAuthGatewayPorts,
  created: { id: string } | null,
): Promise<void> {
  const id = created?.id?.trim() ?? '';
  if (!id || !ports.deleteManagedAuthUser) return;
  try {
    await ports.deleteManagedAuthUser(id);
  } catch {
    /* best-effort cleanup of the user created by this request only */
  }
}

function registrationFailure(
  err: unknown,
  secure: boolean,
): PlayerAuthHttpResult {
  const mapped = playerAuthError(err);
  return {
    status: mapped.httpStatus === 401 ? 409 : mapped.httpStatus,
    body: {
      ok: false,
      authenticated: false,
      error: mapped.code === 'AUTH_FAILED' ? 'REGISTRATION_FAILED' : mapped.code,
    },
    cookies: clearPlayerCookies(secure),
  };
}

function failedRegistrationResult(
  result: PlayerAuthHttpResult,
  secure: boolean,
): PlayerAuthHttpResult {
  const error = String(result.body.error ?? 'REGISTRATION_FAILED');
  return {
    status: result.status === 401 ? 409 : result.status,
    body: {
      ok: false,
      authenticated: false,
      error: error === 'AUTH_FAILED' ? 'REGISTRATION_FAILED' : error,
    },
    cookies: result.cookies ?? clearPlayerCookies(secure),
  };
}

async function issuedSession(
  ports: PlayerAuthGatewayPorts,
  tokens: PlayerAuthTokens,
  secure: boolean,
  extra: Record<string, unknown> = {},
): Promise<PlayerAuthHttpResult> {
  const boot = await bootstrapPlayerSession(ports, tokens, secure);
  if (boot.result.status === 200 && Object.keys(extra).length) {
    boot.result.body = { ...boot.result.body, ...extra };
  }
  return boot.result;
}

async function finishManagedRegistration(
  ports: PlayerAuthGatewayPorts,
  created: { id: string; email: string },
  tokens: PlayerAuthTokens,
  secure: boolean,
  oneClickPassword?: string,
): Promise<{ provisioned: boolean; result: PlayerAuthHttpResult }> {
  const boot = await bootstrapPlayerSession(ports, tokens, secure);
  if (!boot.provisioned) {
    await abandonCreatedAuthUser(ports, created);
    return { provisioned: false, result: failedRegistrationResult(boot.result, secure) };
  }
  if (boot.result.status === 200) {
    if (oneClickPassword) {
      boot.result.body.oneClick = {
        playerId: boot.publicId,
        password: oneClickPassword,
      };
    }
    return { provisioned: true, result: boot.result };
  }
  if (oneClickPassword && boot.publicId) {
    return {
      provisioned: true,
      result: {
        status: 200,
        body: {
          ok: true,
          authenticated: false,
          player: { publicId: boot.publicId, email: '' },
          oneClick: { playerId: boot.publicId, password: oneClickPassword },
        },
        cookies: clearPlayerCookies(secure),
      },
    };
  }
  return { provisioned: true, result: failedRegistrationResult(boot.result, secure) };
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
        options: phone ? { data: { phone } } : undefined,
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
    resolveLoginEmail: resolvePlayerLoginEmail,
    createManagedPasswordUser,
    claimLoginPhone: claimPlayerLoginPhone,
    deleteManagedAuthUser,
    generateOneClickPassword,
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
        phone: String(data.user.phone ?? ''),
        emailConfirmed: Boolean(data.user.email_confirmed_at),
        phoneConfirmed: Boolean(data.user.phone_confirmed_at),
        metadata: asRecord(data.user.user_metadata),
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
    async savePlayerProfile(accessToken, fields, refreshToken) {
      const client = createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);
      if (refreshToken) {
        const { error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          throw staffError('JWT_INVALID', 401);
        }
      }
      const { data: existing, error: userError } = await client.auth.getUser(accessToken);
      if (userError || !existing.user?.id) {
        throw staffError('AUTH_REQUIRED', 401);
      }
      const previous = asRecord(existing.user.user_metadata);
      const { error } = await client.auth.updateUser({
        data: {
          ...previous,
          firstName: fields.firstName,
          lastName: fields.lastName,
          middleName: fields.middleName,
          birthDate: fields.birthDate,
          passport: fields.passport,
        },
      });
      if (error) {
        throw staffError('PROFILE_UNAVAILABLE', 503);
      }
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
  input: {
    method?: string;
    email?: string;
    password?: string;
    phone?: string;
    ageConfirmed?: unknown;
  },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  if (!requireAgeConfirmed(input.ageConfirmed)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'AGE_REQUIRED' },
      cookies: clearPlayerCookies(secure),
    };
  }

  const method = String(input.method ?? '').trim().toLowerCase().replace(/-/g, '_')
    || (String(input.email ?? '').trim() ? 'email' : '');

  if (method === 'one_click') {
    return registerOneClick(ports, secure);
  }
  if (method === 'phone') {
    return registerWithPhone(ports, input, secure);
  }
  if (method === 'email') {
    return registerWithEmail(ports, input, secure);
  }
  return {
    status: 400,
    body: { ok: false, authenticated: false, error: 'INVALID_REQUEST' },
    cookies: clearPlayerCookies(secure),
  };
}

async function registerWithEmail(
  ports: PlayerAuthGatewayPorts,
  input: { email?: string; password?: string },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const email = String(input.email ?? '').trim();
  const password = String(input.password ?? '');
  if (validatePlayerEmail(email)) {
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
    tokens = await ports.signUp(email, password, '');
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

async function registerWithPhone(
  ports: PlayerAuthGatewayPorts,
  input: { phone?: string; password?: string },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const phone = normalizePlayerPhone(String(input.phone ?? ''));
  const password = String(input.password ?? '');
  if (validatePlayerPhone(phone)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_PHONE' },
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
  if (!ports.createManagedPasswordUser || !ports.signInWithPassword) {
    return {
      status: 503,
      body: { ok: false, authenticated: false, error: 'REGISTRATION_UNAVAILABLE' },
      cookies: clearPlayerCookies(secure),
    };
  }
  if (ports.resolveLoginEmail) {
    const existing = await ports.resolveLoginEmail('phone', phone);
    if (existing.ok || existing.reason === 'ambiguous') {
      return {
        status: 409,
        body: { ok: false, authenticated: false, error: 'REGISTRATION_FAILED' },
        cookies: clearPlayerCookies(secure),
      };
    }
  }

  let created: { id: string; email: string } | null = null;
  let provisioned = false;
  try {
    created = await ports.createManagedPasswordUser({
      password,
      phone,
      metadata: { phone, loginKind: 'phone' },
    });
    if (ports.claimLoginPhone) {
      await ports.claimLoginPhone(created.id, phone);
    }
    const tokens = await ports.signInWithPassword(created.email, password);
    const finished = await finishManagedRegistration(ports, created, tokens, secure);
    provisioned = finished.provisioned;
    return finished.result;
  } catch (err) {
    if (!provisioned) {
      await abandonCreatedAuthUser(ports, created);
    }
    return registrationFailure(err, secure);
  }
}

async function registerOneClick(
  ports: PlayerAuthGatewayPorts,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  if (!ports.createManagedPasswordUser) {
    return {
      status: 503,
      body: { ok: false, authenticated: false, error: 'REGISTRATION_UNAVAILABLE' },
      cookies: clearPlayerCookies(secure),
    };
  }
  const password = ports.generateOneClickPassword
    ? ports.generateOneClickPassword()
    : generateOneClickPassword();
  let created: { id: string; email: string } | null = null;
  let provisioned = false;
  try {
    created = await ports.createManagedPasswordUser({
      password,
      metadata: { loginKind: 'one_click' },
    });
    const tokens = await ports.signInWithPassword(created.email, password);
    const finished = await finishManagedRegistration(ports, created, tokens, secure, password);
    provisioned = finished.provisioned;
    return finished.result;
  } catch (err) {
    if (!provisioned) {
      await abandonCreatedAuthUser(ports, created);
    }
    return registrationFailure(err, secure);
  }
}

function loginFailed(secure: boolean): PlayerAuthHttpResult {
  return {
    status: 401,
    body: { ok: false, authenticated: false, error: 'AUTH_FAILED' },
    cookies: clearPlayerCookies(secure),
  };
}

export async function loginPlayerWithPassword(
  ports: PlayerAuthGatewayPorts,
  input: {
    mode?: string;
    email?: string;
    identifier?: string;
    phone?: string;
    password?: string;
  },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const password = String(input.password ?? '');
  if (validatePlayerPassword(password)) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: 'INVALID_PASSWORD' },
      cookies: clearPlayerCookies(secure),
    };
  }

  const mode = String(input.mode ?? '').trim().toLowerCase();
  let email = String(input.email ?? '').trim();

  try {
    if (mode === 'phone' || (!mode && String(input.phone ?? '').trim() && !email)) {
      const phone = normalizePlayerPhone(String(input.phone ?? ''));
      if (validatePlayerPhone(phone) || !ports.resolveLoginEmail) return loginFailed(secure);
      const resolved = await ports.resolveLoginEmail('phone', phone);
      if (!resolved.ok) return loginFailed(secure);
      email = resolved.email;
    } else if (mode === 'identifier') {
      const identifier = String(input.identifier ?? '').trim();
      if (!validatePlayerEmail(identifier)) {
        email = identifier;
      } else {
        const playerId = parseLoginPlayerId(identifier);
        if (!playerId || !ports.resolveLoginEmail) return loginFailed(secure);
        const resolved = await ports.resolveLoginEmail('public_id', playerId);
        if (!resolved.ok) return loginFailed(secure);
        email = resolved.email;
      }
    } else if (validatePlayerEmail(email)) {
      return loginFailed(secure);
    }
  } catch {
    return loginFailed(secure);
  }

  let tokens: PlayerAuthTokens;
  try {
    tokens = await ports.signInWithPassword(email, password);
  } catch {
    return loginFailed(secure);
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

export async function readPlayerProfileSession(
  ports: PlayerAuthGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  try {
    const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
    const profile = resolved.body.profile && typeof resolved.body.profile === 'object'
      ? resolved.body.profile
      : publicProfileFromUser({ id: '', email: '' });
    return {
      status: 200,
      body: {
        ok: true,
        authenticated: true,
        player: resolved.body.player,
        profile,
      },
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

export async function updatePlayerProfileSession(
  ports: PlayerAuthGatewayPorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const parsed = parsePlayerProfileFields(body);
  if ('error' in parsed) {
    return {
      status: 400,
      body: { ok: false, authenticated: false, error: parsed.error },
    };
  }

  try {
    const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
    const cookies = readPlayerCookies(cookieHeader);
    await ports.savePlayerProfile(resolved.accessToken, parsed, cookies.refreshToken);
    const next = await snapshotFromAccessToken(ports, resolved.accessToken);
    return {
      status: 200,
      body: {
        ok: true,
        authenticated: true,
        player: next.player,
        profile: next.profile,
      },
      cookies: resolved.cookies,
    };
  } catch (err) {
    const mapped = playerAuthError(err);
    return {
      status: mapped.httpStatus,
      body: { ok: false, authenticated: false, error: mapped.code },
      cookies: mapped.httpStatus === 401 || mapped.httpStatus === 403
        ? clearPlayerCookies(secure)
        : undefined,
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
