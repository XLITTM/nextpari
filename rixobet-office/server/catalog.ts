import { BRAND } from '../src/brand';

export const REQUIRED_TABLE_COUNT = 16;

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
] as const;

const SESSION_COLUMNS = ['id', 'staff_id', 'brand_code', 'secret_hash', 'expires_at', 'revoked_at', 'mfa_satisfied'] as const;

const CHALLENGE_COLUMNS = ['id', 'staff_id', 'brand_code', 'expires_at', 'consumed_at', 'attempt_count'] as const;

const FLAG_COLUMNS = ['flag_key', 'brand_code', 'enabled'] as const;

export interface CatalogTable {
  name: string;
  rls: boolean;
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

function uniqueMatch(tables: readonly CatalogTable[], required: readonly string[]): string | null {
  const matches = tables.filter((table) => required.every((column) => table.columns.includes(column)));
  if (matches.length !== 1) return null;
  const name = matches[0]?.name;
  if (!name || !identifier(name)) return null;
  return name;
}

export function assessCatalog(snapshot: CatalogSnapshot): CatalogAssessment {
  if (snapshot.schema !== 'ryxobet') return { ok: false, reason: 'schema' };
  if (snapshot.tables.length !== REQUIRED_TABLE_COUNT) return { ok: false, reason: 'table_count' };
  if (snapshot.tables.some((table) => !table.rls || !identifier(table.name))) return { ok: false, reason: 'rls' };
  const staff = uniqueMatch(snapshot.tables, STAFF_COLUMNS);
  const sessions = uniqueMatch(snapshot.tables, SESSION_COLUMNS);
  const challenges = uniqueMatch(snapshot.tables, CHALLENGE_COLUMNS);
  const flags = uniqueMatch(snapshot.tables, FLAG_COLUMNS);
  if (!staff) return { ok: false, reason: 'staff' };
  if (!sessions) return { ok: false, reason: 'sessions' };
  if (!challenges) return { ok: false, reason: 'challenges' };
  if (!flags) return { ok: false, reason: 'flags' };
  return { ok: true, bound: { staff, sessions, challenges, flags } };
}

export function operationalFlagsClosed(flags: readonly { key: string; enabled: boolean; brandCode: string }[]): boolean {
  const relevant = flags.filter((flag) => flag.brandCode === BRAND.code);
  return OPERATIONAL_FLAGS.every((key) => relevant.some((flag) => flag.key === key && flag.enabled === false));
}
