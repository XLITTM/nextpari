import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import pg from 'pg';
import { GroupControlError } from './errors.js';
import { mapGroupRows } from './ownerHttp.js';
import type { GroupOwnerRecord, GroupReadModel } from './ownerReadModel.js';
import {
  GROUP_PROJECT_REF,
  GROUP_OPTIONAL_COLUMNS,
  GROUP_READ_COLUMNS,
  GROUP_READ_TABLES,
  GROUP_READER_ROLE,
  GROUP_ROW_LIMIT,
  GROUP_SUBJECT_COLUMNS,
  type GroupReadTable,
} from './schemaContract.js';

export interface GroupQuery {
  (text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z_][a-z0-9_]*$/;
const FORBIDDEN_USERS = new Set([
  'postgres',
  'supabase_admin',
  'authenticator',
  'service_role',
  'anon',
  'authenticated',
]);

const CATALOG_SQL = `
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'group_control'
  AND table_name = ANY($1::text[])
`.trim();

export interface PreparedGroupRead {
  loadOwner(userId: string): Promise<GroupOwnerRecord | null>;
  loadModel(ownerId: string): Promise<GroupReadModel>;
}

const DATABASE_PG_CODES: Record<string, string> = {
  '28000': 'GROUP_DATABASE_AUTH',
  '28P01': 'GROUP_DATABASE_AUTH',
  '42501': 'GROUP_DATABASE_FORBIDDEN',
  '42703': 'GROUP_COLUMN_MISMATCH',
  '42P01': 'GROUP_SCHEMA_UNAVAILABLE',
  '3F000': 'GROUP_SCHEMA_UNAVAILABLE',
  '57014': 'GROUP_SCHEMA_UNAVAILABLE',
};

const SSL_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

const UNAVAILABLE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

const OWNER_RLS_SQL = `
SELECT c.relrowsecurity AS enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'group_control'
  AND c.relname = 'owner_identities'
LIMIT 1
`.trim();

const PEM_CERTIFICATES = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

export interface ReaderTlsOptions {
  rejectUnauthorized: true;
  servername: string;
  ca?: string[];
}

export interface ReaderPoolSettings {
  connectionString: string;
  ssl: ReaderTlsOptions;
}

function trustedRootCert(source: string): string {
  const trimmed = source.trim();
  if (trimmed.includes('PRIVATE KEY') || /postgres(ql)?:\/\//i.test(trimmed)) {
    throw new GroupControlError('GROUP_DATABASE_SSL');
  }
  const inline = trimmed.match(PEM_CERTIFICATES);
  if (inline) return inline.join('\n');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) throw new GroupControlError('GROUP_DATABASE_SSL');
  let fileText = '';
  try {
    fileText = readFileSync(trimmed, 'utf8');
  } catch {
    throw new GroupControlError('GROUP_DATABASE_SSL');
  }
  if (fileText.includes('PRIVATE KEY')) throw new GroupControlError('GROUP_DATABASE_SSL');
  const blocks = fileText.match(PEM_CERTIFICATES);
  if (!blocks) throw new GroupControlError('GROUP_DATABASE_SSL');
  return blocks.join('\n');
}

/**
 * pg parses sslmode from the connection string after Pool is constructed and
 * replaces any ssl object supplied beside it. The modes require, prefer, and
 * verify-ca are removed here. Every accepted mode is then verify-full:
 * the certificate chain and the hostname are both checked.
 * A Supabase root from sslrootcert or GROUP_CONTROL_DATABASE_SSL_ROOT_CERT is
 * added to Node's public trust store. It does not replace that store and it
 * does not disable verification.
 */
export function readerPoolSettings(connectionString: string, rootCertSource?: string): ReaderPoolSettings {
  assertReaderConnection(connectionString);
  if ((process.env.VITE_GROUP_CONTROL_DATABASE_SSL_ROOT_CERT ?? '').trim()) {
    throw new GroupControlError('GROUP_DATABASE_SSL');
  }
  const url = new URL(connectionString);
  const mode = (url.searchParams.get('sslmode') ?? 'verify-full').toLowerCase();
  if (mode === 'disable' || mode === 'allow' || mode === 'prefer') {
    throw new GroupControlError('GROUP_DATABASE_SSL');
  }
  const rootFromUrl = url.searchParams.get('sslrootcert') ?? '';
  for (const key of ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) {
    url.searchParams.delete(key);
  }
  const source = (rootCertSource ?? rootFromUrl).trim();
  const ssl: ReaderTlsOptions = {
    rejectUnauthorized: true,
    servername: url.hostname,
  };
  if (source) ssl.ca = [...tls.rootCertificates, trustedRootCert(source)];
  return { connectionString: url.toString(), ssl };
}

