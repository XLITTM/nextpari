import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261116173000_cashier_payout_destination_registration.sql'),
  'utf8',
);
const listMigration = readFileSync(
  join(root, 'supabase/migrations/20260921233000_player_session_revocation_070.sql'),
  'utf8',
);
const attributionMigration = readFileSync(
  join(root, 'supabase/migrations/20260918190000_cashier_fund_attribution_review.sql'),
  'utf8',
);

function slice(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  assert.ok(from >= 0, start);
  assert.ok(to > from, end);
  return sql.slice(from, to);
}

const helper = slice(
  migration,
  'CREATE OR REPLACE FUNCTION private.register_eligible_cashier_payout_destination(',
  'REVOKE ALL ON FUNCTION private.register_eligible_cashier_payout_destination(UUID)',
);
const provision = slice(
  migration,
  'CREATE OR REPLACE FUNCTION public.manager_provision_cashier(',
  'REVOKE ALL ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT)',
);
const listFn = slice(
  listMigration,
  'CREATE OR REPLACE FUNCTION public.player_list_cash_payout_destinations()',
  'REVOKE ALL ON FUNCTION public.player_list_cash_payout_destinations()',
);
const resolveFn = slice(
  attributionMigration,
  'CREATE OR REPLACE FUNCTION private.resolve_live_payout_destination(',
  'REVOKE ALL ON FUNCTION private.resolve_live_payout_destination(TEXT, TEXT)',
);

describe('cashier payout destination registration', () => {
  it('registers a destination from cashier creation after the operational account exists', () => {
    const accountAt = provision.indexOf('INSERT INTO private.operational_accounts');
    const registerAt = provision.indexOf(
      'v_destination_id := private.register_eligible_cashier_payout_destination(v_cashier_id)',
    );
    const auditAt = provision.indexOf("PERFORM private.append_staff_audit(");
    assert.ok(accountAt > 0);
    assert.ok(registerAt > accountAt);
    assert.ok(auditAt > registerAt);
    assert.match(provision, /'cashier',\s*\n\s*'TMTM'/);
    assert.match(provision, /0,\s*\n\s*'active',\s*\n\s*'active'/);
    assert.match(provision, /private\.get_current_manager_context\(\)/);
    assert.equal(provision.includes('p_network_id'), false);
    assert.equal(provision.includes('p_float'), false);
    assert.match(provision, /'payout_destination_id', v_destination_id/);
  });

  it('backfills through the same helper and refuses duplicate cashier links', () => {
    assert.match(migration, /RAISE EXCEPTION 'CASHIER_PAYOUT_DESTINATION_DUPLICATE'/);
    assert.match(
      migration,
      /CREATE UNIQUE INDEX IF NOT EXISTS cashier_payout_destinations_cashier_uidx\s+ON private\.cashier_payout_destinations \(legacy_cashier_id\)/,
    );
    assert.match(migration, /ON CONFLICT \(legacy_cashier_id\) DO NOTHING/);
    assert.match(
      migration,
      /FOR v_cashier_id IN[\s\S]*SELECT c\.id[\s\S]*FROM public\.cashiers AS c[\s\S]*ORDER BY c\.id[\s\S]*PERFORM private\.register_eligible_cashier_payout_destination\(v_cashier_id\)/,
    );
    const existingAt = helper.indexOf('IF v_existing IS NOT NULL THEN');
    const insertAt = helper.indexOf('INSERT INTO private.cashier_payout_destinations');
    assert.ok(existingAt > 0 && existingAt < insertAt);
    assert.match(helper, /'cp_' \|\| pg_catalog\.encode\(extensions\.gen_random_bytes\(16\), 'hex'\)/);
    assert.equal(helper.includes('SET public_token'), false);
  });

  it('keeps frozen, disabled, operational, and currency gates', () => {
    assert.match(helper, /IF v_cashier\.is_active IS DISTINCT FROM TRUE THEN/);
    assert.match(helper, /s\.role = 'cashier'/);
    assert.match(helper, /s\.status IS DISTINCT FROM 'active'/);
    assert.match(helper, /a\.account_type = 'cashier'/);
    assert.match(helper, /a\.status = 'active'/);
    assert.match(helper, /a\.migration_state = 'active'/);
    assert.equal(helper.includes('UPDATE public.cashiers'), false);
    assert.equal(helper.includes('UPDATE private.operational_accounts'), false);
    assert.equal(helper.includes('SET migration_state'), false);
    assert.match(listFn, /a\.currency = v_active\.storage_currency/);
    assert.match(listFn, /d\.is_selectable IS TRUE/);
    assert.match(listFn, /c\.is_active IS TRUE/);
    assert.match(listFn, /a\.status = 'active'/);
    assert.match(listFn, /a\.migration_state = 'active'/);
    assert.match(resolveFn, /a\.currency = p_storage_currency/);
    assert.match(resolveFn, /a\.status = 'active'/);
    assert.match(resolveFn, /a\.migration_state = 'active'/);
    assert.equal(
      migration.includes('CREATE OR REPLACE FUNCTION public.player_list_cash_payout_destinations'),
      false,
    );
    assert.equal(
      migration.includes('CREATE OR REPLACE FUNCTION private.resolve_live_payout_destination'),
      false,
    );
  });

  it('does not write wallets, withdrawals, or payout requests', () => {
    for (const forbidden of [
      'apply_wallet_entry',
      'private.wallet_ledger',
      'private.wallet_accounts',
      'private.player_withdrawal_requests',
      'private.cashier_player_payout_requests',
      'player_request_cashier_payout',
      'player_create_withdrawal',
      'available_balance =',
      'SET migration_state',
    ]) {
      assert.equal(migration.includes(forbidden), false, forbidden);
    }
    assert.match(migration, /REVOKE ALL ON FUNCTION private\.register_eligible_cashier_payout_destination\(UUID\) FROM anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.register_eligible_cashier_payout_destination\(UUID\) TO service_role/);
  });

  it('registers again when an active operational account is inserted or a frozen cashier is restored', () => {
    assert.match(
      migration,
      /AFTER INSERT ON private\.operational_accounts[\s\S]*NEW\.account_type = 'cashier'[\s\S]*NEW\.status = 'active'[\s\S]*NEW\.migration_state = 'active'[\s\S]*EXECUTE FUNCTION private\.cashier_payout_destination_on_account\(\)/,
    );
    assert.match(
      migration,
      /AFTER UPDATE OF is_active ON public\.cashiers[\s\S]*NEW\.is_active IS TRUE AND OLD\.is_active IS DISTINCT FROM TRUE[\s\S]*EXECUTE FUNCTION private\.cashier_payout_destination_on_activation\(\)/,
    );
    assert.equal(migration.includes('AFTER UPDATE ON private.operational_accounts'), false);
    assert.equal(migration.includes('AFTER INSERT ON private.wallet_ledger'), false);
  });
});
