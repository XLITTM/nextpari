import { createClient } from '@supabase/supabase-js';
import { OWNER_AUTH_STORAGE_KEY } from './ownerAuth';

function readEnv(name: string): string {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
  if (vite) return vite;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name] ?? '';
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export { OWNER_AUTH_STORAGE_KEY };

/** Isolated from the player client. Browser uses the public anon key only. */
export const ownerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: OWNER_AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export async function getOwnerAccessToken(): Promise<string | null> {
  const { data } = await ownerSupabase.auth.getSession();
  const token = data.session?.access_token?.trim() ?? '';
  return token || null;
}
