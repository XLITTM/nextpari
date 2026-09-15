import { displayPlayerCurrency, normalizeRegistrationCurrency } from './playerCurrency';

export const AUTH_KEY = 'nextpari-auth';
export const PLAYER_PROFILE_KEY = 'nextpari-player-profile';
export const PLAYER_BALANCE_KEY = 'player_balance';
export const USER_STORE_KEY = 'user-store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;

export interface PlayerWalletSnapshot {
  balance: number;
  currency: string;
  status: string;
  migrationState: string | null;
}

export interface PlayerProfileSnapshot {
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

export interface PlayerMeSnapshot {
  authenticated: true;
  player: { publicId: string; email: string };
  wallet: PlayerWalletSnapshot;
  profile: PlayerProfileSnapshot;
}

export interface WalletViewState {
  balance: number;
  currency: string;
  publicId: string | null;
  available: boolean;
  error: string | null;
}

export const EMPTY_PLAYER_PROFILE: PlayerProfileSnapshot = {
  firstName: '',
  lastName: '',
  middleName: '',
  birthDate: '',
  passport: '',
  phone: '',
  email: '',
  phoneVerified: false,
  emailVerified: false,
};

export function playerDisplayName(profile: { firstName?: string; lastName?: string; first_name?: string; last_name?: string }): string {
  const first = String(profile.firstName ?? profile.first_name ?? '').trim();
  const last = String(profile.lastName ?? profile.last_name ?? '').trim();
  if (first && last) return `${first} ${last}`;
  return 'Новый игрок';
}

export function walletViewFromSnapshot(snapshot: PlayerMeSnapshot | null): WalletViewState {
  if (!snapshot?.authenticated) {
    return { balance: 0, currency: 'TMT', publicId: null, available: false, error: null };
  }
  return {
    balance: snapshot.wallet.balance,
    currency: displayPlayerCurrency(snapshot.wallet.currency),
    publicId: snapshot.player.publicId,
    available: true,
    error: null,
  };
}

export function isPlayerProfileComplete(profile: PlayerProfileSnapshot): boolean {
  return Boolean(
    profile.firstName.trim()
    && profile.lastName.trim()
    && profile.middleName.trim()
    && profile.birthDate.trim()
    && profile.phone.trim()
    && profile.email.trim()
    && profile.passport.trim(),
  );
}

export interface PlayerAuthUser {
  email: string;
  publicId?: string;
}

export function validatePlayerEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return 'invalid email';
  if (value.length > 254) return 'invalid email';
  if (!EMAIL_RE.test(value)) return 'invalid email';
  return null;
}

export const PLAYER_PASSWORD_MIN_LENGTH = 8;
export const PLAYER_PASSWORD_POLICY_MESSAGE = 'Пароль должен содержать не менее 8 символов';
export const PLAYER_PASSWORD_CHANGED_NOTICE = 'Пароль успешно изменён. Войдите с новым паролем.';
export const PLAYER_PASSWORD_RECOVERY_START_MESSAGE =
  'Если аккаунт с подтверждённой почтой существует, код отправлен.';
export const PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE = 'Пароль изменён. Войдите с новым паролем.';
export const PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE = 'Неверный или истёкший код.';
export const PLAYER_PASSWORD_RESET_SESSION_REVOCATION_FAILED_MESSAGE =
  'Пароль обновлён, но не удалось завершить выход на других устройствах. Войдите с новым паролем.';

export function validatePlayerPassword(password: string): string | null {
  if (password.length < PLAYER_PASSWORD_MIN_LENGTH) return 'password too short';
  return null;
}

export function validatePlayerPhone(phone: string): string | null {
  const compact = phone.replace(/[\s()-]/g, '');
  if (!PHONE_RE.test(compact)) return 'invalid phone';
  return null;
}

