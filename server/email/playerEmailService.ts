import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '../supabase/admin.js';
import { isInternalAuthEmail } from '../auth/oneClickPassword.js';
import { sendResendEmail, type TransactionalEmailProvider } from './resendAdapter.js';
import { loadPlayerEmailProviderEnv, loadStaffOnboardingEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';
import { clearPlayerCookies, readPlayerCookies } from '../player/playerCookies.js';
import {
  normalizePlayerEmail,
  validatePlayerEmail,
} from '../player/playerValidators.js';
import type { PlayerAuthGatewayPorts, PlayerAuthHttpResult } from '../player/playerAuthService.js';
import type { PlayerSecurityObserver } from '../player/playerSecurityService.js';
import { deliverPendingManualVerificationInstructions } from './playerManualVerificationService.js';

export const PLAYER_EMAIL_START_PATH = '/api/player/email/start';
export const PLAYER_EMAIL_VERIFY_PATH = '/api/player/email/verify';
export const PLAYER_EMAIL_OTP_TTL_SECONDS = 10 * 60;
export const PLAYER_EMAIL_RESEND_SECONDS = 60;
export const PLAYER_EMAIL_MAX_ATTEMPTS = 5;
export const PLAYER_EMAIL_MAX_SENDS_PER_HOUR = 5;

export interface PlayerEmailChallengeRow {
  id: string;
  email_normalized: string;
  code_hash: string;
  expires_at: string;
  attempt_count: number;
  max_attempts: number;
  consumed_at: string | null;
}

export interface PlayerEmailPorts {
  getAuthUser: PlayerAuthGatewayPorts['getAuthUser'];
  refreshSession: PlayerAuthGatewayPorts['refreshSession'];
  sendEmail: TransactionalEmailProvider['send'];
  isEmailTaken: (email: string, selfId: string) => Promise<boolean>;
  createChallenge: (input: {
    authUserId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    resendAvailableAt: string;
  }) => Promise<{ id: string }>;
  markChallengeUnusable: (id: string) => Promise<void>;
  loadActiveChallenge: (authUserId: string) => Promise<PlayerEmailChallengeRow | null>;
  registerFailure: (id: string) => Promise<number>;
  consumeChallenge: (id: string) => Promise<boolean>;
  updateAuthEmail: (authUserId: string, email: string) => Promise<void>;
  syncProfileEmail: (authUserId: string, email: string) => Promise<void>;
  afterEmailVerified?: (authUserId: string, email: string) => Promise<void>;
  now?: () => Date;
  generateCode?: () => string;
  hashCode?: (code: string) => string;
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

export function generatePlayerEmailOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashPlayerEmailOtp(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('hex');
}

export function otpHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function maskPlayerEmail(email: string): string {
  const value = normalizePlayerEmail(email);
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const local = value.slice(0, at);
  const domain = value.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}***${domain}`;
}

export function playerEmailVerifyCode(value: string): string | null {
  const code = String(value ?? '');
  return /^[0-9]{6}$/.test(code) ? code : null;
}

function failed(status: number, error: string, cookies?: string[]): PlayerAuthHttpResult {
  return { status, body: { ok: false, error }, cookies };
}

function isSessionFailure(
  value: { id: string; email: string } | PlayerAuthHttpResult,
): value is PlayerAuthHttpResult {
  return 'status' in value && 'body' in value;
}

async function sessionUser(
  ports: PlayerEmailPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ id: string; email: string } | PlayerAuthHttpResult> {
  const cookies = readPlayerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    return failed(401, 'SESSION_REQUIRED', clearPlayerCookies(secure));
  }
  const access = cookies.accessToken;
  if (access) {
    try {
      const user = await ports.getAuthUser(access);
      if (user.id) return { id: user.id, email: String(user.email ?? '') };
    } catch {
      /* refresh */
    }
  }
  if (!cookies.refreshToken) {
    return failed(401, 'SESSION_EXPIRED', clearPlayerCookies(secure));
  }
  try {
    const rotated = await ports.refreshSession(cookies.refreshToken);
    const user = await ports.getAuthUser(rotated.accessToken);
    if (!user.id) return failed(401, 'SESSION_EXPIRED', clearPlayerCookies(secure));
    return { id: user.id, email: String(user.email ?? '') };
  } catch {
    return failed(401, 'SESSION_EXPIRED', clearPlayerCookies(secure));
  }
}

function mapEmailRpcError(err: unknown): PlayerAuthHttpResult {
  if (err instanceof StaffOnboardingError) {
    return failed(err.httpStatus, err.code);
  }
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = extractErrorCode(raw) ?? extractErrorCode(rpcMessage({ message: raw })) ?? '';
  if (code === 'EMAIL_UNAVAILABLE') return failed(409, 'EMAIL_UNAVAILABLE');
  if (code === 'EMAIL_RESEND_COOLDOWN') return failed(429, 'EMAIL_RESEND_COOLDOWN');
  if (code === 'EMAIL_SEND_RATE_LIMITED') return failed(429, 'EMAIL_SEND_RATE_LIMITED');
  if (code === 'EMAIL_PROVIDER_NOT_CONFIGURED') return failed(503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  if (code === 'INVALID_EMAIL') return failed(400, 'INVALID_EMAIL');
  if (code === 'JWT_REQUIRED') return failed(401, 'SESSION_REQUIRED');
  return failed(500, 'INTERNAL_ERROR');
}

export async function startPlayerEmailBinding(
  ports: PlayerEmailPorts,
  cookieHeader: string | undefined,
  input: { email?: string },
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const session = await sessionUser(ports, cookieHeader, secure);
  if (isSessionFailure(session)) return session;
  const user = session;

  const email = normalizePlayerEmail(String(input.email ?? ''));
  if (validatePlayerEmail(email) || isInternalAuthEmail(email)) {
    return failed(400, 'INVALID_EMAIL');
  }

  try {
    if (await ports.isEmailTaken(email, user.id)) {
      return failed(409, 'EMAIL_UNAVAILABLE');
    }
  } catch (err) {
    return mapEmailRpcError(err);
  }

  const now = ports.now ? ports.now() : new Date();
  let code: string;
  let hash: string;
  try {
    code = ports.generateCode ? ports.generateCode() : generatePlayerEmailOtp();
    hash = ports.hashCode ? ports.hashCode(code) : '';
  } catch (err) {
    return mapEmailRpcError(err);
  }
  if (!hash) {
    return failed(503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  const expiresAt = new Date(now.getTime() + PLAYER_EMAIL_OTP_TTL_SECONDS * 1000).toISOString();
  const resendAt = new Date(now.getTime() + PLAYER_EMAIL_RESEND_SECONDS * 1000).toISOString();

  let challengeId = '';
  try {
    const created = await ports.createChallenge({
      authUserId: user.id,
      email,
      codeHash: hash,
      expiresAt,
      resendAvailableAt: resendAt,
    });
    challengeId = created.id;
  } catch (err) {
    return mapEmailRpcError(err);
  }

  try {
    await ports.sendEmail({
      to: email,
      subject: 'NextPari — подтверждение электронной почты',
      text: [
        'Ваш код подтверждения:',
        code,
        '',
        'Код действует 10 минут.',
        'Никому не сообщайте этот код.',
      ].join('\n'),
    });
  } catch {
    try {
      await ports.markChallengeUnusable(challengeId);
    } catch {
      /* still fail honestly */
    }
    return failed(503, 'EMAIL_DELIVERY_FAILED');
  }

  return {
    status: 200,
    body: {
      ok: true,
      maskedEmail: maskPlayerEmail(email),
      expiresInSeconds: PLAYER_EMAIL_OTP_TTL_SECONDS,
      resendAfterSeconds: PLAYER_EMAIL_RESEND_SECONDS,
    },
  };
}

export async function verifyPlayerEmailBinding(
  ports: PlayerEmailPorts,
  cookieHeader: string | undefined,
  input: { code?: string },
  secure: boolean,
  security?: PlayerSecurityObserver,
): Promise<PlayerAuthHttpResult> {
  const session = await sessionUser(ports, cookieHeader, secure);
  if (isSessionFailure(session)) return session;
  const user = session;

  const code = playerEmailVerifyCode(String(input.code ?? ''));
  if (!code) {
    return failed(400, 'INVALID_CODE');
  }
  let submittedHash = '';
  try {
    submittedHash = ports.hashCode ? ports.hashCode(code) : '';
  } catch (err) {
    return mapEmailRpcError(err);
  }
  if (!submittedHash) {
    return failed(503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }

  let challenge: PlayerEmailChallengeRow | null;
  try {
    challenge = await ports.loadActiveChallenge(user.id);
  } catch (err) {
    return mapEmailRpcError(err);
  }
  if (!challenge) {
    return failed(400, 'EMAIL_CHALLENGE_NOT_FOUND');
  }
  const now = ports.now ? ports.now() : new Date();
  if (challenge.consumed_at) {
    return failed(409, 'EMAIL_CODE_CONSUMED');
  }
  if (new Date(challenge.expires_at).getTime() <= now.getTime()) {
    return failed(400, 'EMAIL_CODE_EXPIRED');
  }
  if (challenge.attempt_count >= (challenge.max_attempts || PLAYER_EMAIL_MAX_ATTEMPTS)) {
    return failed(429, 'EMAIL_CODE_LOCKED');
  }
  if (!otpHashesEqual(challenge.code_hash, submittedHash)) {
    let attempts = challenge.attempt_count + 1;
    try {
      attempts = await ports.registerFailure(challenge.id);
    } catch (err) {
      return mapEmailRpcError(err);
    }
    if (attempts >= PLAYER_EMAIL_MAX_ATTEMPTS) {
      return failed(429, 'EMAIL_CODE_LOCKED');
    }
    return failed(401, 'EMAIL_CODE_INVALID');
  }

  let consumed = false;
  try {
    consumed = await ports.consumeChallenge(challenge.id);
  } catch (err) {
    return mapEmailRpcError(err);
  }
  if (!consumed) {
    return failed(409, 'EMAIL_CODE_CONSUMED');
  }

  try {
    await ports.updateAuthEmail(user.id, challenge.email_normalized);
    await ports.syncProfileEmail(user.id, challenge.email_normalized);
  } catch {
    return failed(503, 'EMAIL_UPDATE_FAILED');
  }

  await security?.record('EMAIL_VERIFIED', user.id, { source: 'email_verify' });
  try {
    await ports.afterEmailVerified?.(user.id, challenge.email_normalized);
  } catch {
    /* instruction delivery must not roll back a successful email bind */
  }
  return {
    status: 200,
    body: {
      ok: true,
      email: challenge.email_normalized,
      emailVerified: true,
    },
  };
}

export function livePlayerEmailPorts(authPorts: PlayerAuthGatewayPorts): PlayerEmailPorts {
  const env = loadPlayerEmailProviderEnv();
  const staff = () => {
    const loaded = loadStaffOnboardingEnv();
    return createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
  };
  const pepper = env?.otpPepper ?? '';
  return {
    getAuthUser: authPorts.getAuthUser,
    refreshSession: authPorts.refreshSession,
    async sendEmail(message) {
      if (!env) throw staffError('EMAIL_PROVIDER_NOT_CONFIGURED', 503);
      await sendResendEmail(
        { resendApiKey: env.resendApiKey, fromAddress: env.fromAddress },
        message,
      );
    },
    hashCode(code) {
      if (!pepper) throw staffError('EMAIL_PROVIDER_NOT_CONFIGURED', 503);
      return hashPlayerEmailOtp(code, pepper);
    },
    generateCode: generatePlayerEmailOtp,
    async isEmailTaken(email, selfId) {
      const client = staff();
      const { data, error } = await client.rpc('player_email_is_taken', {
        p_email: email,
        p_self: selfId,
      });
      if (error) throw staffError(extractErrorCode(rpcMessage(error)) ?? 'INTERNAL_ERROR', 500);
      return data === true;
    },
    async createChallenge(input) {
      const client = staff();
      const { data, error } = await client.rpc('player_email_challenge_create', {
        p_auth_user_id: input.authUserId,
        p_email: input.email,
        p_code_hash: input.codeHash,
        p_expires_at: input.expiresAt,
        p_resend_available_at: input.resendAvailableAt,
      });
      if (error) {
        const code = extractErrorCode(rpcMessage(error)) ?? 'INTERNAL_ERROR';
        const status = code === 'EMAIL_RESEND_COOLDOWN' || code === 'EMAIL_SEND_RATE_LIMITED'
          ? 429
          : code === 'EMAIL_UNAVAILABLE'
            ? 409
            : 400;
        throw staffError(code, status);
      }
      const row = firstRow(data);
      return { id: String(row.id ?? '') };
    },
    async markChallengeUnusable(id) {
      const client = staff();
      await client.rpc('player_email_challenge_mark_unusable', { p_id: id });
    },
    async loadActiveChallenge(authUserId) {
      const client = staff();
      const { data, error } = await client.rpc('player_email_challenge_active', {
        p_auth_user_id: authUserId,
      });
      if (error) throw staffError('INTERNAL_ERROR', 500);
      const row = firstRow(data);
      const id = String(row.id ?? '');
      if (!id) return null;
      return {
        id,
        email_normalized: String(row.email_normalized ?? ''),
        code_hash: String(row.code_hash ?? ''),
        expires_at: String(row.expires_at ?? ''),
        attempt_count: Number(row.attempt_count ?? 0),
        max_attempts: Number(row.max_attempts ?? PLAYER_EMAIL_MAX_ATTEMPTS),
        consumed_at: row.consumed_at == null ? null : String(row.consumed_at),
      };
    },
    async registerFailure(id) {
      const client = staff();
      const { data, error } = await client.rpc('player_email_challenge_register_failure', { p_id: id });
      if (error) throw staffError('INTERNAL_ERROR', 500);
      return Number(data ?? 0);
    },
    async consumeChallenge(id) {
      const client = staff();
      const { data, error } = await client.rpc('player_email_challenge_consume', { p_id: id });
      if (error) throw staffError('INTERNAL_ERROR', 500);
      return data === true;
    },
    async updateAuthEmail(authUserId, email) {
      const loaded = loadStaffOnboardingEnv();
      const client = createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
      const { error } = await client.auth.admin.updateUserById(authUserId, {
        email,
        email_confirm: true,
      });
      if (error) throw staffError('EMAIL_UPDATE_FAILED', 503);
    },
    async syncProfileEmail(authUserId, email) {
      const client = staff();
      const { error } = await client.rpc('player_sync_verified_email', {
        p_auth_user_id: authUserId,
        p_email: email,
      });
      if (error) throw staffError('EMAIL_UPDATE_FAILED', 503);
    },
    async afterEmailVerified(authUserId) {
      await deliverPendingManualVerificationInstructions(authUserId);
    },
  };
}
