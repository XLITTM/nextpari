import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { assessCatalog, type BoundCatalog, type CatalogSnapshot, type CatalogTable } from './catalog';
import { DENIED_DATABASE_ROLES, type OfficeConfig } from './env';
import type { ChallengeRecord, FlagRecord, OfficeRepository, SessionRecord, StaffRecord } from './repository';

interface PgPool {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('UNSAFE_IDENTIFIER');
  return `"${name}"`;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function integerOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function mapStaff(row: Record<string, unknown>): StaffRecord | null {
  const id = textOrNull(row.id);
  const email = textOrNull(row.email);
  const role = textOrNull(row.role);
  const status = textOrNull(row.status);
  const brandCode = textOrNull(row.brand_code);
  const displayName = textOrNull(row.display_name);
  if (!id || !email || !role || !status || !brandCode || !displayName) return null;
  return {
    id,
    email,
    role,
    status,
    brandCode,
    displayName,
    authUserId: textOrNull(row.auth_user_id),
    passwordHash: textOrNull(row.password_hash),
    mfaSecret: textOrNull(row.mfa_secret),
    mfaLastStep: integerOrNull(row.mfa_last_step),
    identityVerifiedAt: iso(row.identity_verified_at),
    invitationTokenHash: textOrNull(row.invitation_token_hash),
  };
}

const STAFF_FIELDS = `id, email, role, status, brand_code, display_name, auth_user_id, password_hash, mfa_secret, mfa_last_step, identity_verified_at, invitation_token_hash`;

async function loadDriver(databaseUrl: string): Promise<PgPool> {
  const host = new URL(databaseUrl).hostname;
  return new Pool({
    connectionString: databaseUrl,
    max: 2,
    ssl: host === 'localhost' || host === '127.0.0.1' ? undefined : { rejectUnauthorized: true },
  });
}

async function snapshot(pool: PgPool): Promise<CatalogSnapshot> {
  const result = await pool.query(
    `select c.relname as table_name,
            (c.relrowsecurity and pg_catalog.pg_get_userbyid(c.relowner)::text <> current_user) as rls,
            a.attname as column_name
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'ryxobet' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`,
  );
  const tables = new Map<string, CatalogTable>();
  for (const row of result.rows) {
    const name = textOrNull(row.table_name);
    const column = textOrNull(row.column_name);
    if (!name || !column) continue;
    const existing = tables.get(name) ?? { name, rls: row.rls === true, columns: [] };
    tables.set(name, { ...existing, columns: [...existing.columns, column] });
  }
  return { schema: 'ryxobet', tables: [...tables.values()] };
}

function repository(pool: PgPool, bound: BoundCatalog): OfficeRepository {
  const staffTable = `ryxobet.${ident(bound.staff)}`;
  const sessionTable = `ryxobet.${ident(bound.sessions)}`;
  const challengeTable = `ryxobet.${ident(bound.challenges)}`;
  const flagTable = `ryxobet.${ident(bound.flags)}`;

  return {
    async findStaffByEmail(email) {
      const result = await pool.query(`select ${STAFF_FIELDS} from ${staffTable} where lower(email) = lower($1)`, [email]);
      const row = result.rows[0];
      return row ? mapStaff(row) : null;
    },
    async findStaffById(id) {
      const result = await pool.query(`select ${STAFF_FIELDS} from ${staffTable} where id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapStaff(row) : null;
    },
    async listInvitedOwners() {
      const result = await pool.query(
        `select ${STAFF_FIELDS} from ${staffTable}
         where role = 'owner' and status = 'invited' and auth_user_id is null and brand_code = '002'`,
      );
      return result.rows.map((row) => mapStaff(row)).filter((row): row is StaffRecord => row !== null);
    },
    async saveStaff(staff) {
      await pool.query(
        `update ${staffTable}
         set password_hash = $2, mfa_secret = $3, mfa_last_step = $4, status = $5,
             identity_verified_at = $6, auth_user_id = $7
         where id = $1 and brand_code = '002'`,
        [staff.id, staff.passwordHash, staff.mfaSecret, staff.mfaLastStep, staff.status, staff.identityVerifiedAt, staff.authUserId],
      );
    },
    async createChallenge(staffId, expiresAt) {
      const id = randomUUID();
      await pool.query(
        `insert into ${challengeTable} (id, staff_id, brand_code, expires_at, consumed_at, attempt_count)
         values ($1, $2, '002', $3, null, 0)`,
        [id, staffId, expiresAt],
      );
      return { id, staffId, brandCode: '002', expiresAt, consumedAt: null, attemptCount: 0 };
    },
    async readChallenge(id) {
      const result = await pool.query(
        `select id, staff_id, brand_code, expires_at, consumed_at, attempt_count from ${challengeTable} where id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      const expiresAt = iso(row.expires_at);
      const staffId = textOrNull(row.staff_id);
      const brandCode = textOrNull(row.brand_code);
      const attemptCount = integerOrNull(row.attempt_count);
      if (!expiresAt || !staffId || !brandCode || attemptCount === null) return null;
      const challenge: ChallengeRecord = {
        id,
        staffId,
        brandCode,
        expiresAt,
        consumedAt: iso(row.consumed_at),
        attemptCount,
      };
      return challenge;
    },
    async saveChallenge(challenge) {
      await pool.query(`update ${challengeTable} set consumed_at = $2, attempt_count = $3 where id = $1 and brand_code = '002'`, [
        challenge.id,
        challenge.consumedAt,
        challenge.attemptCount,
      ]);
    },
    async createSession(input) {
      const staffResult = await pool.query(`select ${STAFF_FIELDS} from ${staffTable} where id = $1 and brand_code = '002'`, [
        input.staffId,
      ]);
      const staff = staffResult.rows[0] ? mapStaff(staffResult.rows[0]) : null;
      if (!staff || staff.brandCode !== '002') throw new Error('STAFF_NOT_FOUND');
      const publicId = randomUUID();
      await pool.query(
        `insert into ${sessionTable} (id, staff_id, brand_code, secret_hash, expires_at, revoked_at, mfa_satisfied)
         values ($1, $2, '002', $3, $4, null, true)`,
        [publicId, staff.id, input.secretHash, input.expiresAt],
      );
      const session: SessionRecord = {
        publicId,
        staffId: staff.id,
        brandCode: '002',
        secretHash: input.secretHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        mfaSatisfied: true,
        role: staff.role,
        displayName: staff.displayName,
      };
      return session;
    },
    async readSession(secretHash) {
      const result = await pool.query(
        `select s.id, s.staff_id, s.brand_code, s.secret_hash, s.expires_at, s.revoked_at, s.mfa_satisfied,
                st.role, st.display_name
         from ${sessionTable} s
         join ${staffTable} st on st.id = s.staff_id
         where s.secret_hash = $1 and s.revoked_at is null`,
        [secretHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      const publicId = textOrNull(row.id);
      const staffId = textOrNull(row.staff_id);
      const brandCode = textOrNull(row.brand_code);
      const expiresAt = iso(row.expires_at);
      const role = textOrNull(row.role);
      const displayName = textOrNull(row.display_name);
      if (!publicId || !staffId || !brandCode || !expiresAt || !role || !displayName) return null;
      return {
        publicId,
        staffId,
        brandCode,
        secretHash,
        expiresAt,
        revokedAt: iso(row.revoked_at),
        mfaSatisfied: row.mfa_satisfied === true,
        role,
        displayName,
      };
    },
    async revokeSession(secretHash, revokedAt) {
      await pool.query(`update ${sessionTable} set revoked_at = $2 where secret_hash = $1 and brand_code = '002'`, [
        secretHash,
        revokedAt,
      ]);
    },
    async flags() {
      const result = await pool.query(`select flag_key, brand_code, enabled from ${flagTable} where brand_code = '002'`);
      const flags: FlagRecord[] = [];
      for (const row of result.rows) {
        const key = textOrNull(row.flag_key);
        const brandCode = textOrNull(row.brand_code);
        if (!key || !brandCode || typeof row.enabled !== 'boolean') continue;
        flags.push({ key, brandCode, enabled: row.enabled });
      }
      return flags;
    },
  };
}

export async function openPostgresOffice(config: OfficeConfig): Promise<OfficeRepository> {
  const pool = await loadDriver(config.databaseUrl);
  try {
    const identity = await pool.query(
      `select current_user as role, current_setting('is_superuser') as superuser, rolbypassrls
       from pg_catalog.pg_roles where rolname = current_user`,
    );
    const role = textOrNull(identity.rows[0]?.role)?.toLowerCase();
    const superuser = textOrNull(identity.rows[0]?.superuser);
    if (!role || superuser === 'on' || identity.rows[0]?.rolbypassrls === true || (DENIED_DATABASE_ROLES as readonly string[]).includes(role)) {
      throw new Error('DATABASE_ROLE_FORBIDDEN');
    }
    await pool.query(`select set_config('search_path', 'ryxobet', false)`);
    const bound = assessCatalog(await snapshot(pool));
    if (!bound.ok) throw new Error(`CATALOG_${bound.reason}`);
    return repository(pool, bound.bound);
  } catch (error) {
    await pool.end();
    throw error;
  }
}