export function mapPlayerAuthError(error: { message?: string; code?: string } | null | undefined): string {
  const text = String(error?.message ?? error?.code ?? '').toLowerCase();
  if (/invalid_email/.test(text)) return 'invalid email';
  if (/invalid_password|password too short/.test(text)) return 'password too short';
  if (/invalid_phone/.test(text)) return 'invalid phone';
  if (/email_confirmation_required|email not confirmed|email_not_confirmed/.test(text)) {
    return 'email confirmation required';
  }
  if (/age required|age_required/.test(text)) return 'age required';
  if (/currency required|registration_currency_required|currency_unsupported/.test(text)) return 'currency required';
  if (/registration_failed/.test(text)) return 'registration failed';
  if (/auth_rate_limited/.test(text)) return 'too many attempts';
  if (/invalid login credentials|invalid_credentials|invalid email or password|auth_failed/.test(text)) {
    return 'invalid credentials';
  }
  if (/password/.test(text) && /short|least|characters|6|8/.test(text)) {
    return 'password too short';
  }
  if (/invalid.*email|unable to validate email|email_address_invalid/.test(text)) {
    return 'invalid email';
  }
  if (error?.message) return error.message;
  return 'invalid credentials';
}

export function clearDemoPlayerState() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PLAYER_PROFILE_KEY);
    localStorage.removeItem(PLAYER_BALANCE_KEY);
    localStorage.removeItem(USER_STORE_KEY);
  } catch {
    /* ignore */
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function snapshotFromBody(body: Record<string, unknown>): PlayerMeSnapshot | null {
  const player = body.player && typeof body.player === 'object' && !Array.isArray(body.player)
    ? body.player as Record<string, unknown>
    : null;
  const wallet = body.wallet && typeof body.wallet === 'object' && !Array.isArray(body.wallet)
    ? body.wallet as Record<string, unknown>
    : null;
  if (body.authenticated !== true || !player || !wallet) return null;
  const balance = Number(wallet.balance);
  if (!Number.isFinite(balance)) return null;
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)
    ? body.profile as Record<string, unknown>
    : {};
  const email = sanitizePublicEmail(String(player.email ?? ''));
  return {
    authenticated: true,
    player: {
      publicId: parsePublicPlayerId(String(player.publicId ?? '')),
      email,
    },
    wallet: {
      balance,
      currency: displayPlayerCurrency(String(wallet.currency ?? 'TMT')),
      status: String(wallet.status ?? 'active') || 'active',
      migrationState: wallet.migrationState == null ? null : String(wallet.migrationState),
    },
    profile: profileFromBody(profile, email),
  };
}

function parsePublicPlayerId(value: string): string {
  const trimmed = value.trim();
  return /^[0-9]{6}$/.test(trimmed) ? trimmed : '';
}

function sanitizePublicEmail(email: string): string {
  const value = email.trim();
  const domain = value.split('@')[1] ?? '';
  if (!value || /\.invalid$/i.test(domain)) return '';
  return value;
}

function profileFromBody(profile: Record<string, unknown>, fallbackEmail = ''): PlayerProfileSnapshot {
  return {
    firstName: String(profile.firstName ?? profile.first_name ?? ''),
    lastName: String(profile.lastName ?? profile.last_name ?? ''),
    middleName: String(profile.middleName ?? profile.middle_name ?? ''),
    birthDate: String(profile.birthDate ?? profile.birth_date ?? ''),
    passport: String(profile.passport ?? ''),
    phone: String(profile.phone ?? ''),
    email: sanitizePublicEmail(String(profile.email ?? fallbackEmail)),
    phoneVerified: profile.phoneVerified === true || profile.phone_verified === true,
    emailVerified: profile.emailVerified === true || profile.email_verified === true,
  };
}

export function personalDataFromProfile(profile: PlayerProfileSnapshot) {
  return {
    first_name: profile.firstName,
    last_name: profile.lastName,
    middle_name: profile.middleName,
    birth_date: profile.birthDate,
    phone: profile.phone,
    phone_verified: profile.phoneVerified,
    email: profile.email,
    email_verified: profile.emailVerified,
    passport: profile.passport,
  };
}

export async function fetchPlayerProfile(): Promise<PlayerProfileSnapshot | null> {
  const res = await fetch('/api/player/profile', { credentials: 'same-origin' });
  if (res.status === 401 || res.status === 403) return null;
  const body = await readJson(res);
  if (!res.ok) return null;
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)
    ? body.profile as Record<string, unknown>
    : null;
  if (!profile) return null;
  return profileFromBody(profile, String((body.player as { email?: string } | undefined)?.email ?? ''));
}

