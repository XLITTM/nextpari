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

export interface PlayerVerificationNotice {
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

export function playerSupportMailto(supportEmail: string | null | undefined): string | null {
  const email = String(supportEmail ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(PLAYER_VERIFICATION_EMAIL_SUBJECT)}`;
}

export async function fetchPlayerVerificationNotice(): Promise<PlayerVerificationNotice | null> {
  const res = await fetch('/api/player/verification-notice', { credentials: 'same-origin' });
  if (res.status === 401 || res.status === 403) return null;
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || body.ok !== true) return null;
  const supportEmail = typeof body.supportEmail === 'string' && body.supportEmail.trim()
    ? body.supportEmail.trim()
    : null;
  const requested = body.verificationRequested === true;
  return {
    verificationRequested: requested,
    verificationStatus: requested ? String(body.verificationStatus ?? 'VERIFICATION_REQUIRED') : null,
    requestedAt: body.requestedAt == null ? null : String(body.requestedAt),
    hasVerifiedEmail: body.hasVerifiedEmail === true,
    bindEmailRequired: body.bindEmailRequired === true,
    instructionsSent: body.instructionsSent === true,
    supportEmail,
    supportConfigured: body.supportConfigured === true && Boolean(supportEmail),
    title: requested ? String(body.title ?? PLAYER_VERIFICATION_NOTICE_TITLE) : null,
    message: requested ? String(body.message ?? PLAYER_VERIFICATION_BIND_HINT) : null,
    supportMessage: typeof body.supportMessage === 'string' ? body.supportMessage : null,
  };
}
