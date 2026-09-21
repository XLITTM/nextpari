import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationName = '20260921160600_legacy_public_access_lockdown_068.sql';
const migrationPath = join(root, 'supabase/migrations', migrationName);
const regressionPath = join(root, 'supabase/tests/20260921_068_legacy_public_access_lockdown.sql');
const sql = readFileSync(migrationPath, 'utf8');
const regression = readFileSync(regressionPath, 'utf8');

const LOCKED = ['mobcash_orders', 'game_history', 'product_wagers'] as const;
const CLIENT_ROOTS = ['src', 'server', 'api', 'scripts'] as const;
const FROM_RE = /\.from\(\s*(['"])(mobcash_orders|game_history|product_wagers|tournaments)\1\s*\)/g;
const REST_RE = /\/rest\/v1\/(mobcash_orders|game_history|product_wagers|tournaments)\b/g;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === '.git' || name.name.startsWith('.tmp')) continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name.name)) files.push(full);
  }
  return files;
}

describe('phase 068 legacy public access lockdown', () => {
  it('adds exactly one 068 migration after 067', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'));
    assert.equal(migrations.includes('20260919140014_fix_fund_attribution_wallet_ledger_key_067.sql'), true);
    assert.deepEqual(
      migrations.filter((name) => name.includes('_068')),
      [migrationName],
    );
  });

  it('wraps privilege lockdown in a transaction and does not mutate rows', () => {
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.equal(/\bDELETE\s+FROM\b/i.test(sql), false);
    assert.equal(/\bTRUNCATE\s+(TABLE\s+)?(ONLY\s+)?(public\.)?(mobcash_orders|game_history|product_wagers|tournaments)\b/i.test(sql), false);
    assert.equal(/\bINSERT\s+INTO\s+(public\.)?(mobcash_orders|game_history|product_wagers|tournaments)\b/i.test(sql), false);
    assert.equal(/\bUPDATE\s+(public\.)?(mobcash_orders|game_history|product_wagers|tournaments)\b/i.test(sql), false);
    assert.equal(sql.includes('DROP TABLE'), false);
    assert.equal(/REVOKE ALL ON FUNCTION[\s\S]{0,80}next_mobcash_code/i.test(sql), false);
    assert.equal(/GRANT EXECUTE ON FUNCTION[\s\S]{0,80}next_mobcash_code/i.test(sql), false);
    assert.equal(sql.includes('private.wallet_ledger'), false);
    assert.equal(sql.includes('private.operational_ledger'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION'), false);
  });

  it('revokes direct client table privileges', () => {
    for (const table of LOCKED) {
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC;`));
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon;`));
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM authenticated;`));
    }
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON TABLE public\.tournaments FROM PUBLIC;/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON TABLE public\.tournaments FROM anon;/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON TABLE public\.tournaments FROM authenticated;/);
  });

  it('drops known permissive client policies', () => {
    assert.match(sql, /DROP POLICY IF EXISTS "anon_select_mobcash_orders"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_insert_mobcash_orders"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_update_mobcash_orders"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_select_game_history"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_insert_game_history"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_select_product_wagers"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_insert_product_wagers"/);
    assert.match(sql, /DROP POLICY IF EXISTS "Allow anon insert tournaments"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_insert_tournaments"/);
    assert.match(sql, /DROP POLICY IF EXISTS "anon_update_tournaments"/);
    assert.equal(sql.includes('DROP POLICY IF EXISTS "anon_select_tournaments"'), false);
  });

  it('asserts effective privileges with has_table_privilege, not only policy names', () => {
    assert.match(sql, /has_table_privilege\(v_role, format\('public\.%s', v_table\), v_priv\)/);
    assert.match(sql, /has_table_privilege\(v_role, 'public\.tournaments', v_priv\)/);
    assert.match(sql, /to_regclass\('public\.mobcash_orders'\)/);
    assert.match(sql, /to_regclass\('public\.game_history'\)/);
    assert.match(sql, /to_regclass\('public\.product_wagers'\)/);
    assert.match(sql, /to_regclass\('public\.tournaments'\)/);
  });

  it('SQL regression checks catalog privileges and function existence without money calls', () => {
    assert.equal(existsSync(regressionPath), true);
    assert.match(regression, /has_table_privilege\('anon', 'public\.mobcash_orders', 'SELECT'\)/);
    assert.match(regression, /has_table_privilege\('authenticated', 'public\.game_history', 'INSERT'\)/);
    assert.match(regression, /has_table_privilege\('anon', 'public\.product_wagers', 'UPDATE'\)/);
    assert.match(regression, /has_table_privilege\('anon', 'public\.tournaments', 'SELECT'\)/);
    assert.match(regression, /NOT has_table_privilege\('anon', 'public\.tournaments', 'INSERT'\)/);
    assert.match(regression, /to_regprocedure\('public\.cashier_lookup_payout_code\(text\)'\)/);
    assert.match(regression, /to_regprocedure\('public\.cashier_payout_by_code\(uuid,text\)'\)/);
    assert.match(regression, /to_regprocedure\('public\.player_create_cash_payout\(numeric\)'\)/);
    assert.match(regression, /to_regprocedure\('public\.player_list_cash_payouts\(\)'\)/);
    assert.match(regression, /to_regprocedure\('public\.owner_player_dossier\(text\)'\)/);
    assert.match(regression, /to_regprocedure\('private\.dashboard_stats_for_manager_account\(uuid\)'\)/);
    assert.equal(regression.includes('player_create_cash_payout(') && /SELECT\s+player_create_cash_payout\s*\(/i.test(regression), false);
    assert.equal(/SELECT\s+cashier_payout_by_code\s*\(/i.test(regression), false);
  });

  it('has no active client .from() or REST consumers of the locked tables', () => {
    const hits: string[] = [];
    for (const folder of CLIENT_ROOTS) {
      const dir = join(root, folder);
      if (!existsSync(dir)) continue;
      for (const file of walk(dir)) {
        if (file.endsWith('legacyPublicAccessLockdown.test.ts')) continue;
        const text = readFileSync(file, 'utf8');
        FROM_RE.lastIndex = 0;
        REST_RE.lastIndex = 0;
        if (FROM_RE.test(text) || REST_RE.test(text)) hits.push(file.replace(root + '\\', '').replace(root + '/', ''));
      }
    }
    assert.deepEqual(hits, []);
  });
});