export function readerPoolConfig(connectionString: string, rootCertSource?: string): pg.PoolConfig {
  const settings = readerPoolSettings(connectionString, rootCertSource);
  return {
    connectionString: settings.connectionString,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ssl: settings.ssl,
    application_name: 'group-owner-reader',
    query_timeout: 5_000,
  };
}

export function classifyReaderError(error: unknown): string {
  if (error instanceof GroupControlError) return error.code;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (DATABASE_PG_CODES[code]) return DATABASE_PG_CODES[code];
  if (SSL_ERROR_CODES.has(code) || code.startsWith('ERR_SSL_')) return 'GROUP_DATABASE_SSL';
  if (UNAVAILABLE_ERROR_CODES.has(code)) return 'GROUP_DATABASE_UNAVAILABLE';
  return 'GROUP_SCHEMA_UNAVAILABLE';
}

export function assertReaderConnection(connectionString: string): void {
  if ((process.env.VITE_GROUP_CONTROL_DATABASE_URL ?? '').trim()) {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
  }
  const user = decodeURIComponent(url.username);
  const bare = user.split('.')[0] ?? '';
  if (bare !== GROUP_READER_ROLE || FORBIDDEN_USERS.has(bare) || !user.startsWith(GROUP_READER_ROLE)) {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
  }
  if (!connectionString.includes(GROUP_PROJECT_REF) || !url.password) {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
  }
  if (/sslmode=disable/i.test(url.search) || /sslmode=allow/i.test(url.search) || /uselibpqcompat=true/i.test(url.search)) {
    throw new GroupControlError('GROUP_DATABASE_SSL');
  }
}

export function resolveSelectList(table: GroupReadTable, liveColumns: readonly string[]): { subject: string | null; columns: string[] } {
  const live = new Set(liveColumns);
  const candidates = GROUP_SUBJECT_COLUMNS[table] ?? [];
  const subject = candidates.find((column) => live.has(column)) ?? null;
  if (candidates.length > 0 && !subject) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
  const columns: string[] = [];
  for (const column of GROUP_READ_COLUMNS[table]) {
    if (!live.has(column)) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
    columns.push(column);
  }
  for (const column of GROUP_OPTIONAL_COLUMNS[table] ?? []) {
    if (live.has(column)) columns.push(column);
  }
  return { subject, columns: subject ? [subject, ...columns] : columns };
}

function quoteIdent(column: string, allowed: readonly string[]): string {
  if (!IDENT.test(column) || !allowed.includes(column)) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
  return `"${column}"`;
}

function catalogByTable(rows: readonly Record<string, unknown>[]): Map<GroupReadTable, string[]> {
  const found = new Map<GroupReadTable, string[]>();
  for (const row of rows) {
    const table = String(row.table_name ?? '');
    const column = String(row.column_name ?? '');
    if (!(GROUP_READ_TABLES as readonly string[]).includes(table)) continue;
    const list = found.get(table as GroupReadTable) ?? [];
    list.push(column);
    found.set(table as GroupReadTable, list);
  }
  for (const table of GROUP_READ_TABLES) {
    if (!found.has(table)) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
  }
  return found;
}

function assertUserId(userId: string): string {
  if (!UUID.test(userId)) throw new GroupControlError('OWNER_UNKNOWN');
  return userId.toLowerCase();
}

function ownerStatus(value: unknown): 'active' | 'disabled' {
  return value === 'active' ? 'active' : 'disabled';
}