export async function savePlayerProfile(input: {
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  passport: string;
}): Promise<PlayerProfileSnapshot> {
  const res = await fetch('/api/player/profile', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      birthDate: input.birthDate,
      passport: input.passport,
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(String(body.error ?? 'PROFILE_UNAVAILABLE'));
  }
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)
    ? body.profile as Record<string, unknown>
    : null;
  if (!profile) throw new Error('PROFILE_UNAVAILABLE');
  return profileFromBody(profile);
}

export async function fetchPlayerMe(): Promise<PlayerMeSnapshot | null> {
  const res = await fetch('/api/player/me', { credentials: 'same-origin' });
  if (res.status === 401 || res.status === 403) return null;
  const body = await readJson(res);
  if (!res.ok) return null;
  return snapshotFromBody(body);
}

export type SignInPlayerInput =
  | { mode: 'identifier'; identifier: string; password: string }
  | { mode: 'phone'; phone: string; password: string };

export async function signInPlayer(
  emailOrInput: string | SignInPlayerInput,
  passwordArg?: string,
) {
  let body: Record<string, string>;
  if (typeof emailOrInput === 'string') {
    const password = passwordArg ?? '';
    const passwordError = validatePlayerPassword(password);
    if (passwordError) throw new Error(passwordError);
    if (!validatePlayerEmail(emailOrInput)) {
      body = { email: emailOrInput.trim(), password };
    } else {
      throw new Error('invalid credentials');
    }
  } else if (emailOrInput.mode === 'phone') {
    const phoneError = validatePlayerPhone(emailOrInput.phone);
    if (phoneError) throw new Error(phoneError);
    const passwordError = validatePlayerPassword(emailOrInput.password);
    if (passwordError) throw new Error(passwordError);
    body = {
      mode: 'phone',
      phone: emailOrInput.phone.replace(/[\s()-]/g, ''),
      password: emailOrInput.password,
    };
  } else {
    const identifier = emailOrInput.identifier.trim();
    const passwordError = validatePlayerPassword(emailOrInput.password);
    if (passwordError) throw new Error(passwordError);
    if (!identifier) throw new Error('invalid credentials');
    body = {
      mode: 'identifier',
      identifier,
      password: emailOrInput.password,
    };
  }

  const res = await fetch('/api/player/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(mapPlayerAuthError({ code: String(payload.error ?? ''), message: String(payload.error ?? '') }));
  }
  const snapshot = snapshotFromBody(payload);
  if (!snapshot) throw new Error('invalid credentials');
  return { user: { email: snapshot.player.email, publicId: snapshot.player.publicId } };
}

export async function signUpPlayer(input: {
  email: string;
  password: string;
  ageConfirmed: boolean;
  currency: string;
}) {
  const emailError = validatePlayerEmail(input.email);
  if (emailError) throw new Error(emailError);
  const passwordError = validatePlayerPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  if (input.ageConfirmed !== true) throw new Error('age required');
  const currency = normalizeRegistrationCurrency(input.currency);
  if (!currency) throw new Error('currency required');

  const res = await fetch('/api/player/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'email',
      email: input.email.trim(),
      password: input.password,
      ageConfirmed: true,
      currency,
    }),
  });
  return readRegisterResult(res);
}

export async function signUpPlayerByPhone(input: {
  phone: string;
  password: string;
  ageConfirmed: boolean;
  currency: string;
}) {
  const phoneError = validatePlayerPhone(input.phone);
  if (phoneError) throw new Error(phoneError);
  const passwordError = validatePlayerPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  if (input.ageConfirmed !== true) throw new Error('age required');
  const currency = normalizeRegistrationCurrency(input.currency);
  if (!currency) throw new Error('currency required');

  const res = await fetch('/api/player/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'phone',
      phone: input.phone.replace(/[\s()-]/g, ''),
      password: input.password,
      ageConfirmed: true,
      currency,
    }),
  });
  return readRegisterResult(res);
}

