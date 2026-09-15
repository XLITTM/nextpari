import { createServiceRoleClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv, loadPlayerEmailProviderEnv, loadPlayerSupportEmail, loadStaffOnboardingEnv } from '../staff/env.js';
import { sendResendEmail, type TransactionalEmailProvider } from './resendAdapter.js';
import { staffError } from '../staff/errors.js';

export const PLAYER_VERIFICATION_NOTICE_PATH = '/api/player/verification-notice';

export const PLAYER_VERIFICATION_NOTICE_TITLE = 'Требуется верификация аккаунта.';
export const PLAYER_VERIFICATION_BIND_HINT =
  'Чтобы получить инструкции, привяжите и подтвердите email или обратитесь в службу поддержки.';
export const PLAYER_VERIFICATION_INSTRUCTIONS =
  'По вашему аккаунту запрошена верификация. Следуйте указаниям в этом разделе. Не сообщайте пароль или коды подтверждения.';
export const PLAYER_VERIFICATION_SUPPORT_FALLBACK =
  'Свяжитесь со службой поддержки для прохождения верификации.';
export const PLAYER_VERIFICATION_SUPPORT_ACTION = 'Связаться с поддержкой';
export const PLAYER_VERIFICATION_BIND_ACTION = 'Привязать email';
export const PLAYER_VERIFICATION_EMAIL_SUBJECT = 'Nextpari — Verification request';
export const PLAYER_VERIFICATION_EMAIL_TEXT = [
  'NextPari',
  '',
  'По вашему аккаунту запрошена верификация.',
  'Инструкции доступны в вашем аккаунте Nextpari.',
  'Не сообщайте пароль или коды подтверждения.',
].join('\n');

export interface PlayerManualVerificationNotice {
  verificationRequested: boolean;
  verificationStatus: string | null;
  requestedAt: string | null;
  hasVerifiedEmail: boolean;
  bindEmailRequired: boolean;
  instructionsSent: boolean;
  supportEmail: string | null;
  supportConfigured: boolean;
  title: string | null;
  message: string | null;
  supportMessage: string | null;
}

export interface ManualVerificationDeliveryPorts {
  claimInstructionSend: (playerUserId: string) => Promise<{
    ok: boolean;
    alreadySent: boolean;
    email?: string;
  }>;
  markInstructionsSent: (playerUserId: string) => Promise<void>;
  releaseInstructionSend: (playerUserId: string) => Promise<void>;
  sendEmail: TransactionalEmailProvider['send'];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const SUPPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePlayerSupportEmail(supportEmail: string | null | undefined): string | null {
  const email = String(supportEmail ?? '').trim().toLowerCase();
  if (!email || !SUPPORT_EMAIL_RE.test(email)) return null;
  return email;
}

export function playerSupportMailto(supportEmail: string | null | undefined): string | null {
  const email = normalizePlayerSupportEmail(supportEmail);
  if (!email) return null;
  return `mailto:${email}?subject=${encodeURIComponent(PLAYER_VERIFICATION_EMAIL_SUBJECT)}`;
}

export function publicPlayerVerificationNotice(
  row: Record<string, unknown>,
  supportEmail: string | null = null,
): PlayerManualVerificationNotice {
  const requested = row.verification_requested === true || row.verificationRequested === true;
  const hasEmail = row.has_verified_email === true || row.hasVerifiedEmail === true;
  const status = requested ? String(row.verification_status ?? row.verificationStatus ?? 'VERIFICATION_REQUIRED') : null;
  const requestedAt = row.requested_at == null && row.requestedAt == null
    ? null
    : String(row.requested_at ?? row.requestedAt);
  const support = normalizePlayerSupportEmail(supportEmail);
  return {
    verificationRequested: requested,
    verificationStatus: status,
    requestedAt,
    hasVerifiedEmail: hasEmail,
    bindEmailRequired: requested && !hasEmail,
    instructionsSent: row.instructions_sent === true || row.instructionsSent === true,
    supportEmail: support,
    supportConfigured: Boolean(support),
    title: requested ? PLAYER_VERIFICATION_NOTICE_TITLE : null,
    message: requested
      ? (hasEmail ? PLAYER_VERIFICATION_INSTRUCTIONS : PLAYER_VERIFICATION_BIND_HINT)
      : null,
    supportMessage: requested && !support ? PLAYER_VERIFICATION_SUPPORT_FALLBACK : null,
  };
}

export async function deliverPendingManualVerificationInstructions(
  playerUserId: string,
  ports?: ManualVerificationDeliveryPorts,
): Promise<{ sent: boolean; alreadySent: boolean }> {
  const live = ports ?? liveManualVerificationDeliveryPorts();
  const claimed = await live.claimInstructionSend(playerUserId);
  if (!claimed.ok) {
    return { sent: false, alreadySent: claimed.alreadySent };
  }
  if (!claimed.email) {
    await live.releaseInstructionSend(playerUserId);
    return { sent: false, alreadySent: false };
  }
  try {
    await live.sendEmail({
      to: claimed.email,
      subject: PLAYER_VERIFICATION_EMAIL_SUBJECT,
      text: PLAYER_VERIFICATION_EMAIL_TEXT,
    });
    await live.markInstructionsSent(playerUserId);
    return { sent: true, alreadySent: false };
  } catch {
    await live.releaseInstructionSend(playerUserId);
    return { sent: false, alreadySent: false };
  }
}

export async function readPlayerManualVerificationNotice(
  accessToken: string,
): Promise<PlayerManualVerificationNotice> {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  const { data, error } = await client.rpc('player_manual_verification_notice');
  if (error) {
    throw staffError('SESSION_EXPIRED', 401);
  }
  return publicPlayerVerificationNotice(asRecord(data), loadPlayerSupportEmail());
}

export function liveManualVerificationDeliveryPorts(): ManualVerificationDeliveryPorts {
  const emailEnv = loadPlayerEmailProviderEnv();
  const staff = () => {
    const loaded = loadStaffOnboardingEnv();
    return createServiceRoleClient(loaded.supabaseUrl, loaded.supabaseServiceRoleKey);
  };
  return {
    async claimInstructionSend(playerUserId) {
      const client = staff();
      const { data, error } = await client.rpc('player_manual_verification_claim_instruction_send', {
        p_player_user_id: playerUserId,
      });
      if (error) return { ok: false, alreadySent: false };
      const row = asRecord(data);
      return {
        ok: row.ok === true,
        alreadySent: row.already_sent === true,
        email: row.email ? String(row.email) : undefined,
      };
    },
    async markInstructionsSent(playerUserId) {
      const client = staff();
      await client.rpc('player_manual_verification_mark_instructions_sent', {
        p_player_user_id: playerUserId,
      });
    },
    async releaseInstructionSend(playerUserId) {
      const client = staff();
      await client.rpc('player_manual_verification_release_instruction_send', {
        p_player_user_id: playerUserId,
      });
    },
    async sendEmail(message) {
      if (!emailEnv) throw staffError('EMAIL_PROVIDER_NOT_CONFIGURED', 503);
      await sendResendEmail(
        { resendApiKey: emailEnv.resendApiKey, fromAddress: emailEnv.fromAddress },
        message,
      );
    },
  };
}
