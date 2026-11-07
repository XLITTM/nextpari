export type RecoveryCallback =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ready'; accessToken: string; refreshToken: string };

const RECOVERY_FAILURE_CODES = new Set([
  'RECOVERY_LINK_INVALID',
  'OWNER_UNKNOWN',
  'OWNER_DISABLED',
  'GROUP_DATABASE_SSL',
  'GROUP_DATABASE_AUTH',
  'GROUP_DATABASE_FORBIDDEN',
  'GROUP_DATABASE_UNAVAILABLE',
  'GROUP_SCHEMA_UNAVAILABLE',
  'GROUP_COLUMN_MISMATCH',
  'GROUP_RLS_HIDES_OWNER',
  'GROUP_SCHEMA_NOT_EXPOSED',
  'PASSWORD_MISMATCH',
  'PASSWORD_REJECTED',
]);

export type RecoveryFailureView = {
  mode: 'invalid' | 'unavailable' | 'form';
  title: string;
  message: string;
  code: string | null;
};

export function recoveryFailureView(error: unknown): RecoveryFailureView {
  const code = typeof error === 'string' && RECOVERY_FAILURE_CODES.has(error) ? error : '';
  if (code === 'PASSWORD_MISMATCH' || code === 'PASSWORD_REJECTED') {
    return {
      mode: 'form',
      title: '',
      message: 'Пароль не принят. Ссылка не отклонена.',
      code,
    };
  }
  if (code === 'OWNER_UNKNOWN' || code === 'OWNER_DISABLED') {
    return {
      mode: 'unavailable',
      title: 'Восстановление недоступно',
      message: 'Эта учётная запись не является активным владельцем группы.',
      code,
    };
  }
  if (code && code !== 'RECOVERY_LINK_INVALID') {
    return {
      mode: 'unavailable',
      title: 'Проверка владельца недоступна',
      message: 'Ссылка не отклонена. Сервер не смог прочитать запись владельца.',
      code,
    };
  }
  return {
    mode: 'invalid',
    title: 'Ссылка недействительна',
    message: 'Ссылка недействительна или устарела. Запросите новое письмо.',
    code: null,
  };
}

export function readRecoveryCallback(hash: string): RecoveryCallback {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { kind: 'none' };
  const params = new URLSearchParams(raw);
  const type = params.get('type');
  const accessToken = params.get('access_token') ?? '';
  const refreshToken = params.get('refresh_token') ?? '';
  const looksLikeAuth = params.has('access_token')
    || params.has('error')
    || params.has('error_code')
    || params.has('error_description')
    || type === 'recovery';
  if (!looksLikeAuth) return { kind: 'none' };
  const failed = params.has('error') || params.has('error_code') || params.has('error_description');
  if (failed || type !== 'recovery' || !accessToken || !refreshToken) return { kind: 'invalid' };
  return { kind: 'ready', accessToken, refreshToken };
}
