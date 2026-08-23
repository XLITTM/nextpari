import { createClient } from '@supabase/supabase-js';

function readEnv(name: string): string {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
  if (vite) return vite;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name] ?? '';
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
