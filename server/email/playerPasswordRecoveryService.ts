import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '../supabase/admin.js';
import { sendResendEmail, type TransactionalEmailProvider } from './resendAdapter.js';
import { loadPlayerEmailProviderEnv, loadStaffOnboardingEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError } from '../staff/errors.js';
import { clearPlayerCookies } from '../player/playerCookies.js';
import { validatePlayerPassword } from '../player/playerValidators.js';
import { liveRevokePlayerAuthSessions } from '../player/playerAuthSession.js';
import { playerEmailVerifyCode } from './playerEmailService.js';
import type { PlayerAuthHttpResult } from '../player/playerAuthService.js';
import type { PlayerSecurityObserver } from '../player/playerSecurityService.js';

export const PLAYER_PASSWORD_RECOVERY_START_PATH = '/api/player/password-recovery/start';
export const PLAYER_PASSWORD_RECOVERY_VERIFY_PATH = '/api/player/password-recovery/verify';
export const PLAYER_PASSWORD_RECOVERY_RESET_PATH = '/api/player/password-recovery/reset';

export const PLAYER_PASSWORD_RECOVERY_OTP_TTL_SECONDS = 10 * 60;
export const PLAYER_PASSWORD_RECOVERY_RESEND_SECONDS = 60;
export const PLAYER_PASSWORD_RECOVERY_MAX_ATTEMPTS = 5;
export const PLAYER_PASSWORD_RECOVERY_MAX_SENDS_PER_HOUR = 5;
export const PLAYER_PASSWORD_RECOVERY_TICKET_TTL_SECONDS = 10 * 60;

export const PLAYER_PASSWORD_RECOVERY_START_MESSAGE =
  'Если аккаунт с подтверждённой почтой существует, код отправлен.';
export const PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE = 'Пароль изменён. Войдите с новым паролем.';
export const PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE = 'Неверный или истёкший код.';
export const PLAYER_PASSWORD_RESET_SESSION_REVOCATION_FAILED_MESSAGE =
  'Пароль обновлён, но не удалось завершить выход на других устройствах. Войдите с новым паролем.';
export const PLAYER_PASSWORD_RECOVERY_START_MIN_MS = 800;

const CODE_DOMAIN = 'password-recovery-code:';
const TICKET_DOMAIN = 'password-recovery-ticket:';

export interface PlayerPasswordRecoveryPrepareResult {
  eligible: boolean;
  challengeId?: string;
  playerUserId?: string;
  email?: string;
}

export interface PlayerPasswordRecoveryVerifyResult {
  ok: boolean;
  playerUserId?: string;
}

export interface PlayerPasswordRecoveryConsumeResult {
  ok: boolean;
  playerUserId?: string;
}

