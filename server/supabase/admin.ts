import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (!url.trim()) {
    throw new Error('SUPABASE_URL_REQUIRED');
  }
  if (!serviceRoleKey.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_REQUIRED');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Sports worker alias. Same service-role factory; do not duplicate secrets. */
export function createSportsAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createServiceRoleClient(url, serviceRoleKey);
}

export function createUserJwtClient(
  url: string,
  anonKey: string,
  accessToken: string,
): SupabaseClient {
  if (!url.trim()) {
    throw new Error('SUPABASE_URL_REQUIRED');
  }
  if (!anonKey.trim()) {
    throw new Error('SUPABASE_ANON_KEY_REQUIRED');
  }
  if (!accessToken.trim()) {
    throw new Error('JWT_REQUIRED');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
