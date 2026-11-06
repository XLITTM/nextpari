import pg from 'pg';
import { GroupControlError } from './errors.js';
import { mapGroupRows } from './ownerHttp.js';
import type { GroupOwnerRecord, GroupReadModel } from './ownerReadModel.js';
import {
  GROUP_PROJECT_REF,
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
  if (!connectionString.includes(GROUP_PROJECT_REF) || /sslmode=disable/i.test(url.search) || !url.password) {
    throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
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
      const identity = resolved.owner_identities;
      const identityColumn = identity.subject;
      if (!identityColumn) throw new GroupControlError('GROUP_COLUMN_MISMATCH');
      const identitySql = select(
        'owner_identities',
        `WHERE ${quoteIdent(identityColumn, identity.columns)} = $1`,
        'ORDER BY status',
      );
      const found = await query(identitySql, [subject, GROUP_ROW_LIMIT]);
      const row = found.rows[0];
      if (!row) return null;
      const id = String(row[identityColumn] ?? '');
      if (!UUID.test(id)) return null;
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
  const connectionString = (process.env.GROUP_CONTROL_DATABASE_URL ?? '').trim();
  assertReaderConnection(connectionString);
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      ssl: { rejectUnauthorized: true },
      application_name: 'group-owner-reader',
      statement_timeout: 5_000,
      query_timeout: 5_000,
    });
  }
  return async (text, params) => {
    try {
      const result = await pool!.query(text, [...params]);
      return { rows: result.rows as Record<string, unknown>[] };
    } catch (error) {
      if (error instanceof GroupControlError) throw error;
      throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
    }
  };
}
