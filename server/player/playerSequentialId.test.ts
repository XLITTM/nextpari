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
    assert.match(sql, /STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.ensure_player_account\(\)/);
    assert.equal(/ensure_player_account\([^)]*p_public_id/.test(sql), false);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_public_id_counter FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ensure_player_account\(\) TO authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.ensure_player_account\(\) FROM anon/);
    const ensureStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.ensure_player_account()');
    const ensureEnd = sql.indexOf('REVOKE ALL ON FUNCTION public.ensure_player_account()');
    const ensure = sql.slice(ensureStart, ensureEnd);
    assert.match(ensure, /RETURNS TABLE \(/);
    assert.match(ensure, /wallet_id UUID,/);
    assert.match(ensure, /legacy_balance NUMERIC,/);
    assert.equal(ensure.includes('RETURNS jsonb'), false);
    assert.equal(ensure.includes('jsonb_build_object'), false);
    assert.match(ensure, /RAISE EXCEPTION 'AUTH_REQUIRED'/);
    const firstStaff = ensure.indexOf('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER');
    const lockAt = ensure.indexOf('pg_catalog.pg_advisory_xact_lock');
    const secondStaff = ensure.indexOf('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER', firstStaff + 1);
    assert.equal(firstStaff >= 0, true);
    assert.equal(lockAt > firstStaff, true);
    assert.equal(secondStaff > lockAt, true);
    assert.match(ensure, /hashtextextended\(v_uid::TEXT, 0\)/);
    assert.match(ensure, /v_profile_exists := FOUND/);
    assert.match(ensure, /FOR UPDATE/);
    const existingPath = ensure.slice(
      ensure.indexOf('IF v_wallet_id IS NOT NULL THEN'),
      ensure.indexOf('v_candidate := private.allocate_next_player_public_id()'),
    );
    assert.equal(existingPath.includes('allocate_next_player_public_id'), false);
    assert.equal(/UPDATE\s+public\.wallets[\s\S]{0,220}public_id\s*=/.test(ensure), false);
    assert.match(ensure, /owner_user_id = v_uid/);
    assert.match(ensure, /USER_ALREADY_HAS_ANOTHER_WALLET/);
    assert.match(ensure, /WALLET_ALREADY_OWNED/);
    assert.match(ensure, /migration_state = 'staging'|,\s*'staging'/);
    assert.match(ensure, /RETURN QUERY/);
    assert.match(ensure, /a\.migration_state/);
    assert.equal(ensure.includes("'migration_state', 'active'"), false);
    assert.equal(ensure.includes("COALESCE(v_mig, 'active')"), false);
    assert.match(ensure, /SET search_path = ''/);
    assert.match(ensure, /SECURITY DEFINER/);
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

  it('keeps the per-user advisory lock so same-user provisioning cannot orphan a wallet', async () => {
    const ensureStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.ensure_player_account()');
    const ensureEnd = sql.indexOf('REVOKE ALL ON FUNCTION public.ensure_player_account()');
    const ensure = sql.slice(ensureStart, ensureEnd);
    const lockAt = ensure.indexOf('pg_catalog.pg_advisory_xact_lock');
    const profileLock = ensure.indexOf('FROM public.profiles AS p');
    const walletLock = ensure.indexOf('FROM public.wallets AS w');
    const allocateAt = ensure.indexOf('private.allocate_next_player_public_id()');
    assert.equal(lockAt >= 0 && profileLock > lockAt, true);
    assert.equal(walletLock > profileLock, true);
    assert.equal(allocateAt > walletLock, true);

    const wallets: string[] = [];
    let existing: string | null = null;
    let chain = Promise.resolve();
    const withUserLock = async <T>(fn: () => T): Promise<T> => {
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
    const ensureSameUser = () => {
      if (existing) return existing;
      const id = formatPlayerPublicId(wallets.length + 1);
      wallets.push(id);
      existing = id;
      return id;
    };
    const ids = await Promise.all(Array.from({ length: 8 }, () => withUserLock(ensureSameUser)));
    assert.deepEqual(new Set(ids).size, 1);
    assert.equal(wallets.length, 1);
    assert.equal(ids[0], '000001');
  });
});