export async function signUpPlayerOneClick(input: { ageConfirmed: boolean; currency: string }) {
  if (input.ageConfirmed !== true) throw new Error('age required');
  const currency = normalizeRegistrationCurrency(input.currency);
  if (!currency) throw new Error('currency required');
  const res = await fetch('/api/player/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'one_click',
      ageConfirmed: true,
      currency,
    }),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(mapPlayerAuthError({ code: String(payload.error ?? ''), message: String(payload.error ?? '') }));
  }
  const snapshot = snapshotFromBody(payload);
  const oneClick = payload.oneClick && typeof payload.oneClick === 'object' && !Array.isArray(payload.oneClick)
    ? payload.oneClick as Record<string, unknown>
    : {};
  const player = payload.player && typeof payload.player === 'object' && !Array.isArray(payload.player)
    ? payload.player as Record<string, unknown>
    : {};
  const playerId = parsePublicPlayerId(String(oneClick.playerId ?? player.publicId ?? ''));
  const generatedPassword = String(oneClick.password ?? '');
  if (!playerId || generatedPassword.length < 8) {
    throw new Error('invalid credentials');
  }
  return {
    snapshot,
    playerId,
    generatedPassword,
    authenticated: snapshot?.authenticated === true,
  };
}

async function readRegisterResult(res: Response) {
  const payload = await readJson(res);
  if (res.status === 409 && String(payload.error ?? '') === 'EMAIL_CONFIRMATION_REQUIRED') {
    return {
      session: null,
      user: null,
      needsEmailConfirmation: true,
    };
  }
  if (!res.ok) {
    throw new Error(mapPlayerAuthError({ code: String(payload.error ?? ''), message: String(payload.error ?? '') }));
  }
  const snapshot = snapshotFromBody(payload);
  if (!snapshot) {
    return { session: null, user: null, needsEmailConfirmation: true };
  }
  const user: PlayerAuthUser = { email: snapshot.player.email, publicId: snapshot.player.publicId };
  return {
    session: { user },
    user,
    needsEmailConfirmation: false,
  };
}

export async function signOutPlayer() {
  try {
    await fetch('/api/player/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } finally {
    clearDemoPlayerState();
  }
}

export class PlayerChangePasswordError extends Error {
  readonly code: string;
  readonly sessionExpired: boolean;

  constructor(code: string, message: string, sessionExpired = false) {
    super(message);
    this.name = 'PlayerChangePasswordError';
    this.code = code;
    this.sessionExpired = sessionExpired;
  }
}

export function mapChangePasswordError(code: string): string {
  switch (code) {
    case 'CURRENT_PASSWORD_INVALID':
      return 'Текущий пароль указан неверно';
    case 'PASSWORD_CONFIRMATION_MISMATCH':
      return 'Пароли не совпадают';
    case 'PASSWORD_SAME_AS_CURRENT':
      return 'Новый пароль должен отличаться от текущего';
    case 'PASSWORD_POLICY_INVALID':
    case 'INVALID_PASSWORD':
      return PLAYER_PASSWORD_POLICY_MESSAGE;
    default:
      return 'Не удалось изменить пароль. Попробуйте ещё раз.';
  }
}

function isSessionExpiredCode(code: string): boolean {
  return (
    code === 'SESSION_REQUIRED'
    || code === 'SESSION_EXPIRED'
    || code === 'JWT_REQUIRED'
    || code === 'JWT_INVALID'
    || code === 'AUTH_REQUIRED'
  );
}

export function validatePlayerPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!input.currentPassword) {
    return {
      ok: false,
      code: 'CURRENT_PASSWORD_INVALID',
      message: mapChangePasswordError('CURRENT_PASSWORD_INVALID'),
    };
  }
  if (!input.newPassword) {
    return {
      ok: false,
      code: 'PASSWORD_POLICY_INVALID',
      message: mapChangePasswordError('PASSWORD_POLICY_INVALID'),
    };
  }
  if (input.newPassword !== input.confirmPassword) {
    return {
      ok: false,
      code: 'PASSWORD_CONFIRMATION_MISMATCH',
      message: mapChangePasswordError('PASSWORD_CONFIRMATION_MISMATCH'),
    };
  }
  if (input.newPassword === input.currentPassword) {
    return {
      ok: false,
      code: 'PASSWORD_SAME_AS_CURRENT',
      message: mapChangePasswordError('PASSWORD_SAME_AS_CURRENT'),
    };
  }
  if (validatePlayerPassword(input.newPassword)) {
    return {
      ok: false,
      code: 'PASSWORD_POLICY_INVALID',
      message: mapChangePasswordError('PASSWORD_POLICY_INVALID'),
    };
  }
  return { ok: true };
}

