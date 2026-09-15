function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name}_REQUIRED`);
  }
  return value;
}

export interface OwnerAuthEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface StaffOnboardingEnv extends OwnerAuthEnv {
  supabaseServiceRoleKey: string;
}

export function loadOwnerAuthEnv(): OwnerAuthEnv {
  if (readEnv('VITE_SUPABASE_SERVICE_ROLE_KEY')) {
    throw new Error('VITE_SUPABASE_SERVICE_ROLE_KEY_FORBIDDEN');
  }

  const supabaseUrl = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL_REQUIRED');
  }

  const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY_REQUIRED');
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function loadStaffOnboardingEnv(): StaffOnboardingEnv {
  const auth = loadOwnerAuthEnv();
  return {
    ...auth,
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export interface PlayerEmailProviderEnv {
  resendApiKey: string;
  fromAddress: string;
  otpPepper: string;
}

export function loadPlayerEmailProviderEnv(): PlayerEmailProviderEnv | null {
  if (readEnv('VITE_RESEND_API_KEY') || readEnv('VITE_PLAYER_EMAIL_OTP_PEPPER') || readEnv('VITE_PLAYER_EMAIL_FROM')) {
    throw new Error('VITE_PLAYER_EMAIL_SECRETS_FORBIDDEN');
  }
  const resendApiKey = readEnv('RESEND_API_KEY');
  const fromAddress = readEnv('PLAYER_EMAIL_FROM');
  const otpPepper = readEnv('PLAYER_EMAIL_OTP_PEPPER');
  if (!resendApiKey || !fromAddress || !otpPepper) {
    return null;
  }
  return { resendApiKey, fromAddress, otpPepper };
}

export const PLAYER_SECURITY_SIGNAL_PEPPER_MIN_LENGTH = 32;

export type PlayerSecuritySignalPepperState =
  | { ok: true; pepper: string }
  | { ok: false; reason: string };

export function loadPlayerSecuritySignalPepper(): PlayerSecuritySignalPepperState {
  if (readEnv('VITE_PLAYER_SECURITY_SIGNAL_PEPPER')) {
    return { ok: false, reason: 'PLAYER_SECURITY_SIGNAL_PEPPER_VITE_FORBIDDEN' };
  }
  const pepper = readEnv('PLAYER_SECURITY_SIGNAL_PEPPER');
  if (!pepper) {
    return { ok: false, reason: 'PLAYER_SECURITY_SIGNAL_PEPPER_MISSING' };
  }
  if (pepper.length < PLAYER_SECURITY_SIGNAL_PEPPER_MIN_LENGTH) {
    return { ok: false, reason: 'PLAYER_SECURITY_SIGNAL_PEPPER_WEAK' };
  }
  const otpPepper = readEnv('PLAYER_EMAIL_OTP_PEPPER');
  if (otpPepper && otpPepper === pepper) {
    return { ok: false, reason: 'PLAYER_SECURITY_SIGNAL_PEPPER_REUSES_OTP' };
  }
  return { ok: true, pepper };
}

const SUPPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function loadPlayerSupportEmail(): string | null {
  if (readEnv('VITE_PLAYER_SUPPORT_EMAIL')) {
    throw new Error('VITE_PLAYER_SUPPORT_EMAIL_FORBIDDEN');
  }
  const value = readEnv('PLAYER_SUPPORT_EMAIL');
  if (!value) return null;
  const email = value.toLowerCase();
  if (!SUPPORT_EMAIL_RE.test(email)) return null;
  return email;
}
