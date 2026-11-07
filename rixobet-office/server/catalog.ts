import { BRAND } from '../src/brand';

export const REQUIRED_TABLE_COUNT = 19;

export const AUTH_TABLES = {
  staff: 'staff_accounts',
  challenges: 'staff_mfa_challenges',
  sessions: 'staff_sessions',
  flags: 'feature_flags',
} as const;

export const OPERATIONAL_FLAGS = [
  'payments',
  'treasury',
  'sportsbook',
  'casino',
  'betting',
  'player_registration',
  'staff_mutations',
] as const;

const STAFF_COLUMNS = [
  'id',
  'email',
  'role',
  'status',
  'brand_code',
  'display_name',
  'auth_user_id',
  'password_hash',
  'mfa_secret',
  'mfa_last_step',
  'identity_verified_at',
  'invitation_token_hash',
  'invitation_expires_at',
  'invitation_consumed_at',
] as const;

const SESSION_COLUMNS = ['id', 'staff_id', 'brand_code', 'secret_hash', 'expires_at', 'revoked_at', 'mfa_satisfied'] as const;

const CHALLENGE_COLUMNS = ['id', 'staff_id', 'brand_code', 'expires_at', 'consumed_at', 'attempt_count'] as const;

const FLAG_COLUMNS = ['flag_key', 'brand_code', 'enabled'] as const;

export interface CatalogTable {
  name: string;
  rls: boolean;
  forceRls: boolean;
  columns: readonly string[];
}

export interface CatalogSnapshot {
  schema: string;
  tables: readonly CatalogTable[];
}

export interface BoundCatalog {
  staff: string;
  sessions: string;
  challenges: string;
  flags: string;
}

export type CatalogRejection = 'schema' | 'table_count' | 'rls' | 'staff' | 'sessions' | 'challenges' | 'flags';

export type CatalogAssessment =
  | { ok: true; bound: BoundCatalog }
  | { ok: false; reason: CatalogRejection };

function identifier(value: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(value);
}

function namedTable(tables: readonly CatalogTable[], name: string, required: readonly string[]): boolean {
  const table = tables.find((entry) => entry.name === name);
  if (!table || !identifier(table.name) || !table.rls || !table.forceRls) return false;
  return required.every((column) => table.columns.includes(column));
}

export function assessCatalog(snapshot: CatalogSnapshot): CatalogAssessment {
  if (snapshot.schema !== 'ryxobet') return { ok: false, reason: 'schema' };
  if (snapshot.tables.length !== REQUIRED_TABLE_COUNT) return { ok: false, reason: 'table_count' };
  if (snapshot.tables.some((table) => !table.rls || !table.forceRls || !identifier(table.name))) {
    return { ok: false, reason: 'rls' };
  }
  if (!namedTable(snapshot.tables, AUTH_TABLES.staff, STAFF_COLUMNS)) return { ok: false, reason: 'staff' };
  if (!namedTable(snapshot.tables, AUTH_TABLES.sessions, SESSION_COLUMNS)) return { ok: false, reason: 'sessions' };
  if (!namedTable(snapshot.tables, AUTH_TABLES.challenges, CHALLENGE_COLUMNS)) return { ok: false, reason: 'challenges' };
  if (!namedTable(snapshot.tables, AUTH_TABLES.flags, FLAG_COLUMNS)) return { ok: false, reason: 'flags' };
  return {
    ok: true,
    bound: {
      staff: AUTH_TABLES.staff,
      sessions: AUTH_TABLES.sessions,
      challenges: AUTH_TABLES.challenges,
      flags: AUTH_TABLES.flags,
    },
  };
}

export function operationalFlagsClosed(flags: readonly { key: string; enabled: boolean; brandCode: string }[]): boolean {
  const relevant = flags.filter((flag) => flag.brandCode === BRAND.code);
  return OPERATIONAL_FLAGS.every((key) => relevant.some((flag) => flag.key === key && flag.enabled === false));
}
