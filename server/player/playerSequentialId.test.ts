import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseLoginPlayerId } from './playerValidators.js';
import { allocateSequentialPlayerId, formatPlayerPublicId } from './playerPublicId.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260913181000_player_identity_email_verification_044.sql'),
  'utf8',
);

describe('sequential player public ids', () => {
  it('formats leading zeros and allocates 000001, 000002, 000010', () => {
    assert.equal(formatPlayerPublicId(1), '000001');
    assert.equal(formatPlayerPublicId(2), '000002');
    assert.equal(formatPlayerPublicId(10), '000010');
    assert.equal(formatPlayerPublicId(999999), '999999');
    const first = allocateSequentialPlayerId(1, []);
    assert.equal(first.id, '000001');
    const second = allocateSequentialPlayerId(first.nextValue, [first.id]);
    assert.equal(second.id, '000002');
    let next = 1;
    const occupied = new Set<string>();
    let tenth = '';
    for (let i = 0; i < 10; i += 1) {
      const allocated = allocateSequentialPlayerId(next, occupied);
      occupied.add(allocated.id);
      next = allocated.nextValue;
      tenth = allocated.id;
    }
    assert.equal(tenth, '000010');
    assert.equal(typeof tenth, 'string');
    assert.equal(Number(tenth), 10);
  });

  it('skips occupied legacy ids and does not reassign them', () => {
    const allocated = allocateSequentialPlayerId(1, ['000001', '000002', '110790']);
    assert.equal(allocated.id, '000003');
    const later = allocateSequentialPlayerId(110790, ['110790']);
    assert.equal(later.id, '110791');
  });

  it('serializes concurrent provisioning so ids stay unique', async () => {
    let next = 1;
    const occupied = new Set<string>();
    let chain = Promise.resolve();
    const withLock = async <T>(fn: () => T): Promise<T> => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return fn();
      } finally {
        release();
      }
    };
    const ids = await Promise.all(Array.from({ length: 20 }, () => withLock(() => {
      const allocated = allocateSequentialPlayerId(next, occupied);
      occupied.add(allocated.id);
      next = allocated.nextValue;
      return allocated.id;
    })));
    assert.equal(new Set(ids).size, 20);
    assert.equal(ids.includes('000001'), true);
    assert.equal(ids.includes('000020'), true);
  });

  it('does not consume the counter when the assignment transaction is rolled back', () => {
    const next = 25;
    const occupied = new Set<string>(['110790']);
    try {
      const allocated = allocateSequentialPlayerId(next, occupied);
      throw new Error(`rollback-after-${allocated.id}`);
    } catch (err) {
      assert.match(String(err), /rollback-after-000025/);
    }
    const retry = allocateSequentialPlayerId(next, occupied);
    assert.equal(retry.id, '000025');
  });

  it('044 uses a locked singleton counter and never MAX(public_id)+1 or SEQUENCE', () => {
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /SET LOCAL statement_timeout = '10min'/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_public_id_counter/);
    assert.match(sql, /next_value INTEGER NOT NULL/);
    assert.match(sql, /next_value BETWEEN 1 AND 1000000/);
    assert.match(sql, /VALUES \(TRUE, 1\)/);
    assert.match(sql, /ON CONFLICT DO NOTHING/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /private\.allocate_next_player_public_id/);
    assert.match(sql, /pg_catalog\.lpad\(v_next::TEXT, 6, '0'\)/);
    assert.match(sql, /PUBLIC_ID_SPACE_EXHAUSTED/);
    assert.match(sql, /SET next_value = v_next \+ 1/);
    assert.equal(sql.includes('MAX(public_id)'), false);
    assert.equal(sql.includes('CREATE SEQUENCE'), false);
    assert.equal(sql.includes('DROP INDEX'), false);
    assert.match(sql, /public_id !~ '\^\[0-9\]\{6\}\$'/);
    assert.match(sql, /STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.ensure_player_account\(\)/);
    assert.equal(/ensure_player_account\([^)]*p_public_id/.test(sql), false);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_public_id_counter FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ensure_player_account\(\) TO authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.ensure_player_account\(\) FROM anon/);
    const login = readFileSync(join(root, 'server/player/playerValidators.ts'), 'utf8');
    assert.match(login, /parseLoginPlayerId/);
    assert.match(login, /\^\[0-9\]\{6\}\$/);
    assert.equal(parseLoginPlayerId('000001'), '000001');
    assert.equal(parseLoginPlayerId('110790'), '110790');
    assert.equal(parseLoginPlayerId('1'), null);
    const auth = readFileSync(join(root, 'src/lib/playerAuth.ts'), 'utf8');
    assert.match(auth, /mode: 'identifier'/);
    assert.equal(auth.includes('Number(publicId)'), false);
    const service = readFileSync(join(root, 'server/player/playerAuthService.ts'), 'utf8');
    assert.match(service, /parseLoginPlayerId/);
    assert.match(service, /mode === 'phone'/);
    assert.equal(service.includes('p_public_id'), false);
    assert.equal(
      readdirSync(join(root, 'supabase/migrations')).filter((name) => name.includes('_044.sql')).join(','),
      '20260913181000_player_identity_email_verification_044.sql',
    );
  });
});
