export type RecoveryCallback =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ready'; accessToken: string; refreshToken: string };

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