export async function changePlayerPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true }> {
  const local = validatePlayerPasswordChange(input);
  if (!local.ok) {
    throw new PlayerChangePasswordError(local.code, local.message);
  }

  const res = await fetch('/api/player/auth/change-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    }),
  });
  const payload = await readJson(res);
  const code = String(payload.error ?? (!res.ok ? 'PASSWORD_CHANGE_FAILED' : ''));
  if (!res.ok) {
    if (isSessionExpiredCode(code)) {
      throw new PlayerChangePasswordError(code || 'SESSION_EXPIRED', mapChangePasswordError(code), true);
    }
    throw new PlayerChangePasswordError(code, mapChangePasswordError(code));
  }
  if (payload.ok !== true) {
    throw new PlayerChangePasswordError('PASSWORD_CHANGE_FAILED', mapChangePasswordError('PASSWORD_CHANGE_FAILED'));
  }
  return { ok: true };
}

export class PlayerEmailBindError extends Error {
  readonly code: string;
  readonly sessionExpired: boolean;

  constructor(code: string, message: string, sessionExpired = false) {
    super(message);
    this.name = 'PlayerEmailBindError';
    this.code = code;
    this.sessionExpired = sessionExpired;
  }
}

export function mapPlayerEmailBindError(code: string): string {
  switch (code) {
    case 'INVALID_EMAIL':
      return 'Неверный email';
    case 'EMAIL_UNAVAILABLE':
      return 'Не удалось привязать этот адрес. Попробуйте другой.';
    case 'EMAIL_RESEND_COOLDOWN':
      return 'Подождите минуту перед повторной отправкой кода';
    case 'EMAIL_SEND_RATE_LIMITED':
      return 'Слишком много попыток. Попробуйте позже.';
    case 'EMAIL_PROVIDER_NOT_CONFIGURED':
    case 'EMAIL_DELIVERY_FAILED':
      return 'Не удалось отправить код. Попробуйте ещё раз.';
    case 'INVALID_CODE':
    case 'EMAIL_CODE_INVALID':
      return 'Неверный код подтверждения';
    case 'EMAIL_CODE_EXPIRED':
      return 'Срок действия кода истёк';
    case 'EMAIL_CODE_LOCKED':
      return 'Слишком много неверных попыток. Запросите новый код.';
    case 'EMAIL_CODE_CONSUMED':
    case 'EMAIL_CHALLENGE_NOT_FOUND':
      return 'Запросите новый код подтверждения';
    default:
      return 'Не удалось подтвердить почту. Попробуйте ещё раз.';
  }
}

export async function startPlayerEmailBinding(email: string): Promise<{
  ok: true;
  maskedEmail: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}> {
  const emailError = validatePlayerEmail(email);
  if (emailError) {
    throw new PlayerEmailBindError('INVALID_EMAIL', mapPlayerEmailBindError('INVALID_EMAIL'));
  }
  const res = await fetch('/api/player/email/start', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const payload = await readJson(res);
  const code = String(payload.error ?? (!res.ok ? 'EMAIL_DELIVERY_FAILED' : ''));
  if (!res.ok) {
    if (code === 'SESSION_REQUIRED' || code === 'SESSION_EXPIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
      throw new PlayerEmailBindError(code, mapPlayerEmailBindError(code), true);
    }
    throw new PlayerEmailBindError(code, mapPlayerEmailBindError(code));
  }
  return {
    ok: true,
    maskedEmail: String(payload.maskedEmail ?? ''),
    expiresInSeconds: Number(payload.expiresInSeconds ?? 600),
    resendAfterSeconds: Number(payload.resendAfterSeconds ?? 60),
  };
}

export async function verifyPlayerEmailBinding(code: string): Promise<{ ok: true; email: string }> {
  const trimmed = String(code ?? '');
  if (!/^[0-9]{6}$/.test(trimmed)) {
    throw new PlayerEmailBindError('INVALID_CODE', mapPlayerEmailBindError('INVALID_CODE'));
  }
  const res = await fetch('/api/player/email/verify', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: trimmed }),
  });
  const payload = await readJson(res);
  const err = String(payload.error ?? (!res.ok ? 'EMAIL_UPDATE_FAILED' : ''));
  if (!res.ok) {
    if (err === 'SESSION_REQUIRED' || err === 'SESSION_EXPIRED' || err === 'JWT_REQUIRED' || err === 'JWT_INVALID') {
      throw new PlayerEmailBindError(err, mapPlayerEmailBindError(err), true);
    }
    throw new PlayerEmailBindError(err, mapPlayerEmailBindError(err));
  }
  return { ok: true, email: String(payload.email ?? '') };
}

