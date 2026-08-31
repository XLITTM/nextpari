import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from './errors.js';
import {
  provisionAuthThenBind,
  rejectForbiddenStaffCreateFields,
} from './staffHierarchyService.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260901_025_staff_hierarchy_control.sql'),
  'utf8',
);

describe('staff hierarchy SQL contract (not executed)', () => {
  it('defines Owner/Manager JWT RPCs with SECURITY DEFINER and empty search_path', () => {
    for (const name of [
      'public.owner_list_managers()',
      'public.owner_manager_detail(p_manager_id UUID)',
      'public.owner_provision_manager(',
      'public.manager_provision_cashier(',
    ]) {
      assert.match(migration, new RegExp(name.replace(/[()]/g, '\\$&')));
    }
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = ''/);
    assert.match(migration, /private\.get_current_owner_context\(\)/);
    assert.match(migration, /private\.get_current_manager_context\(\)/);
    assert.match(migration, /private\.staff_assert_fresh_auth_user/);
    assert.match(migration, /OWNER_CREATED_MANAGER/);
    assert.match(migration, /MANAGER_CREATED_CASHIER/);
  });

  it('creates new operational accounts at zero active without opening ledger or live updates', () => {
    assert.match(migration, /0,\s*\n\s*'active',\s*\n\s*'active'/);
    assert.equal(/UPDATE[\s\S]*migration_state\s*=/.test(migration), false);
    assert.equal(migration.includes('SET migration_state'), false);
    assert.equal(migration.includes('apply_operational_transfer'), false);
    assert.equal(migration.includes('apply_wallet_entry'), false);
    assert.equal(migration.includes('GRANT EXECUTE ON FUNCTION public.manager_create_cashier'), false);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.manager_create_cashier/);
    assert.match(migration, /staff_unusable_legacy_pin_hash/);
    assert.equal(migration.includes('manager_login'), false);
    assert.equal(migration.includes('cashier_login'), false);
  });

  it('does not accept browser-selected network or starting float', () => {
    const provision = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.manager_provision_cashier'),
      migration.indexOf('REVOKE ALL ON FUNCTION public.owner_list_managers'),
    );
    assert.equal(provision.includes('p_network_id'), false);
    assert.equal(provision.includes('p_manager_id'), false);
    assert.equal(provision.includes('p_float'), false);
    assert.equal(provision.includes('starting'), false);
    assert.match(provision, /v_ctx\.network_id/);
  });
});

describe('staff hierarchy BFF helpers', () => {
  it('rejects starting balance / network / PIN fields before Auth create', () => {
    assert.throws(() => rejectForbiddenStaffCreateFields({ floatBalance: 10 }), /FIELD_FORBIDDEN/);
    assert.throws(() => rejectForbiddenStaffCreateFields({ networkId: 'x' }), /FIELD_FORBIDDEN/);
    assert.throws(() => rejectForbiddenStaffCreateFields({ pin: '1234' }), /FIELD_FORBIDDEN/);
    const ok = rejectForbiddenStaffCreateFields({ login: 'manager02', email: 'a@b.c' });
    assert.equal(ok.login, 'manager02');
  });

  it('compensates Auth user when bind/DB fails and never logs password', async () => {
    const deleted: string[] = [];
    await assert.rejects(
      () =>
        provisionAuthThenBind(
          {
            email: 'manager02@example.com',
            temporaryPassword: 'temporary-pass-12',
            bind: async () => {
              throw staffError('LOGIN_TAKEN', 409);
            },
          },
          {
            admin: {
              async createUser() {
                return { id: 'auth-comp-1' };
              },
              async deleteUser(id) {
                deleted.push(id);
              },
            },
          },
          { error() {} },
        ),
      /LOGIN_TAKEN/,
    );
    assert.deepEqual(deleted, ['auth-comp-1']);
  });

  it('reuses idempotency key for the same unchanged action', () => {
    const retain = (
      slot: { key: string; fingerprint: string } | null,
      fingerprint: string,
    ) => (slot && slot.fingerprint === fingerprint ? slot : { key: 'k1', fingerprint });
    const first = { key: 'k1', fingerprint: '110790:10' };
    assert.equal(retain(first, '110790:10').key, 'k1');
    assert.equal(retain(first, '110790:20').fingerprint, '110790:20');
  });

  it('cashier money UI gate matches active operational account only', () => {
    const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
    const services = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');
    assert.match(services, /activationPending === false/);
    assert.match(services, /migrationState[\s\S]{0,40}active/);
    assert.match(screen, /isCashierFinanceEnabled/);
    assert.match(screen, /retainIdempotencyKey/);
  });

  it('owner and cashier UIs use canonical routes without legacy money RPC or impersonation', () => {
    const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const panel = readFileSync(join(root, 'src/owner/OwnerManagersPanel.tsx'), 'utf8');
    const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
    const agents = readFileSync(join(root, 'src/pages/manager/ManagerAgentsPage.tsx'), 'utf8');
    const layout = readFileSync(join(root, 'src/pages/manager/ManagerOfficeLayout.tsx'), 'utf8');
    assert.equal(dashboard.includes('MigrationPending'), false);
    assert.match(panel, /fetchOwnerManagers/);
    assert.match(panel, /postOwnerManager/);
    assert.equal(panel.includes('/api/manager/auth/login'), false);
    assert.equal(panel.includes('password'), true);
    assert.equal(panel.includes('startingBalance'), false);
    assert.match(screen, /postCashierDeposit/);
    assert.match(screen, /Финансовые операции активны/);
    assert.match(screen, /deadbeefcafebabe/);
    assert.equal(screen.includes('cashier_deposit_to_player'), false);
    assert.match(agents, /Добавить кассира/);
    assert.equal(agents.includes('manager_create_cashier'), false);
    assert.equal(layout.includes('staging · 0 TMT'), false);
  });
});
