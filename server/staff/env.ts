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

export interface StaffOnboardingEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

export function loadStaffOnboardingEnv(): StaffOnboardingEnv {
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

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
