import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import type { OwnerRpcPort } from './ownerRpc.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import type { ManagerAuthGatewayPorts } from '../staff/managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import type { ManagerRpcPort } from '../manager/managerRpc.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import type { CashierRpcPort } from '../cashier/cashierRpc.js';
import { parseExactPositiveDecimal } from '../player/exactDecimal.js';
import { parseOperationalDisplayCurrency } from '../player/playerCurrency.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationsDir = join(root, 'supabase/migrations');
const sql058 = readFileSync(
  join(
    migrationsDir,
    readdirSync(migrationsDir).find((name) => name.endsWith('multi_currency_operational_treasury_058.sql')) ?? '',
  ),
  'utf8',
);
const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER_PUBLIC = '110790';

function functionSql(signature: string): string {
  const start = sql058.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  assert.equal(start >= 0, true, `missing ${signature}`);
  const end = sql058.indexOf('$fn$;', start);
  assert.equal(end > start, true, `missing body ${signature}`);
  return sql058.slice(start, end + 5);
}

function ownerCookie(): string {
  return `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`;
}

function managerCookie(): string {
  return `${MANAGER_ACCESS_COOKIE}=${ACCESS}; ${MANAGER_REFRESH_COOKIE}=${REFRESH}`;
}

function cashierCookie(): string {
  return `${CASHIER_ACCESS_COOKIE}=${ACCESS}; ${CASHIER_REFRESH_COOKIE}=${REFRESH}`;
}

function ownerPorts(): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async currentStaffContext() {
      return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
    },
  };
}

function managerPorts(): ManagerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async currentStaffContext() {
      return {
        role: 'manager',
        status: 'active',
        auth_user_id: 'manager-uid',
        display_name: 'Manager',
        network_id: NETWORK_ID,
        legacy_manager_account_id: MANAGER_ID,
      };
    },
  };
}

function cashierPorts(): CashierAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async currentStaffContext() {
      return {
        role: 'cashier',
        status: 'active',
        auth_user_id: 'cashier-uid',
        display_name: 'Cashier',
        network_id: NETWORK_ID,
        legacy_cashier_id: CASHIER_ID,
      };
    },
  };
}

function ownerRpc() {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ name, args });
      return { ok: true, rpc: name, args: args ?? null, currency: args?.p_currency ?? 'TMT' };
    },
  });
  return { calls, rpcFactory };
}

