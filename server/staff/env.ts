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
