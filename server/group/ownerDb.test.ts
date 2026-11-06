import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GroupControlError } from './errors.js';
import { assertReaderConnection, prepareGroupRead, type GroupQuery } from './ownerDb.js';
import { GROUP_PROJECT_REF, GROUP_READ_COLUMNS, GROUP_READ_TABLES, GROUP_ROW_LIMIT, GROUP_SUBJECT_COLUMNS } from './schemaContract.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER = '00000000-0000-4000-8000-0000000000aa';

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
    const sql = calls.map((call) => call.text).join('\n');
    assert.match(sql, /"auth_user_id"/);
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

  it('accepts only the reader role on the existing project', () => {
    const valid = `postgres://group_control_reader.${GROUP_PROJECT_REF}:pw@db.${GROUP_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
    assert.doesNotThrow(() => assertReaderConnection(valid));
    assert.throws(
      () => assertReaderConnection(valid.replace('group_control_reader', 'postgres')),
      (error: unknown) => error instanceof GroupControlError,
    );
    assert.throws(
      () => assertReaderConnection(valid.replace('sslmode=require', 'sslmode=disable')),
      (error: unknown) => error instanceof GroupControlError,
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
    const draft = readFileSync(join(root, 'server/group/sql/drafts/001_group_control_plane.sql'), 'utf8');
    assert.equal(readFileSync(join(root, 'server/group/ownerDb.ts'), 'utf8').includes(draft.slice(0, 40)), false);
  });
});