async function ownerPost(pathname: string, body: unknown) {
  const rpc = ownerRpc();
  const result = await handleOwnerControlRequest(
    { method: 'POST', pathname, cookie: ownerCookie(), cookieSecure: true, body },
    { sessionPorts: ownerPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

async function managerPost(pathname: string, body: unknown) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const result = await handleManagerControlRequest(
    { method: 'POST', pathname, cookie: managerCookie(), cookieSecure: true, body },
    {
      sessionPorts: managerPorts(),
      rpcFactory: (): ManagerRpcPort => ({
        async invoke(name, args) {
          calls.push({ name, args });
          return { ok: true, rpc: name, args: args ?? null };
        },
      }),
    },
  );
  return { result, calls };
}

async function cashierPost(pathname: string, body: unknown) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const result = await handleCashierControlRequest(
    { method: 'POST', pathname, cookie: cashierCookie(), cookieSecure: true, body },
    {
      sessionPorts: cashierPorts(),
      rpcFactory: (): CashierRpcPort => ({
        async invoke(name, args) {
          calls.push({ name, args });
          if (name === 'cashier_deposit_player' || name === 'cashier_deposit_player_currency') {
            return { ok: true, currency: name === 'cashier_deposit_player' ? 'TMT' : args?.p_currency, active_wallet_unchanged: true };
          }
          return { ok: true, rpc: name, args: args ?? null };
        },
      }),
    },
  );
  return { result, calls };
}

describe('phase 058 multi-currency operational treasury SQL', () => {
  it('1-3. preserves TMT treasury identity and seeds missing treasuries at zero without ledger money', () => {
    assert.match(sql058, /operational_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql058, /WHERE code IN \('TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'\)/);
    assert.match(sql058, /AND c\.wallet_currency_code IS DISTINCT FROM 'TMTM'/);
    assert.match(sql058, /wallet_currency_code,\s+0,/);
    const insert = functionSql('private.insert_zero_operational_account');
    assert.equal(insert.includes('apply_operational_transfer'), false);
    assert.match(insert, /p_network_id,\s+0,/);
    assert.equal(sql058.includes('UPDATE private.operational_accounts'), false);
    assert.equal(sql058.includes('UPDATE private.operational_ledger'), false);
    assert.equal(sql058.includes('UPDATE private.operational_transfers'), false);
  });

  it('4-7. uniqueness and duplicate-safe zero account creation', () => {
    assert.match(sql058, /operational_accounts_treasury_currency_uidx/);
    assert.match(sql058, /operational_accounts_manager_currency_uidx/);
    assert.match(sql058, /operational_accounts_cashier_currency_uidx/);
    assert.match(sql058, /OPERATIONAL_CURRENCY_ACCOUNT_ALREADY_EXISTS/);
    assert.match(sql058, /WHEN unique_violation THEN/);
    assert.equal(sql058.includes('INSERT INTO private.operational_accounts') && sql058.includes("account_type = 'manager'"), true);
    assert.match(functionSql('public.owner_add_manager_currency'), /insert_zero_operational_account/);
    assert.match(functionSql('public.owner_add_cashier_currency'), /insert_zero_operational_account/);
    assert.match(sql058, /MANAGER_CURRENCY_ACCOUNT_REQUIRED/);
    assert.match(functionSql('public.manager_add_cashier_currency'), /resolve_manager_currency_account/);
  });

  it('8-15. same-currency capital and funding only, no FX', () => {
    const capital = functionSql('public.owner_capital_in_currency');
    assert.match(capital, /require_operational_storage_currency/);
    assert.match(capital, /apply_operational_transfer/);
    assert.match(capital, /'CAPITAL_IN'/);
    assert.equal(/FX|exchange|CONVERT|USDT/i.test(capital), false);
    assert.match(capital, /IF v_storage = 'TMTM' THEN\s+RETURN public\.owner_capital_in/);
    assert.match(functionSql('public.owner_fund_manager_currency'), /resolve_manager_currency_account/);
    assert.match(functionSql('public.owner_fund_cashier_currency'), /resolve_cashier_currency_account/);
    assert.match(functionSql('public.manager_fund_cashier_currency'), /manager_resolve_own_cashier_currency/);
    assert.match(functionSql('public.manager_collect_cashier_currency'), /'CASHIER_TO_MANAGER'/);
    assert.match(sql058, /MANAGER_CURRENCY_ACCOUNT_REQUIRED/);
    assert.match(sql058, /CASHIER_CURRENCY_ACCOUNT_REQUIRED/);
    assert.equal(sql058.includes('TMT -> RUB') || sql058.includes('exchange_rate'), false);
  });

  it('16-22. cashier deposit/payout stay same-currency and TMT legacy stays TMTM-only', () => {
    const legacyResolver = functionSql('private.cashier_resolve_own_operational_account');
    assert.match(legacyResolver, /a\.currency = 'TMTM'/);
    const deposit = functionSql('public.cashier_deposit_player_currency');
    assert.match(deposit, /IF v_storage = 'TMTM' THEN\s+RETURN public\.cashier_deposit_player/);
    assert.match(deposit, /cashier_resolve_player_wallet_for_ops_currency/);
    assert.match(deposit, /active_wallet_unchanged/);
    assert.match(deposit, /apply_operational_transfer/);
    assert.match(deposit, /cashier_revalidate_legacy_cashier/);
    const payout = functionSql('public.cashier_confirm_player_payout');
    assert.match(payout, /CASHIER_CURRENCY_ACCOUNT_REQUIRED/);
    assert.match(payout, /CURRENCY_MISMATCH/);
    assert.match(payout, /resolve_cashier_currency_account/);
    assert.match(payout, /wallet_currencies_match/);
  });

  it('23-27. freeze is account-wide, overviews do not mix currencies, float_balance stays TMT', () => {
    assert.match(functionSql('private.manager_resolve_own_cashier_currency'), /CASHIER_NOT_ACTIVE/);
    assert.match(functionSql('public.cashier_deposit_player_currency'), /cashier_revalidate_legacy_cashier/);
    const overview = functionSql('public.owner_treasury_overview');
    assert.match(overview, /by_currency/);
    assert.match(overview, /manager_total/);
    assert.match(overview, /AND m\.currency = t\.currency/);
    assert.equal(overview.includes('treasury_balance + manager_total'), false);
    assert.match(functionSql('public.manager_operational_overview'), /manager_accounts/);
    assert.match(functionSql('public.cashier_operational_overview'), /'accounts'/);
    const float = functionSql('private.cashiers_keep_tmt_float_mirror');
    assert.match(float, /currency IN \('TMTM', 'TMT'\)/);
    assert.match(sql058, /Non-TMT operational balances must never be written here/);
  });

  it('28-32. legacy TMT idempotency unchanged; new keys are currency-aware; UI never TMTM', () => {
    const legacyCapital = functionSql('public.owner_capital_in');
    assert.match(legacyCapital, /v_key := private\.owner_require_idempotency_key\(p_idempotency_key\)/);
    assert.match(legacyCapital, /v_key,/);
    assert.equal(legacyCapital.includes('owner-capital-in:'), false);
    assert.match(functionSql('public.owner_capital_in_currency'), /owner-capital-in:' \|\| v_owner::TEXT \|\| ':' \|\| v_storage/);
    assert.match(functionSql('public.owner_fund_manager_currency'), /owner-fund-manager:' \|\| v_owner::TEXT \|\| ':' \|\| v_storage/);
    assert.match(functionSql('public.cashier_deposit_player_currency'), /cashier-deposit:' \|\| v_ctx\.auth_user_id::TEXT \|\| ':' \|\| v_storage/);
    assert.match(sql058, /private\.operational_display_currency/);
    assert.match(functionSql('public.owner_treasury_overview'), /operational_display_currency/);
    assert.match(functionSql('public.owner_treasury_overview'), /a\.currency = 'TMTM'/);
    const ui = [
      readFileSync(join(root, 'src/owner/OwnerMoneyControls.tsx'), 'utf8'),
      readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8'),
      readFileSync(join(root, 'src/pages/manager/ManagerFinancePage.tsx'), 'utf8'),
    ].join('\n');
    assert.match(ui, /Казна/);
    assert.match(ui, /Мои кассы/);
    assert.equal(/Сумма \(TMTM\)| TMTM игроку|formatTmtm\(/.test(ui), false);
    assert.equal(ui.includes('reduce((sum, row) => sum + row.availableBalance'), false);
  });
});

describe('phase 058 HTTP / exact decimal', () => {
  it('maps display currencies through the PHASE 057 mapper', () => {
    assert.equal(parseOperationalDisplayCurrency('tmt'), 'TMT');
    assert.equal(parseOperationalDisplayCurrency('TMTM'), 'TMT');
    assert.equal(parseOperationalDisplayCurrency('RUB'), 'RUB');
    assert.equal(parseOperationalDisplayCurrency('USDT'), null);
  });

  it('new currency amounts must be exact decimal strings', () => {
    assert.equal(parseExactPositiveDecimal('100000.00', 'AMOUNT_INVALID'), '100000.00');
    assert.throws(() => parseExactPositiveDecimal(100000, 'AMOUNT_INVALID'), /AMOUNT_INVALID/);
  });

  it('8. Owner Capital In RUB uses the new RPC and string amount', async () => {
    const { result, rpc } = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'RUB',
      amount: '100000',
      idempotencyKey: 'cap-rub-1',
      note: 'Стартовая рублёвая касса',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_capital_in_currency');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_currency: 'RUB',
      p_amount: '100000',
      p_idempotency_key: 'cap-rub-1',
      p_note: 'Стартовая рублёвая касса',
    });
  });

  it('28-29. TMT capital-in and legacy treasury POST keep owner_capital_in identity', async () => {
    const viaNew = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'TMT',
      amount: '10.50',
      idempotencyKey: 'legacy-key-1',
      note: 'tmt',
    });
    assert.equal(viaNew.rpc.calls[0]?.name, 'owner_capital_in');
    assert.equal(viaNew.rpc.calls[0]?.args?.p_idempotency_key, 'legacy-key-1');
    const viaLegacy = await ownerPost('/api/owner/treasury', {
      amount: 10.5,
      idempotencyKey: 'legacy-key-1',
      note: 'tmt',
    });
    assert.equal(viaLegacy.rpc.calls[0]?.name, 'owner_capital_in');
    assert.equal(viaLegacy.rpc.calls[0]?.args?.p_idempotency_key, 'legacy-key-1');
  });

  it('10-12. Owner same-currency funding; TMT still uses legacy RPCs', async () => {
    const rub = await ownerPost('/api/owner/fund/currency', {
      targetType: 'manager',
      targetId: MANAGER_ID,
      currency: 'RUB',
      amount: '100000',
      idempotencyKey: 'fund-rub-1',
    });
    assert.equal(rub.rpc.calls[0]?.name, 'owner_fund_manager_currency');
    const tmt = await ownerPost('/api/owner/fund/currency', {
      targetType: 'manager',
      targetId: MANAGER_ID,
      currency: 'TMT',
      amount: '100000',
      idempotencyKey: 'fund-tmt-1',
    });
    assert.equal(tmt.rpc.calls[0]?.name, 'owner_fund_manager');
    const cashier = await ownerPost('/api/owner/fund/currency', {
      targetType: 'cashier',
      targetId: CASHIER_ID,
      currency: 'RUB',
      amount: '50000',
      idempotencyKey: 'fund-cash-rub',
    });
    assert.equal(cashier.rpc.calls[0]?.name, 'owner_fund_cashier_currency');
  });

  it('creates manager/cashier currency accounts without money fields', async () => {
    const manager = await ownerPost(`/api/owner/managers/${MANAGER_ID}/currencies`, { currency: 'RUB' });
    assert.equal(manager.rpc.calls[0]?.name, 'owner_add_manager_currency');
    assert.equal(manager.rpc.calls[0]?.args?.p_currency, 'RUB');
    const cashier = await ownerPost(`/api/owner/cashiers/${CASHIER_ID}/currencies`, { currency: 'USD' });
    assert.equal(cashier.rpc.calls[0]?.name, 'owner_add_cashier_currency');
  });

  it('13. Manager RUB funding uses the currency RPC; TMT stays legacy', async () => {
    const rub = await managerPost(`/api/manager/cashiers/${CASHIER_ID}/fund`, {
      currency: 'RUB',
      amount: '25000',
      idempotencyKey: 'mgr-fund-rub',
    });
    assert.equal(rub.calls[0]?.name, 'manager_fund_cashier_currency');
    const tmt = await managerPost(`/api/manager/cashiers/${CASHIER_ID}/fund`, {
      amount: 10,
      idempotencyKey: 'mgr-fund-tmt',
    });
    assert.equal(tmt.calls[0]?.name, 'manager_fund_cashier');
  });

  it('16-18. Cashier RUB deposit uses currency RPC; omitted currency stays TMT-only', async () => {
    const rub = await cashierPost('/api/cashier/deposits', {
      playerPublicId: PLAYER_PUBLIC,
      currency: 'RUB',
      amount: '5000',
      idempotencyKey: 'dep-rub-1',
    });
    assert.equal(rub.result.status, 200);
    assert.equal(rub.calls[0]?.name, 'cashier_deposit_player_currency');
    assert.equal(rub.calls[0]?.args?.p_currency, 'RUB');
    assert.equal(rub.calls[0]?.args?.p_amount, '5000');
    const tmt = await cashierPost('/api/cashier/deposits', {
      playerPublicId: PLAYER_PUBLIC,
      amount: 10,
      idempotencyKey: 'dep-tmt-1',
    });
    assert.equal(tmt.calls[0]?.name, 'cashier_deposit_player');
    assert.equal('p_currency' in (tmt.calls[0]?.args ?? {}), false);
  });

  it('rejects numeric JSON amounts on new currency endpoints', async () => {
    const capital = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'RUB',
      amount: 100000,
      idempotencyKey: 'cap-num',
      note: 'no',
    });
    assert.equal(capital.result.status, 400);
    const deposit = await cashierPost('/api/cashier/deposits', {
      playerPublicId: PLAYER_PUBLIC,
      currency: 'RUB',
      amount: 5000,
      idempotencyKey: 'dep-num',
    });
    assert.equal(deposit.result.status, 400);
  });

  it('does not accept browser operational_account_id authority', async () => {
    const deposit = await cashierPost('/api/cashier/deposits', {
      playerPublicId: PLAYER_PUBLIC,
      currency: 'RUB',
      amount: '5000',
      idempotencyKey: 'dep-auth',
      operationalAccountId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });
    assert.equal(deposit.calls[0]?.name, 'cashier_deposit_player_currency');
    assert.equal('p_operational_account_id' in (deposit.calls[0]?.args ?? {}), false);
    assert.equal('operationalAccountId' in (deposit.calls[0]?.args ?? {}), false);
  });
});

describe('phase 058 HTTP error mapping', () => {
  it('surfaces staffError codes from owner currency RPCs', async () => {
    const result = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/managers/${MANAGER_ID}/currencies`,
        cookie: ownerCookie(),
        cookieSecure: true,
        body: { currency: 'RUB' },
      },
      {
        sessionPorts: ownerPorts(),
        rpcFactory: () => ({
          async invoke() {
            throw staffError('OPERATIONAL_CURRENCY_ACCOUNT_ALREADY_EXISTS', 409);
          },
        }),
      },
    );
    assert.equal(result.status, 409);
  });
});
