export const OFFICE_DATABASE_URL = 'RYXOBET_OFFICE_DATABASE_URL';
export const OFFICE_SESSION_PEPPER = 'RYXOBET_OFFICE_SESSION_PEPPER';

const FRONTEND_DATABASE_URL = `VITE_${OFFICE_DATABASE_URL}`;
const FRONTEND_SESSION_PEPPER = `VITE_${OFFICE_SESSION_PEPPER}`;
const SHARED_SERVICE_KEY = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');

export const DENIED_DATABASE_ROLES = [
  'anon',
  'authenticated',
  'authenticator',
  'postgres',
  'supabase_admin',
  ['service', 'role'].join('_'),
] as const;

export type ConfigRejection =
  | 'missing_database'
  | 'missing_pepper'
  | 'forbidden_role'
  | 'shared_credential'
  | 'frontend_secret';

export interface OfficeConfig {
  databaseUrl: string;
  sessionPepper: string;
}

export type OfficeConfigResult =
  | { ok: true; config: OfficeConfig }
  | { ok: false; reason: ConfigRejection };

function read(env: Readonly<Record<string, string | undefined>>, name: string): string {
  return env[name]?.trim() ?? '';
}

export function databaseRole(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    const role = decodeURIComponent(url.username).trim().toLowerCase();
    return role || null;
  } catch {
    return null;
  }
}

export function readOfficeConfig(env: Readonly<Record<string, string | undefined>>): OfficeConfigResult {
  if (read(env, FRONTEND_DATABASE_URL) || read(env, FRONTEND_SESSION_PEPPER)) {
    return { ok: false, reason: 'frontend_secret' };
  }
  const databaseUrl = read(env, OFFICE_DATABASE_URL);
  const sessionPepper = read(env, OFFICE_SESSION_PEPPER);
  if (!databaseUrl) return { ok: false, reason: 'missing_database' };
  if (sessionPepper.length < 32) return { ok: false, reason: 'missing_pepper' };
  const role = databaseRole(databaseUrl);
  if (!role || (DENIED_DATABASE_ROLES as readonly string[]).includes(role)) {
    return { ok: false, reason: 'forbidden_role' };
  }
  const shared = read(env, SHARED_SERVICE_KEY);
  if (shared && databaseUrl.includes(shared)) return { ok: false, reason: 'shared_credential' };
  return { ok: true, config: { databaseUrl, sessionPepper } };
}
