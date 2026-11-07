import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { connect as connectTls, createServer as createTlsServer } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { GroupControlError } from './errors.js';
import { assertReaderConnection, classifyReaderError, prepareGroupRead, readerPoolConfig, readerPoolSettings, type GroupQuery, type ReaderTlsOptions } from './ownerDb.js';
import { GROUP_PROJECT_REF, GROUP_READ_COLUMNS, GROUP_READ_TABLES, GROUP_ROW_LIMIT, GROUP_SUBJECT_COLUMNS } from './schemaContract.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER = '00000000-0000-4000-8000-0000000000aa';
const DIRECT_HOST = `db.${GROUP_PROJECT_REF}.supabase.co`;

function opensslBin(): string {
  if (process.platform === 'win32') return 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
  return 'openssl';
}

function issueCertificate(directory: string, hostname: string): { cert: string; key: string; ca: string } {
  const san = join(directory, 'san.cnf');
  writeFileSync(san, `subjectAltName=DNS:${hostname}\n`);
  const commands = [
    ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=GroupOwnerTestCA'],
    ['req', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', `/CN=${hostname}`],
    ['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '1', '-sha256', '-extfile', 'san.cnf'],
  ];
  for (const args of commands) {
    const result = spawnSync(opensslBin(), args, { cwd: directory, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('certificate setup failed');
  }
  return {
    cert: readFileSync(join(directory, 'server.crt'), 'utf8'),
    key: readFileSync(join(directory, 'server.key'), 'utf8'),
    ca: readFileSync(join(directory, 'ca.crt'), 'utf8'),
  };
}

function handshake(tlsOptions: ReaderTlsOptions, cert: string, key: string): Promise<string> {
  return new Promise((resolve) => {
    const server = createTlsServer({ cert, key }, (socket) => socket.end());
    const finish = (code: string) => {
      server.close();
      resolve(code);
    };
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const socket = connectTls({
        host: '127.0.0.1',
        port,
        servername: tlsOptions.servername,
        rejectUnauthorized: tlsOptions.rejectUnauthorized,
        ca: tlsOptions.ca,
      });
      socket.setTimeout(3_000, () => {
        socket.destroy();
        finish('ETIMEDOUT');
      });
      socket.once('secureConnect', () => {
        const code = socket.authorized ? 'OK' : 'UNAUTHORIZED';
        socket.end();
        finish(code);
      });
      socket.once('error', (error: NodeJS.ErrnoException) => finish(String(error.code ?? 'GROUP_DATABASE_SSL')));
    });
  });
}

function liveColumns(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const table of GROUP_READ_TABLES) {
    for (const column of GROUP_READ_COLUMNS[table]) rows.push({ table_name: table, column_name: column });
    for (const column of GROUP_SUBJECT_COLUMNS[table] ?? []) rows.push({ table_name: table, column_name: column });
  }
  return rows;
}

function queryFrom(catalog: Record<string, unknown>[], extra: (text: string) => Record<string, unknown>[] = () => []): {
  query: GroupQuery;
  calls: { text: string; params: readonly unknown[] }[];
} {
  const calls: { text: string; params: readonly unknown[] }[] = [];
  const query: GroupQuery = async (text, params) => {
    calls.push({ text, params });
    if (text.includes('information_schema.columns')) return { rows: catalog };
    return { rows: extra(text) };
  };
  return { query, calls };
}

describe('group control reader contract', () => {
  it('selects live catalog columns and refuses the draft shape', async () => {
    const { query, calls } = queryFrom(liveColumns(), (text) => {
      if (text.includes('owner_identities')) return [{ auth_user_id: OWNER, status: 'active' }];
      if (text.includes('owner_permissions')) return [{ permission: 'brands.read' }];
      if (text.includes('FROM group_control."brands"')) return [{ code: '001', slug: 'nextpari', display_name: 'NextPari', status: 'active' }];
      return [];
    });
    const read = await prepareGroupRead(query);
    const owner = await read.loadOwner(OWNER);
    assert.equal(owner?.status, 'active');
    assert.deepEqual(owner?.permissions, ['brands.read']);
    const model = await read.loadModel(OWNER);
    assert.deepEqual(model.brands.map((brand) => brand.code), ['001']);
    const grantSql = calls.map((call) => call.text).find((text) => text.includes('brand_staff_grants')) ?? '';
    assert.match(grantSql, /"brand_code", "role", "staff_subject"/);
    assert.equal(grantSql.includes('"status"'), false);
    const sql = calls.map((call) => call.text).join('\n');
    assert.match(sql, /"auth_user_id" = \$1 OR "id" = \$1/);
    assert.equal(sql.includes('select *'), false);
    assert.equal(/SUM\s*\(/i.test(sql), false);
    assert.equal(/\b(INSERT|UPDATE|DELETE|ALTER)\b/i.test(sql), false);
    assert.equal(sql.includes('wallets'), false);
    assert.equal(sql.includes('treasury'), false);
    assert.equal(sql.includes('owner_dashboard_stats'), false);
    assert.equal(sql.includes('allocate_player_id'), false);
    for (const call of calls) {
      if (call.text.includes('information_schema')) continue;
      assert.equal(call.params[1], GROUP_ROW_LIMIT);
      assert.equal(call.params.includes(OWNER), true);
    }
    await assert.rejects(
      () => prepareGroupRead(queryFrom([{ table_name: 'brands', column_name: 'code' }]).query),
      (error: unknown) => error instanceof GroupControlError && error.code === 'GROUP_COLUMN_MISMATCH',
    );
  });

  it('selects staff status only when the live catalog already has that column', async () => {
    const catalog = liveColumns();
    catalog.push({ table_name: 'brand_staff_grants', column_name: 'status' });
    const { query, calls } = queryFrom(catalog, (text) => (
      text.includes('brand_staff_grants')
        ? [{ brand_code: '001', role: 'security', staff_subject: '00000000-0000-4000-8000-0000000000b2', status: 'suspended' }]
        : []
    ));
    const read = await prepareGroupRead(query);
    const loaded = await read.loadModel(OWNER);
    const grantSql = calls.map((call) => call.text).find((text) => text.includes('brand_staff_grants')) ?? '';
    assert.match(grantSql, /"status"/);
    assert.equal(loaded.grants[0]?.role, 'security');
    assert.equal(loaded.grants[0]?.status, 'suspended');
  });

  it('uses id when that is the live owner subject column', async () => {
    const catalog = liveColumns().filter((row) => row.column_name !== 'auth_user_id');
    const { query, calls } = queryFrom(catalog, (text) => (
      text.includes('owner_identities') ? [{ id: OWNER, status: 'disabled' }] : []
    ));
    const read = await prepareGroupRead(query);
    const owner = await read.loadOwner(OWNER);
    assert.equal(owner?.status, 'disabled');
    const identitySql = calls.map((call) => call.text).find((text) => text.includes('owner_identities')) ?? '';
    assert.match(identitySql, /"id"/);
    assert.equal(identitySql.includes('auth_user_id'), false);
  });

  it('does not query when the subject is not a uuid', async () => {
    const { query, calls } = queryFrom(liveColumns());
    const read = await prepareGroupRead(query);
    const before = calls.length;
    await assert.rejects(
      () => read.loadOwner(`001;drop`),
      (error: unknown) => error instanceof GroupControlError && error.code === 'OWNER_UNKNOWN',
    );
    assert.equal(calls.length, before);
  });

  it('reports row-level security when the owner row is hidden', async () => {
    const { query } = queryFrom(liveColumns(), (text) => (
      text.includes('relrowsecurity') ? [{ enabled: true }] : []
    ));
    const read = await prepareGroupRead(query);
    await assert.rejects(
      () => read.loadOwner(OWNER),
      (error: unknown) => error instanceof GroupControlError && error.code === 'GROUP_RLS_HIDES_OWNER',
    );
  });

  it('returns no owner when the row is absent and row security is off', async () => {
    const { query } = queryFrom(liveColumns(), (text) => (
      text.includes('relrowsecurity') ? [{ enabled: false }] : []
    ));
    const read = await prepareGroupRead(query);
    assert.equal(await read.loadOwner(OWNER), null);
  });

  it('uses verify-full for the direct host and the transaction pooler', () => {
    const valid = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@db.${GROUP_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
    const required = readerPoolConfig(valid);
    assert.equal(required.ssl && typeof required.ssl === 'object' && required.ssl.rejectUnauthorized, true);
    assert.equal(required.statement_timeout, undefined);
    assert.equal(required.query_timeout, 5_000);
    const direct = readerPoolSettings(valid);
    assert.equal(direct.ssl.servername, `db.${GROUP_PROJECT_REF}.supabase.co`);
    assert.equal('checkServerIdentity' in direct.ssl, false);
    assert.equal(direct.connectionString.includes('sslmode'), false);
    assert.equal(direct.connectionString.includes('uselibpqcompat'), false);
    const pooler = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=verify-ca`;
    const pooled = readerPoolSettings(pooler);
    assert.equal(pooled.ssl.rejectUnauthorized, true);
    assert.equal(pooled.ssl.servername, 'aws-0-eu-central-1.pooler.supabase.com');
    assert.equal('checkServerIdentity' in pooled.ssl, false);
    assert.equal(pooled.connectionString.includes('6543'), true);
    assert.equal(pooled.connectionString.includes('sslmode'), false);
    const source = readFileSync(join(root, 'server/group/ownerDb.ts'), 'utf8');
    assert.equal(source.includes('rejectUnauthorized: false'), false);
    assert.equal(source.includes('checkServerIdentity'), false);
    assert.throws(
      () => readerPoolSettings(valid.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require')),
      (error: unknown) => error instanceof GroupControlError && error.code === 'GROUP_DATABASE_SSL',
    );
    assert.throws(
      () => readerPoolSettings(`${valid}&sslrootcert=${encodeURIComponent('-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----')}`),
      (error: unknown) => error instanceof GroupControlError && error.code === 'GROUP_DATABASE_SSL',
    );
  });

  it('maps connection failures without copying the driver message', () => {
    const secret = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@db.${GROUP_PROJECT_REF}.supabase.co:5432/postgres`;
    assert.equal(classifyReaderError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: secret }), 'GROUP_DATABASE_SSL');
    assert.equal(classifyReaderError({ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: secret }), 'GROUP_DATABASE_SSL');
    assert.equal(classifyReaderError({ code: '28P01', message: secret }), 'GROUP_DATABASE_AUTH');
    assert.equal(classifyReaderError({ code: '42501', message: secret }), 'GROUP_DATABASE_FORBIDDEN');
    assert.equal(classifyReaderError({ code: 'ECONNREFUSED', message: secret }), 'GROUP_DATABASE_UNAVAILABLE');
    assert.equal(classifyReaderError({ code: '42703', message: secret }), 'GROUP_COLUMN_MISMATCH');
    assert.equal(classifyReaderError(new GroupControlError('GROUP_SCHEMA_UNAVAILABLE')), 'GROUP_SCHEMA_UNAVAILABLE');
    assert.equal(JSON.stringify(classifyReaderError({ code: '28P01', message: secret })).includes('postgres://'), false);
  });

  it('accepts only the reader role on the existing project', () => {
    const valid = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@db.${GROUP_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
    assert.doesNotThrow(() => assertReaderConnection(valid));
    assert.throws(
      () => assertReaderConnection(valid.replace('group_control_reader', 'postgres')),
      (error: unknown) => error instanceof GroupControlError,
    );
    assert.throws(
      () => assertReaderConnection(valid.replace('sslmode=require', 'sslmode=disable')),
      (error: unknown) => error instanceof GroupControlError && error.code === 'GROUP_DATABASE_SSL',
    );
    assert.throws(
      () => assertReaderConnection(valid.replaceAll(GROUP_PROJECT_REF, 'aaaaaaaaaaaaaaaaaaaa')),
      (error: unknown) => error instanceof GroupControlError,
    );
    process.env.VITE_GROUP_CONTROL_DATABASE_URL = '1';
    try {
      assert.throws(() => assertReaderConnection(valid), (error: unknown) => error instanceof GroupControlError);
    } finally {
      delete process.env.VITE_GROUP_CONTROL_DATABASE_URL;
    }
  });

  it('keeps the role procedure out of production migrations and free of a password', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations'));
    assert.equal(migrations.some((name) => name.includes('group_control_reader')), false);
    const sql = readFileSync(join(root, 'server/group/sql/procedures/003_group_control_reader.sql'), 'utf8');
    assert.match(sql, /DO NOT APPLY/);
    assert.match(sql, /group_control_reader/);
    assert.equal(/PASSWORD\s+'[^']+'/i.test(sql), false);
    assert.equal(sql.includes('GRANT INSERT'), false);
    assert.equal(sql.includes('GRANT UPDATE'), false);
    assert.equal(sql.includes('GRANT DELETE'), false);
    const grants = sql.split('\n').filter((line) => line.startsWith('GRANT SELECT'));
    assert.equal(grants.some((line) => /treasury|wallets|profiles/i.test(line)), false);
    assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA group_control/);
    const staffSql = readFileSync(join(root, 'server/group/sql/procedures/004_group_staff_access.sql'), 'utf8');
    assert.match(staffSql, /DO NOT APPLY/);
    assert.equal(migrations.some((name) => name.includes('group_staff_access')), false);
    assert.equal(/PASSWORD\s+'[^']+'/i.test(staffSql), false);
    assert.equal(staffSql.includes('GRANT INSERT'), false);
    assert.equal(staffSql.includes('GRANT UPDATE'), false);
    assert.equal(staffSql.includes('GRANT DELETE'), false);
    assert.equal(/DISABLE ROW LEVEL SECURITY/i.test(staffSql), false);
    assert.match(staffSql, /ENABLE ROW LEVEL SECURITY/);
    assert.equal(staffSql.includes('@'), false);
    const draft = readFileSync(join(root, 'server/group/sql/drafts/001_group_control_plane.sql'), 'utf8');
    assert.equal(readFileSync(join(root, 'server/group/ownerDb.ts'), 'utf8').includes(draft.slice(0, 40)), false);
  });

  it('rejects an untrusted certificate and accepts a hostname-matched chain', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'group-owner-tls-'));
    try {
      const issued = issueCertificate(directory, DIRECT_HOST);
      const url = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@${DIRECT_HOST}:5432/postgres?sslmode=require`;
      const untrusted = readerPoolSettings(url);
      const rejected = await handshake(untrusted.ssl, issued.cert, issued.key);
      assert.notEqual(rejected, 'OK');
      assert.equal(classifyReaderError({ code: rejected, message: url }), 'GROUP_DATABASE_SSL');
      assert.equal(JSON.stringify(rejected).includes('postgres://'), false);

      const trusted = readerPoolSettings(url, issued.ca);
      assert.equal(trusted.ssl.rejectUnauthorized, true);
      assert.equal(trusted.ssl.servername, DIRECT_HOST);
      assert.equal(Array.isArray(trusted.ssl.ca) && trusted.ssl.ca.some((item) => item.includes('BEGIN CERTIFICATE')), true);
      assert.equal(await handshake(trusted.ssl, issued.cert, issued.key), 'OK');

      const mismatchDir = mkdtempSync(join(tmpdir(), 'group-owner-tls-mismatch-'));
      try {
        const mismatch = issueCertificate(mismatchDir, 'wrong.example');
        const wrongName = readerPoolSettings(url, mismatch.ca);
        const hostnameFailure = await handshake(wrongName.ssl, mismatch.cert, mismatch.key);
        assert.equal(hostnameFailure, 'ERR_TLS_CERT_ALTNAME_INVALID');
        assert.equal(classifyReaderError({ code: hostnameFailure }), 'GROUP_DATABASE_SSL');
      } finally {
        rmSync(mismatchDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