export class PlayerPasswordRecoveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlayerPasswordRecoveryError';
    this.code = code;
  }
}

export function mapPlayerPasswordRecoveryError(code: string): string {
  switch (code) {
    case 'RECOVERY_CODE_INVALID':
    case 'INVALID_CODE':
      return PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE;
    case 'PASSWORD_CONFIRMATION_MISMATCH':
      return mapChangePasswordError('PASSWORD_CONFIRMATION_MISMATCH');
    case 'PASSWORD_POLICY_INVALID':
    case 'INVALID_PASSWORD':
      return PLAYER_PASSWORD_POLICY_MESSAGE;
    case 'RESET_TICKET_INVALID':
      return 'Срок действия кода истёк. Запросите восстановление заново.';
    case 'PASSWORD_RESET_SESSION_REVOCATION_FAILED':
      return PLAYER_PASSWORD_RESET_SESSION_REVOCATION_FAILED_MESSAGE;
    default:
      return 'Не удалось изменить пароль. Попробуйте ещё раз.';
  }
}

export function validatePlayerPasswordReset(input: {
  newPassword: string;
  confirmPassword: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.newPassword !== input.confirmPassword) {
    return {
      ok: false,
      code: 'PASSWORD_CONFIRMATION_MISMATCH',
      message: mapPlayerPasswordRecoveryError('PASSWORD_CONFIRMATION_MISMATCH'),
    };
  }
  if (validatePlayerPassword(input.newPassword)) {
    return {
      ok: false,
      code: 'PASSWORD_POLICY_INVALID',
      message: mapPlayerPasswordRecoveryError('PASSWORD_POLICY_INVALID'),
    };
  }
  return { ok: true };
}

export async function startPlayerPasswordRecovery(identifier: string): Promise<{
  ok: true;
  message: string;
  challengeId: string;
  resendAfterSeconds: number;
}> {
  const res = await fetch('/api/player/password-recovery/start', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: identifier.trim() }),
  });
  const payload = await readJson(res);
  if (!res.ok || payload.ok !== true) {
    throw new PlayerPasswordRecoveryError('RECOVERY_START_FAILED', PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
  }
  return {
    ok: true,
    message: String(payload.message ?? PLAYER_PASSWORD_RECOVERY_START_MESSAGE),
    challengeId: String(payload.challengeId ?? ''),
    resendAfterSeconds: Number(payload.resendAfterSeconds ?? 60),
  };
}

export async function verifyPlayerPasswordRecovery(input: {
  challengeId: string;
  code: string;
}): Promise<{ ok: true; resetTicket: string }> {
  const code = String(input.code ?? '');
  if (!/^[0-9]{6}$/.test(code) || !input.challengeId) {
    throw new PlayerPasswordRecoveryError('RECOVERY_CODE_INVALID', PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE);
  }
  const res = await fetch('/api/player/password-recovery/verify', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: input.challengeId, code }),
  });
  const payload = await readJson(res);
  if (!res.ok || payload.ok !== true || !payload.resetTicket) {
    throw new PlayerPasswordRecoveryError(
      String(payload.error ?? 'RECOVERY_CODE_INVALID'),
      PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE,
    );
  }
  return { ok: true, resetTicket: String(payload.resetTicket) };
}

export async function resetPlayerPasswordWithTicket(input: {
  resetTicket: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string }> {
  const local = validatePlayerPasswordReset(input);
  if (!local.ok) {
    throw new PlayerPasswordRecoveryError(local.code, local.message);
  }
  const res = await fetch('/api/player/password-recovery/reset', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resetTicket: input.resetTicket,
      newPassword: input.newPassword,
      confirmPassword: input.confirmPassword,
    }),
  });
  const payload = await readJson(res);
  if (!res.ok || payload.ok !== true) {
    const code = String(payload.error ?? 'PASSWORD_RESET_FAILED');
    throw new PlayerPasswordRecoveryError(code, mapPlayerPasswordRecoveryError(code));
  }
  return {
    ok: true,
    message: String(payload.message ?? PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE),
  };
}

export async function getPlayerSession() {
  return fetchPlayerMe();
}
