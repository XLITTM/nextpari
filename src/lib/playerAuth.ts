import { supabase } from './supabase';

export const AUTH_KEY = 'nextpari-auth';
export const PLAYER_PROFILE_KEY = 'nextpari-player-profile';
export const PLAYER_BALANCE_KEY = 'player_balance';
export const USER_STORE_KEY = 'user-store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;

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
  if (/invalid login credentials|invalid_credentials|invalid email or password/.test(text)) {
    return 'invalid credentials';
  }
  if (/email not confirmed|email_not_confirmed/.test(text)) {
    return 'email confirmation required';
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

export async function signInPlayer(email: string, password: string) {
  const emailError = validatePlayerEmail(email);
  if (emailError) throw new Error(emailError);
  const passwordError = validatePlayerPassword(password);
  if (passwordError) throw new Error(passwordError);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(mapPlayerAuthError(error));
  if (!data.session?.user) throw new Error('invalid credentials');
  return data.session;
}

export async function signUpPlayer(input: { email: string; password: string; phone: string }) {
  const emailError = validatePlayerEmail(input.email);
  if (emailError) throw new Error(emailError);
  const passwordError = validatePlayerPassword(input.password);
  if (passwordError) throw new Error(passwordError);
  const phoneError = validatePlayerPhone(input.phone);
  if (phoneError) throw new Error(phoneError);

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { phone: input.phone.replace(/[\s()-]/g, '') },
    },
  });
  if (error) throw new Error(mapPlayerAuthError(error));
  return {
    session: data.session,
    user: data.user,
    needsEmailConfirmation: !data.session,
  };
}

export async function signOutPlayer() {
  await supabase.auth.signOut();
  clearDemoPlayerState();
}

export async function getPlayerSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user ? data.session : null;
}
