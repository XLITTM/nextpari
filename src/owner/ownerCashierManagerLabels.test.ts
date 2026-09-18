import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  filterOwnerCashiersByManager,
  ownerCashierManagerDisplay,
  ownerCashierManagerFilterLabel,
  ownerManagerLookup,
} from './services.ts';

const UUID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const OTHER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const here = dirname(fileURLToPath(import.meta.url));

const lookup = ownerManagerLookup([
  { managerId: UUID, fullName: 'Мерет Аннаев', login: 'manager01' },
  { managerId: 'login-only', fullName: '  ', login: 'agentmgr' },
]);

describe('owner cashier manager labels', () => {
  it('shows human-readable manager identity and never uses UUID as the label', () => {
    const linked = ownerCashierManagerDisplay(UUID, lookup);
    assert.equal(linked.primary, 'Мерет Аннаев');
    assert.equal(linked.secondary, '@manager01');
    assert.equal(linked.primary.includes(UUID), false);
    assert.equal(String(linked.secondary).includes(UUID), false);

    const loginOnly = ownerCashierManagerDisplay('login-only', lookup);
    assert.equal(loginOnly.primary, 'agentmgr');
    assert.equal(loginOnly.secondary, '@agentmgr');
  });

  it('shows Владелец (Прямой) when managerId is missing', () => {
    assert.deepEqual(ownerCashierManagerDisplay(null, lookup), {
      primary: 'Владелец (Прямой)',
      secondary: null,
    });
    assert.deepEqual(ownerCashierManagerDisplay('', lookup), {
      primary: 'Владелец (Прямой)',
      secondary: null,
    });
  });

  it('does not expose UUID when a non-null managerId cannot be resolved', () => {
    const unresolved = ownerCashierManagerDisplay(OTHER, lookup);
    assert.equal(unresolved.primary, 'Менеджер');
    assert.equal(unresolved.secondary, null);
    assert.equal(unresolved.primary.includes(OTHER), false);
  });

  it('uses a human-readable filter label while keeping managerId as the option value', () => {
    const label = ownerCashierManagerFilterLabel(UUID, lookup);
    assert.equal(label, 'Мерет Аннаев · @manager01');
    assert.equal(label.includes(UUID), false);
    assert.equal(ownerCashierManagerFilterLabel(OTHER, lookup), 'Менеджер');
    assert.equal(ownerCashierManagerFilterLabel(OTHER, lookup).includes(OTHER), false);

    const ui = readFileSync(join(here, 'ManagerDashboardScreen.tsx'), 'utf8');
    assert.match(ui, /fetchOwnerManagers/);
    assert.match(ui, /ownerManagerLookup/);
    assert.match(ui, /ownerCashierManagerDisplay/);
    assert.match(ui, /ownerCashierManagerFilterLabel/);
    assert.match(ui, /option\.id/);
    assert.match(ui, /option\.label/);
    assert.equal(ui.includes("{row.managerId || 'Владелец (Прямой)'}"), false);
    assert.equal(ui.includes('{id}\n            </option>'), false);
    assert.match(ui, /Все менеджеры \(Все кассы\)/);
    assert.match(ui, /fetchOwnerCashiers/);
  });

  it('keeps cashier filtering keyed by managerId', () => {
    const rows = [
      { id: 'c1', managerId: UUID },
      { id: 'c2', managerId: null },
      { id: 'c3', managerId: OTHER },
    ];
    assert.deepEqual(filterOwnerCashiersByManager(rows, '').map((row) => row.id), ['c1', 'c2', 'c3']);
    assert.deepEqual(filterOwnerCashiersByManager(rows, UUID).map((row) => row.id), ['c1']);
    assert.deepEqual(filterOwnerCashiersByManager(rows, OTHER).map((row) => row.id), ['c3']);
  });
});