export async function prepareGroupRead(query: GroupQuery): Promise<PreparedGroupRead> {
  const catalog = await query(CATALOG_SQL, [GROUP_READ_TABLES]);
  const byTable = catalogByTable(catalog.rows);
  const resolved = Object.fromEntries(
    GROUP_READ_TABLES.map((table) => [table, resolveSelectList(table, byTable.get(table) ?? [])]),
  ) as Record<GroupReadTable, { subject: string | null; columns: string[] }>;

  const select = (table: GroupReadTable, where: string, order: string): string => {
    const plan = resolved[table];
    const allowed = plan.columns;
    const list = allowed.map((column) => quoteIdent(column, allowed)).join(', ');
    return `SELECT ${list} FROM group_control.${quoteIdent(table, GROUP_READ_TABLES)} ${where} ${order} LIMIT $2`;
  };

  const brandOwnerColumn = resolved.brand_owners.subject;
  if (!brandOwnerColumn) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
  const ownerMatch = `${quoteIdent(brandOwnerColumn, [brandOwnerColumn])} = $1`;
  const ownedBrands = `SELECT brand_code FROM group_control.brand_owners WHERE ${ownerMatch}`;

  return {
    async loadOwner(userId: string): Promise<GroupOwnerRecord | null> {
      const subject = assertUserId(userId);
      const identityLive = byTable.get('owner_identities') ?? [];
      const identitySubjects = (GROUP_SUBJECT_COLUMNS.owner_identities ?? [])
        .filter((column) => identityLive.includes(column));
      if (identitySubjects.length === 0) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
      const identityWhere = identitySubjects
        .map((column) => `${quoteIdent(column, identitySubjects)} = $1`)
        .join(' OR ');
      const identitySql = select(
        'owner_identities',
        `WHERE (${identityWhere})`,
        'ORDER BY status',
      );
      const found = await query(identitySql, [subject, GROUP_ROW_LIMIT]);
      const row = found.rows[0];
      if (!row) {
        let hidden = false;
        try {
          const flags = await query(OWNER_RLS_SQL, []);
          hidden = flags.rows[0]?.enabled === true;
        } catch {
          hidden = false;
        }
        if (hidden) throw new GroupControlError('GROUP_RLS_HIDES_OWNER');
        return null;
      }
      const id = subject;
      const permission = resolved.owner_permissions;
      const permissionColumn = permission.subject;
      if (!permissionColumn) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
      const permissionSql = select(
        'owner_permissions',
        `WHERE ${quoteIdent(permissionColumn, permission.columns)} = $1`,
        'ORDER BY permission',
      );
      const permissions = await query(permissionSql, [id.toLowerCase(), GROUP_ROW_LIMIT]);
      return {
        id: id.toLowerCase(),
        status: ownerStatus(row.status),
        permissions: permissions.rows.map((item) => String(item.permission ?? '')).filter(Boolean),
      };
    },
    async loadModel(ownerId: string): Promise<GroupReadModel> {
      const subject = assertUserId(ownerId);
      const params = [subject, GROUP_ROW_LIMIT] as const;
      const [brands, brandOwners, grants, players, finance, audit] = await Promise.all([
        query(select('brands', `WHERE code IN (${ownedBrands})`, 'ORDER BY code'), params),
        query(select('brand_owners', `WHERE ${ownerMatch}`, 'ORDER BY brand_code'), params),
        query(select('brand_staff_grants', `WHERE brand_code IN (${ownedBrands})`, 'ORDER BY brand_code'), params),
        query(select('player_id_reservations', `WHERE brand_code IN (${ownedBrands})`, 'ORDER BY public_id'), params),
        query(select('brand_report_snapshots', `WHERE brand_code IN (${ownedBrands})`, 'ORDER BY brand_code, currency'), params),
        query(select('audit_events', `WHERE brand_code IN (${ownedBrands})`, 'ORDER BY created_at DESC'), params),
      ]);
      return mapGroupRows({
        brands: brands.rows,
        brandOwners: brandOwners.rows,
        grants: grants.rows,
        players: players.rows,
        finance: finance.rows,
        audit: audit.rows,
      });
    },
  };
}

let pool: pg.Pool | null = null;

export function readerQueryFromEnv(): GroupQuery {
  const configured = (process.env.GROUP_CONTROL_DATABASE_SSL_ROOT_CERT ?? '').trim();
  const config = readerPoolConfig((process.env.GROUP_CONTROL_DATABASE_URL ?? '').trim(), configured || undefined);
  if (!pool) {
    pool = new pg.Pool(config);
  }
  return async (text, params) => {
    try {
      const result = await pool!.query(text, [...params]);
      return { rows: result.rows as Record<string, unknown>[] };
    } catch (error) {
      throw new GroupControlError(classifyReaderError(error));
    }
  };
}
