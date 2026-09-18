import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isOperationalAccountActive } from '../shared/staff/financeGate.ts';
import {
  formatTmtmCompact,
  ownerCashierManagerDisplay,
  ownerCashierOperationalDisplay,
  parseOwnerCashier,
} from './services.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sqlPath = 'supabase/migrations/20260918184419_owner_direct_cashier_operational_visibility_063.sql';
const sql063 = readFileSync(join(root, sqlPath), 'utf8');
const ui = readFileSync(join(here, 'ManagerDashboardScreen.tsx'), 'utf8');

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

describe('owner direct cashier operational visibility 063', () => {
  it('is a read-only 063 migration after 062 and does not mutate money or migration_state', () => {
    assert.equal(existsSync(join(root, sqlPath)), true);
    assert.match(sql063, /NEXTPARI PHASE 063/);
    assert.match(sql063, /after 062/);
    assert.match(sql063, /DO NOT APPLY/);
    assert.equal(sql063.includes('DROP TABLE'), false);
    assert.equal(sql063.includes('DELETE FROM'), false);
    assert.equal(sql063.includes('INSERT INTO'), false);
    assert.equal(/UPDATE\s+/.test(sql063), false);
    assert.equal(sql063.includes('apply_operational_transfer'), false);
    assert.equal(sql063.includes('apply_wallet_entry'), false);
    assert.equal(sql063.includes('SET migration_state'), false);
    assert.equal(sql063.includes('available_balance ='), false);
    assert.equal(sql063.includes('float_balance ='), false);
  });

  it('owner_list_cashiers returns canonical TMT operational fields for every cashier', () => {
    const owner = extractFn(sql063, 'public.owner_list_cashiers(');
    assert.match(owner, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(owner, /LEFT JOIN private\.operational_accounts AS op/);
    assert.match(owner, /op\.account_type = 'cashier'/);
    assert.match(owner, /op\.legacy_cashier_id = c\.id/);
    assert.match(owner, /op\.network_id IS NOT DISTINCT FROM c\.network_id/);
    assert.match(owner, /op\.currency = 'TMTM'/);
    assert.match(owner, /op\.available_balance AS operational_balance/);
    assert.match(owner, /op\.status AS operational_status/);
    assert.match(owner, /op\.migration_state AS operational_migration_state/);
    assert.match(owner, /op\.currency AS operational_currency/);
    assert.match(owner, /AS manager_id/);
    assert.equal(owner.includes('public.manager_list_cashiers'), false);
    assert.equal(owner.includes('float_balance AS operational_balance'), false);
  });

  it('parses manager-owned and direct-owner cashier operational balances', () => {
    const managed = parseOwnerCashier({
      id: 'c-managed',
      login: 'agent01',
      full_name: 'Agent One',
      manager_id: 'ccc5f5ad-079e-4420-9080-e7ded4ff9496',
      operational_balance: 1500,
      operational_status: 'active',
      operational_migration_state: 'active',
      operational_currency: 'TMTM',
    });
    assert.equal(managed.operationalBalance, 1500);
    assert.equal(managed.managerId, 'ccc5f5ad-079e-4420-9080-e7ded4ff9496');
    const managedView = ownerCashierOperationalDisplay(managed);
    assert.equal(managedView.balanceLabel, formatTmtmCompact(1500));
    assert.equal(managedView.pendingActivation, false);
    assert.equal(isOperationalAccountActive({
      status: managed.operationalStatus,
      migrationState: managed.operationalMigrationState,
    }), true);

    const direct = parseOwnerCashier({
      id: 'c-direct',
      login: 'agent02',
      full_name: 'Direct Cashier',
      manager_id: null,
      operational_balance: 2800,
      operational_status: 'active',
      operational_migration_state: 'staging',
      operational_currency: 'TMTM',
    });
    assert.equal(direct.managerId, null);
    assert.equal(direct.operationalBalance, 2800);
    const directView = ownerCashierOperationalDisplay(direct);
    assert.equal(directView.balanceLabel, formatTmtmCompact(2800));
    assert.match(directView.balanceLabel, /2800|2\s800/);
    assert.equal(directView.pendingActivation, true);
    assert.equal(ownerCashierManagerDisplay(direct.managerId, {}).primary, 'Владелец (Прямой)');
    assert.equal(isOperationalAccountActive({
      status: direct.operationalStatus,
      migrationState: direct.operationalMigrationState,
    }), false);

    const missing = parseOwnerCashier({
      id: 'c-missing',
      login: 'agent03',
      full_name: 'No Account',
      manager_id: null,
    });
    assert.equal(missing.operationalBalance, null);
    assert.deepEqual(ownerCashierOperationalDisplay(missing), {
      balanceLabel: 'недоступен',
      pendingActivation: false,
    });
  });

  it('keeps owner cashier table on list data, pending badge, and disabled staging fund', () => {
    assert.match(ui, /ownerCashierOperationalDisplay/);
    assert.match(ui, /Ожидает активации/);
    assert.match(ui, /fetchOwnerCashiers/);
    assert.equal(ui.includes('fetchOwnerCashierOperationalMap'), false);
    assert.match(ui, /migrationState: row\.operationalMigrationState/);
    assert.match(ui, /isOperationalAccountActive/);
    assert.match(ui, /ownerCashierManagerDisplay/);
    assert.match(ui, /CashierManagerBadge/);
  });
});