export interface PlayerPasswordRecoveryPorts {
  sendEmail: TransactionalEmailProvider['send'];
  prepareChallenge: (input: {
    identifier: string;
    codeDigest: string;
    expiresAt: string;
  }) => Promise<PlayerPasswordRecoveryPrepareResult>;
  markChallengeUnusable: (id: string) => Promise<void>;
  verifyChallenge: (input: {
    challengeId: string;
    codeDigest: string;
    ticketDigest: string;
    ticketExpiresAt: string;
  }) => Promise<PlayerPasswordRecoveryVerifyResult>;
  consumeTicket: (ticketDigest: string) => Promise<PlayerPasswordRecoveryConsumeResult>;
  updateAuthPassword: (userId: string, password: string) => Promise<void>;
  revokeAllSessions: (userId: string) => Promise<void>;
  now?: () => Date;
  nowMs?: () => number;
  delay?: (ms: number) => Promise<void>;
  generateCode?: () => string;
  generateTicket?: () => string;
  generateChallengeId?: () => string;
  hashSecret?: (kind: 'code' | 'ticket', value: string) => string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function generatePlayerPasswordRecoveryOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function generatePlayerPasswordResetTicket(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPlayerPasswordRecoverySecret(
  kind: 'code' | 'ticket',
  value: string,
  pepper: string,
): string {
  const domain = kind === 'code' ? CODE_DOMAIN : TICKET_DOMAIN;
  return createHmac('sha256', pepper).update(`${domain}${value}`).digest('hex');
}

export function recoveryDigestsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function startOk(challengeId: string): PlayerAuthHttpResult {
  return {
    status: 200,
    body: {
      ok: true,
      message: PLAYER_PASSWORD_RECOVERY_START_MESSAGE,
      challengeId,
      resendAfterSeconds: PLAYER_PASSWORD_RECOVERY_RESEND_SECONDS,
    },
  };
}

function invalidCode(): PlayerAuthHttpResult {
  return {
    status: 400,
    body: { ok: false, error: 'RECOVERY_CODE_INVALID', message: PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE },
  };
}

function failed(status: number, error: string, extra?: Record<string, unknown>): PlayerAuthHttpResult {
  return { status, body: { ok: false, error, ...extra } };
}

function startedAtMs(ports: PlayerPasswordRecoveryPorts): number {
  return ports.nowMs ? ports.nowMs() : Date.now();
}

async function padStartResponse(startedAt: number, ports: PlayerPasswordRecoveryPorts): Promise<void> {
  const now = startedAtMs(ports);
  const remaining = PLAYER_PASSWORD_RECOVERY_START_MIN_MS - Math.max(0, now - startedAt);
  if (remaining <= 0) return;
  const wait = ports.delay ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  await wait(remaining);
}

async function genericStart(ports: PlayerPasswordRecoveryPorts, startedAt: number, challengeId: string): Promise<PlayerAuthHttpResult> {
  await padStartResponse(startedAt, ports);
  return startOk(challengeId);
}

async function revokePlayerSessionsGuaranteed(
  ports: PlayerPasswordRecoveryPorts,
  userId: string,
): Promise<void> {
  try {
    await ports.revokeAllSessions(userId);
  } catch {
    await ports.revokeAllSessions(userId);
  }
}

function hashOrUnavailable(
  ports: PlayerPasswordRecoveryPorts,
  kind: 'code' | 'ticket',
  value: string,
): string | PlayerAuthHttpResult {
  try {
    const digest = ports.hashSecret ? ports.hashSecret(kind, value) : '';
    if (!digest) return failed(503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
    return digest;
  } catch {
    return failed(503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }
}

export async function startPlayerPasswordRecovery(
  ports: PlayerPasswordRecoveryPorts,
  input: { identifier?: string },
  security?: PlayerSecurityObserver,
): Promise<PlayerAuthHttpResult> {
  const startedAt = startedAtMs(ports);
  const identifier = String(input.identifier ?? '').trim();
  const fakeId = ports.generateChallengeId ? ports.generateChallengeId() : randomUUID();
  const now = ports.now ? ports.now() : new Date();
  const code = ports.generateCode ? ports.generateCode() : generatePlayerPasswordRecoveryOtp();
  const hashed = hashOrUnavailable(ports, 'code', code);
  if (typeof hashed !== 'string') return hashed;

  const expiresAt = new Date(now.getTime() + PLAYER_PASSWORD_RECOVERY_OTP_TTL_SECONDS * 1000).toISOString();
  let prepared: PlayerPasswordRecoveryPrepareResult = { eligible: false };
  try {
    prepared = await ports.prepareChallenge({
      identifier,
      codeDigest: hashed,
      expiresAt,
    });
  } catch {
    return genericStart(ports, startedAt, fakeId);
  }

  if (!prepared.eligible || !prepared.challengeId || !prepared.email || !prepared.playerUserId) {
    return genericStart(ports, startedAt, fakeId);
  }

  try {
    await ports.sendEmail({
      to: prepared.email,
      subject: 'NextPari — восстановление пароля',
      text: [
        'NextPari password recovery',
        '',
        'Ваш код восстановления пароля:',
        code,
        '',
        'Код действует 10 минут.',
        'Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.',
      ].join('\n'),
    });
  } catch {
    try {
      await ports.markChallengeUnusable(prepared.challengeId);
    } catch {
      /* still generic */
    }
    return genericStart(ports, startedAt, fakeId);
  }

  try {
    await security?.record('PASSWORD_RECOVERY_REQUESTED', prepared.playerUserId, { source: 'password_recovery' });
  } catch {
    /* telemetry must not change the generic start response */
  }

  return genericStart(ports, startedAt, prepared.challengeId);
}

export async function verifyPlayerPasswordRecovery(
  ports: PlayerPasswordRecoveryPorts,
  input: { challengeId?: string; code?: string },
  security?: PlayerSecurityObserver,
): Promise<PlayerAuthHttpResult> {
  const challengeId = String(input.challengeId ?? '').trim();
  const code = playerEmailVerifyCode(String(input.code ?? ''));
  const dummyCode = ports.generateCode ? ports.generateCode() : generatePlayerPasswordRecoveryOtp();
  const dummyTicket = ports.generateTicket ? ports.generateTicket() : generatePlayerPasswordResetTicket();
  void dummyCode;
  void dummyTicket;
  if (!challengeId || !code) {
    return invalidCode();
  }

  const codeDigest = hashOrUnavailable(ports, 'code', code);
  if (typeof codeDigest !== 'string') return codeDigest;

  const ticket = ports.generateTicket ? ports.generateTicket() : generatePlayerPasswordResetTicket();
  const ticketDigest = hashOrUnavailable(ports, 'ticket', ticket);
  if (typeof ticketDigest !== 'string') return ticketDigest;

  const now = ports.now ? ports.now() : new Date();
  const ticketExpiresAt = new Date(now.getTime() + PLAYER_PASSWORD_RECOVERY_TICKET_TTL_SECONDS * 1000).toISOString();

  let verified: PlayerPasswordRecoveryVerifyResult;
  try {
    verified = await ports.verifyChallenge({
      challengeId,
      codeDigest,
      ticketDigest,
      ticketExpiresAt,
    });
  } catch {
    return invalidCode();
  }
  if (!verified.ok) {
    return invalidCode();
  }

  try {
    await security?.record('PASSWORD_RECOVERY_VERIFIED', verified.playerUserId ?? null, { source: 'password_recovery' });
  } catch {
    /* telemetry must not hide a successful verification */
  }

  return {
    status: 200,
    body: { ok: true, resetTicket: ticket },
  };
}

export async function resetPlayerPasswordWithTicket(
  ports: PlayerPasswordRecoveryPorts,
  input: { resetTicket?: string; newPassword?: string; confirmPassword?: string },
  secure: boolean,
  security?: PlayerSecurityObserver,
): Promise<PlayerAuthHttpResult> {
  const resetTicket = String(input.resetTicket ?? '');
  const newPassword = String(input.newPassword ?? '');
  const confirmPassword = String(input.confirmPassword ?? '');

  if (!resetTicket) {
    return failed(400, 'RESET_TICKET_INVALID');
  }
  if (newPassword !== confirmPassword) {
    return failed(400, 'PASSWORD_CONFIRMATION_MISMATCH');
  }
  if (validatePlayerPassword(newPassword)) {
    return failed(400, 'PASSWORD_POLICY_INVALID');
  }

  const ticketDigest = hashOrUnavailable(ports, 'ticket', resetTicket);
  if (typeof ticketDigest !== 'string') return ticketDigest;

  let consumed: PlayerPasswordRecoveryConsumeResult;
  try {
    consumed = await ports.consumeTicket(ticketDigest);
  } catch {
    return failed(400, 'RESET_TICKET_INVALID');
  }
  if (!consumed.ok || !consumed.playerUserId) {
    return failed(400, 'RESET_TICKET_INVALID');
  }

  try {
    await ports.updateAuthPassword(consumed.playerUserId, newPassword);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    if (code === 'PASSWORD_POLICY_INVALID') {
      return failed(400, 'PASSWORD_POLICY_INVALID');
    }
    return failed(503, 'PASSWORD_RESET_FAILED');
  }

  try {
    await revokePlayerSessionsGuaranteed(ports, consumed.playerUserId);
  } catch {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'PASSWORD_RESET_SESSION_REVOCATION_FAILED',
        message: PLAYER_PASSWORD_RESET_SESSION_REVOCATION_FAILED_MESSAGE,
      },
      cookies: clearPlayerCookies(secure),
    };
  }

  try {
    await security?.record('PASSWORD_RECOVERY_COMPLETED', consumed.playerUserId, { source: 'password_recovery' });
  } catch {
    /* telemetry must never roll back a successful password reset */
  }

  return {
    status: 200,
    body: {
      ok: true,
      message: PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE,
    },
    cookies: clearPlayerCookies(secure),
  };
}

export function livePlayerPasswordRecoveryPorts(): PlayerPasswordRecoveryPorts {
  const env = loadPlayerEmailProviderEnv();
  const pepper = env?.otpPepper ?? '';
  const staff = () => {
    const loaded = loadStaffOnboardingEnv();
    return createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
  };

  return {
    generateCode: generatePlayerPasswordRecoveryOtp,
    generateTicket: generatePlayerPasswordResetTicket,
    generateChallengeId: () => randomUUID(),
    hashSecret(kind, value) {
      if (!pepper) throw staffError('EMAIL_PROVIDER_NOT_CONFIGURED', 503);
      return hashPlayerPasswordRecoverySecret(kind, value, pepper);
    },
    async sendEmail(message) {
      if (!env) throw staffError('EMAIL_PROVIDER_NOT_CONFIGURED', 503);
      await sendResendEmail(
        { resendApiKey: env.resendApiKey, fromAddress: env.fromAddress },
        message,
      );
    },
    async prepareChallenge(input) {
      const client = staff();
      const { data, error } = await client.rpc('player_password_recovery_prepare', {
        p_identifier: input.identifier,
        p_code_digest: input.codeDigest,
        p_expires_at: input.expiresAt,
      });
      if (error) {
        void extractErrorCode(rpcMessage(error));
        return { eligible: false };
      }
      const row = asRecord(data);
      if (row.eligible !== true) return { eligible: false };
      return {
        eligible: true,
        challengeId: String(row.challenge_id ?? ''),
        playerUserId: String(row.player_user_id ?? ''),
        email: String(row.email ?? ''),
      };
    },
    async markChallengeUnusable(id) {
      const client = staff();
      await client.rpc('player_password_recovery_mark_unusable', { p_id: id });
    },
    async verifyChallenge(input) {
      const client = staff();
      const { data, error } = await client.rpc('player_password_recovery_verify', {
        p_challenge_id: input.challengeId,
        p_code_digest: input.codeDigest,
        p_ticket_digest: input.ticketDigest,
        p_ticket_expires_at: input.ticketExpiresAt,
      });
      if (error) return { ok: false };
      const row = asRecord(data);
      if (row.ok !== true) return { ok: false };
      return { ok: true, playerUserId: String(row.player_user_id ?? '') };
    },
    async consumeTicket(ticketDigest) {
      const client = staff();
      const { data, error } = await client.rpc('player_password_recovery_consume_ticket', {
        p_ticket_digest: ticketDigest,
      });
      if (error) return { ok: false };
      const row = asRecord(data);
      if (row.ok !== true) return { ok: false };
      return { ok: true, playerUserId: String(row.player_user_id ?? '') };
    },
    async updateAuthPassword(userId, password) {
      const loaded = loadStaffOnboardingEnv();
      const client = createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
      const { error } = await client.auth.admin.updateUserById(userId, { password });
      if (error) {
        const text = String(error.message ?? '').toLowerCase();
        if (text.includes('password') && (text.includes('short') || text.includes('least') || text.includes('character'))) {
          throw staffError('PASSWORD_POLICY_INVALID', 400);
        }
        throw staffError('PASSWORD_RESET_FAILED', 503);
      }
    },
    async revokeAllSessions(userId) {
      await liveRevokePlayerAuthSessions(userId);
    },
  };
}
