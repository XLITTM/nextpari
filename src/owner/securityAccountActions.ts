export const OWNER_SECURITY_REVIEW_LABEL = 'Отметить просмотренным';
export const OWNER_SECURITY_ACCOUNT_LABEL = 'Аккаунт';
export const OWNER_SECURITY_DOSSIER_LABEL = 'Открыть досье безопасности';

export function ownerSecurityAccountStatusLabel(blocked: boolean): string {
  return blocked ? 'Заблокирован' : 'Активен';
}

export function ownerSecurityAccountToggle(blocked: boolean): {
  nextBlocked: boolean;
  buttonLabel: string;
  confirmLabel: string;
  successMessage: (playerPublicId: string) => string;
} {
  if (blocked) {
    return {
      nextBlocked: false,
      buttonLabel: 'Разблокировать аккаунт',
      confirmLabel: 'Подтвердите разблокировку',
      successMessage: (playerPublicId) => `Игрок #${playerPublicId} разблокирован`,
    };
  }
  return {
    nextBlocked: true,
    buttonLabel: 'Заблокировать аккаунт',
    confirmLabel: 'Подтвердите блокировку',
    successMessage: (playerPublicId) => `Игрок #${playerPublicId} заблокирован`,
  };
}

export function requireOwnerSecurityAccountReason(reason: string): string {
  const text = String(reason ?? '').trim();
  if (!text) throw new Error('REASON_REQUIRED');
  return text;
}
