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
    return { balance: 0, publicId: null, available: false, error: null };
  }
  return {
    balance: snapshot.wallet.balance,
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
  const value = email.trim();
  if (!value) return 'invalid email';
  if (!EMAIL_RE.test(value)) return 'invalid email';
  return null;
}

export function validatePlayerPassword(password: string): string | null {
  if (password.length < 8) return 'password too short';
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
  return {
    authenticated: true,
    player: {
      publicId: String(player.publicId ?? '').replace(/\D/g, ''),
      email: String(player.email ?? ''),
    },
    wallet: {
      balance,
      currency: String(wallet.currency ?? 'TMTM') || 'TMTM',
      status: String(wallet.status ?? 'active') || 'active',
      migrationState: wallet.migrationState == null ? null : String(wallet.migrationState),
    },
    profile: profileFromBody(profile, String(player.email ?? '')),
  };
}

function profileFromBody(profile: Record<string, unknown>, fallbackEmail = ''): PlayerProfileSnapshot {
  return {
    firstName: String(profile.firstName ?? profile.first_name ?? ''),
    lastName: String(profile.lastName ?? profile.last_name ?? ''),
    middleName: String(profile.middleName ?? profile.middle_name ?? ''),
    birthDate: String(profile.birthDate ?? profile.birth_date ?? ''),
    passport: String(profile.passport ?? ''),
    phone: String(profile.phone ?? ''),
    email: String(profile.email ?? fallbackEmail),
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

export async function signInPlayer(email: string, password: string) {
  const emailError = validatePlayerEmail(email);
  if (emailError) throw new Error(emailError);
  const passwordError = validatePlayerPassword(password);
  if (passwordError) throw new Error(passwordError);

  const res = await fetch('/api/player/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(mapPlayerAuthError({ code: String(body.error ?? ''), message: String(body.error ?? '') }));
  }
  const snapshot = snapshotFromBody(body);
  if (!snapshot) throw new Error('invalid credentials');
  return { user: { email: snapshot.player.email, publicId: snapshot.player.publicId } };
}

export async function signUpPlayer(input: { email: string; password: string; phone: string }) {
  const emailError = validatePlayerEmail(input.email);
  if (emailError) throw new Error(emailError);
  const passwordError = validatePlayerPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  const phoneError = validatePlayerPhone(input.phone);
  if (phoneError) throw new Error(phoneError);

  const res = await fetch('/api/player/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      phone: input.phone.replace(/[\s()-]/g, ''),
    }),
  });
  const body = await readJson(res);
  if (res.status === 409 && String(body.error ?? '') === 'EMAIL_CONFIRMATION_REQUIRED') {
    return {
      session: null,
      user: null,
      needsEmailConfirmation: true,
    };
  }
  if (!res.ok) {
    throw new Error(mapPlayerAuthError({ code: String(body.error ?? ''), message: String(body.error ?? '') }));
  }
  const snapshot = snapshotFromBody(body);
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

export async function getPlayerSession() {
  return fetchPlayerMe();
}
