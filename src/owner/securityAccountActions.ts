export const OWNER_SECURITY_REVIEW_LABEL = 'Отметить просмотренным';
export const OWNER_SECURITY_ACCOUNT_LABEL = 'Аккаунт';
export const OWNER_SECURITY_DOSSIER_LABEL = 'Открыть досье безопасности';

export const OWNER_SECURITY_RESTRICTION_POLICY = [
  { label: 'Спорт', value: 'Разрешён' },
  { label: 'Мини-игры Nextpari', value: 'Разрешены' },
  { label: 'Казино/слоты', value: 'Запрещены' },
  { label: 'Live Casino', value: 'Запрещено' },
  { label: 'Пополнение', value: 'Запрещено' },
  { label: 'Вывод', value: 'Запрещён' },
] as const;

export function ownerSecurityAccountStatusLabel(restricted: boolean): string {
  return restricted ? 'Ограничен службой безопасности' : 'Активен';
}

export function ownerSecurityRestrictionToggle(restricted: boolean): {
  nextRestricted: boolean;
  buttonLabel: string;
  confirmLabel: string;
  successMessage: (playerPublicId: string) => string;
} {
  if (restricted) {
    return {
      nextRestricted: false,
      buttonLabel: 'Снять ограничения',
      confirmLabel: 'Подтвердите снятие ограничений',
      successMessage: (playerPublicId) => `Ограничения игрока #${playerPublicId} сняты`,
    };
  }
  return {
    nextRestricted: true,
    buttonLabel: 'Ограничить аккаунт',
    confirmLabel: 'Подтвердите ограничение аккаунта',
    successMessage: (playerPublicId) => `Игрок #${playerPublicId} ограничен службой безопасности`,
  };
}

export function requireOwnerSecurityAccountReason(reason: string): string {
  const text = String(reason ?? '').trim();
  if (!text) throw new Error('REASON_REQUIRED');
  return text;
}
