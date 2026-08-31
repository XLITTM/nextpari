import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CASHIER_DEPOSITS_PATH,
  CASHIER_FINANCE_PATH,
  CASHIER_TRANSFERS_PATH,
  fetchCashierFinance,
  parseCashierFinance,
} from './services';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const services = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'services.ts'), 'utf8');

describe('cashier browser finance client', () => {
  it('parses canonical 3550 balance from finance payload', () => {
    const parsed = parseCashierFinance({
      ok: true,
      data: {
        cashier: { cashierId: '0393d651-e13a-4f04-ba7d-352f63bc62a5', fullName: 'Азат Мередов' },
        operational: { availableBalance: 3550, migrationState: 'staging' },
        activationPending: true,
      },
    });
    assert.equal(parsed?.operational.availableBalance, 3550);
    assert.equal(parsed?.cashier.fullName, 'Азат Мередов');
  });

  it('does not coerce missing balance to 0', () => {
    const parsed = parseCashierFinance({
      ok: true,
      data: {
        cashier: { cashierId: 'x' },
        operational: { accountId: 'y' },
      },
    });
    assert.equal(parsed?.operational.availableBalance, null);
  });

  it('fetchCashierFinance throws instead of inventing 0', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'FINANCE_RPC_UNAVAILABLE' }), { status: 503 });
    await assert.rejects(() => fetchCashierFinance(fetchFn), /FINANCE_RPC_UNAVAILABLE/);
  });

  it('prepared deposit/payout clients exist but UI does not call them', () => {
    assert.match(services, /CASHIER_DEPOSITS_PATH/);
    assert.equal(CASHIER_DEPOSITS_PATH, '/api/cashier/deposits');
    assert.match(services, /postCashierDeposit/);
    assert.match(services, /postCashierPayoutConfirm/);
  });

  it('calls same-origin finance and transfers only', async () => {
    const urls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({
        ok: true,
        data: {
          cashier: { cashierId: 'c1', fullName: 'Азат Мередов' },
          operational: { availableBalance: 3550, migrationState: 'staging' },
          rows: [],
          total: 0,
        },
      }), { status: 200 });
    };
    const finance = await fetchCashierFinance(fetchFn);
    assert.equal(finance.operational.availableBalance, 3550);
    assert.equal(urls[0], CASHIER_FINANCE_PATH);
    assert.equal(CASHIER_TRANSFERS_PATH, '/api/cashier/transfers');
  });
});
