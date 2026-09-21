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
    async signOutCurrentSession() {},
    async currentStaffContext() {
      return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
    },
  };
}

function managerPorts(): ManagerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async signOutCurrentSession() {},
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
    async signOutCurrentSession() {},
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

async function ownerGet(
  pathname: string,
  invoke?: (name: string, args?: Record<string, unknown>) => unknown,
) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const result = await handleOwnerControlRequest(
    { method: 'GET', pathname, cookie: ownerCookie(), cookieSecure: true },
    {
      sessionPorts: ownerPorts(),
      rpcFactory: (): OwnerRpcPort => ({
        async invoke(name, args) {
          calls.push({ name, args });
          if (invoke) return invoke(name, args);
          return { ok: true, rpc: name };
        },
      }),
    },
  );
  return { result, calls };
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
    assert.equal(parseOperationalDisplayCurrency('TMTM'), null);
    assert.equal(parseOperationalDisplayCurrency('RUB'), 'RUB');
    assert.equal(parseOperationalDisplayCurrency('USD'), 'USD');
    assert.equal(parseOperationalDisplayCurrency('TRY'), 'TRY');
    assert.equal(parseOperationalDisplayCurrency('UZS'), 'UZS');
    assert.equal(parseOperationalDisplayCurrency('KZT'), 'KZT');
    assert.equal(parseOperationalDisplayCurrency('USDT'), null);
    assert.equal(parseOperationalDisplayCurrency('EUR'), null);
    assert.equal(parseOperationalDisplayCurrency('ABC'), null);
    assert.equal(parseOperationalDisplayCurrency(''), null);
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

describe('phase 058 final pre-merge hardening', () => {
  it('1-6. cashier reverse uses original transfer currency, not TMT-only resolver', () => {
    const reverse = functionSql('public.cashier_reverse_player_deposit');
    const deposit = functionSql('public.cashier_deposit_player_currency');
    assert.match(reverse, /get_current_cashier_context_locked/);
    assert.match(reverse, /TRANSFER_ID_REQUIRED/);
    assert.match(reverse, /REASON_REQUIRED/);
    assert.match(reverse, /owner_require_idempotency_key/);
    assert.match(reverse, /nextpari:cashier-deposit-reversal:/);
    assert.match(reverse, /FOR UPDATE/);
    assert.match(reverse, /transfer_type IS DISTINCT FROM 'CASHIER_TO_PLAYER'/);
    assert.match(reverse, /actor_user_id IS DISTINCT FROM v_ctx\.auth_user_id/);
    assert.match(reverse, /player_wallet_id IS NULL/);
    assert.match(reverse, /resolve_cashier_currency_account\(/);
    assert.match(reverse, /from_account_id IS DISTINCT FROM v_cashier_account/);
    assert.match(reverse, /INTERVAL '5 minutes'/);
    assert.match(reverse, /operation_type = 'CASH_DEPOSIT'/);
    assert.match(reverse, /cashier_deposit_reversals/);
    assert.match(reverse, /apply_operational_transfer/);
    assert.match(reverse, /'CASHIER_DEPOSIT_REVERSAL'/);
    assert.match(reverse, /v_cashier_account,/);
    assert.match(reverse, /v_orig\.player_wallet_id/);
    assert.match(reverse, /'cashier-deposit-reversal:' \|\| v_ctx\.auth_user_id::TEXT \|\| ':' \|\| v_key/);
    assert.equal(reverse.includes("':' || v_storage || ':'"), false);
    assert.equal(reverse.includes('cashier_resolve_own_operational_account'), false);
    assert.equal(reverse.includes('player_wallet_preferences'), false);
    assert.equal(reverse.includes('active_wallet'), false);
    assert.equal(/FX|exchange_rate|CONVERT/i.test(reverse), false);
    assert.match(reverse, /private\.operational_display_currency\(v_orig\.currency\)/);
    assert.match(reverse, /'currency', v_display/);
    assert.equal(reverse.includes("'currency', v_orig.currency"), false);
    assert.match(deposit, /IF v_storage = 'TMTM' THEN\s+RETURN public\.cashier_deposit_player/);
    assert.match(functionSql('private.cashier_resolve_own_operational_account'), /a\.currency = 'TMTM'/);
  });

  it('7-9. owner capital-in restores NOTE_REQUIRED and keeps legacy identity', () => {
    const legacy = functionSql('public.owner_capital_in');
    const currency = functionSql('public.owner_capital_in_currency');
    assert.equal(legacy.includes('p_note TEXT DEFAULT NULL'), false);
    assert.match(legacy, /v_note := private\.owner_trim_reason\(p_note\);\s+IF v_note IS NULL THEN\s+RAISE EXCEPTION 'NOTE_REQUIRED'/);
    assert.match(legacy, /v_key := private\.owner_require_idempotency_key\(p_idempotency_key\)/);
    assert.match(legacy, /v_key,/);
    assert.equal(legacy.includes('owner-capital-in:'), false);
    assert.match(legacy, /resolve_company_treasury\('TMTM', TRUE\)/);
    assert.match(legacy, /'CAPITAL_IN'/);
    assert.equal(/FX|exchange_rate|CONVERT/i.test(legacy), false);
    assert.match(currency, /IF v_storage = 'TMTM' THEN\s+RETURN public\.owner_capital_in/);
    assert.match(currency, /RAISE EXCEPTION 'NOTE_REQUIRED'/);
  });

  it('10-12. public 058 responses expose display TMT, never TMTM or storage_currency', () => {
    const overview = functionSql('public.owner_treasury_overview');
    const lookup = functionSql('public.cashier_lookup_player_payout');
    const reverse = functionSql('public.cashier_reverse_player_deposit');
    assert.equal(overview.includes("'storage_currency'"), false);
    assert.equal(overview.includes('storage_currency'), false);
    assert.match(overview, /'currency', private\.operational_display_currency\(a\.currency\)/);
    assert.match(lookup, /'currency', private\.operational_display_currency\(v_req\.currency\)/);
    assert.match(reverse, /'currency', v_display/);
    for (const name of [
      'public.owner_capital_in',
      'public.owner_capital_in_currency',
      'public.owner_fund_manager',
      'public.owner_fund_manager_currency',
      'public.owner_fund_cashier',
      'public.owner_fund_cashier_currency',
      'public.manager_operational_overview',
      'public.manager_fund_cashier_currency',
      'public.manager_collect_cashier_currency',
      'public.cashier_operational_overview',
      'public.cashier_list_operational_transfers',
      'public.cashier_deposit_player_currency',
      'public.cashier_confirm_player_payout',
    ]) {
      const body = functionSql(name);
      assert.equal(body.includes("'storage_currency'"), false, name);
      assert.equal(body.includes("'currency', a.currency"), false, name);
      assert.equal(body.includes("'currency', v_orig.currency"), false, name);
      assert.equal(body.includes("'currency', v_req.currency"), false, name);
      assert.equal(body.includes("'currency', 'TMTM'"), false, name);
    }
  });

  it('13-15. new operational inputs are display codes; TMTM is rejected', () => {
    const requireFn = functionSql('private.require_operational_storage_currency');
    assert.match(requireFn, /p_display_code TEXT/);
    assert.match(requireFn, /WHERE c\.code = v_display/);
    assert.match(requireFn, /v_display = '' OR v_display = 'TMTM'/);
    assert.match(requireFn, /RAISE EXCEPTION 'CURRENCY_UNSUPPORTED'/);
    assert.match(requireFn, /RAISE EXCEPTION 'OPERATIONAL_CURRENCY_DISABLED'/);
    assert.equal(requireFn.includes('wallet_storage_currency'), false);
    assert.equal(sql058.includes('CREATE OR REPLACE FUNCTION private.wallet_storage_currency'), false);
  });

  it('16-18. inactive manager cannot receive a new zero currency account', () => {
    const add = functionSql('public.owner_add_manager_currency');
    assert.match(add, /IF v_manager\.is_active IS DISTINCT FROM TRUE THEN\s+RAISE EXCEPTION 'MANAGER_NOT_ACTIVE'/);
    assert.match(add, /insert_zero_operational_account/);
    assert.match(add, /'available_balance', 0/);
    const insert = functionSql('private.insert_zero_operational_account');
    assert.equal(insert.includes('apply_operational_transfer'), false);
    assert.match(insert, /p_network_id,\s+0,/);
  });

  it('HTTP capital-in blank note is NOTE_REQUIRED; TMTM input is CURRENCY_UNSUPPORTED', async () => {
    const blank = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'RUB',
      amount: '100000',
      idempotencyKey: 'cap-blank',
      note: '   ',
    });
    assert.equal(blank.result.status, 400);
    assert.equal(blank.result.body.error, 'NOTE_REQUIRED');
    const missing = await ownerPost('/api/owner/treasury', {
      amount: 10,
      idempotencyKey: 'cap-legacy-blank',
      note: '',
    });
    assert.equal(missing.result.status, 400);
    assert.equal(missing.result.body.error, 'NOTE_REQUIRED');
    const tmtm = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'TMTM',
      amount: '10.00',
      idempotencyKey: 'cap-tmtm',
      note: 'seed',
    });
    assert.equal(tmtm.result.status, 400);
    assert.equal(tmtm.result.body.error, 'CURRENCY_UNSUPPORTED');
    const tmt = await ownerPost('/api/owner/treasury/capital-in', {
      currency: 'TMT',
      amount: '10.50',
      idempotencyKey: 'legacy-key-1',
      note: 'tmt',
    });
    assert.equal(tmt.rpc.calls[0]?.name, 'owner_capital_in');
    for (const currency of ['RUB', 'USD', 'TRY', 'UZS', 'KZT']) {
      const ok = await ownerPost('/api/owner/treasury/capital-in', {
        currency,
        amount: '1.00',
        idempotencyKey: `cap-${currency}`,
        note: 'seed',
      });
      assert.equal(ok.result.status, 200, currency);
      assert.equal(ok.rpc.calls[0]?.args?.p_currency, currency);
    }
    const cashierTmtm = await cashierPost('/api/cashier/deposits', {
      playerPublicId: PLAYER_PUBLIC,
      currency: 'TMTM',
      amount: '5000',
      idempotencyKey: 'dep-tmtm',
    });
    assert.equal(cashierTmtm.result.status, 400);
    assert.equal(cashierTmtm.result.body.error, 'CURRENCY_UNSUPPORTED');
  });

  it('treasury overview and payout/reversal HTTP never leak TMTM', async () => {
    const treasury = await ownerGet('/api/owner/treasury', () => ({
      treasury: { currency: 'TMTM', available_balance: 0, status: 'active', migration_state: 'active', version: 1 },
      accounts: [{ currency: 'TMTM', storage_currency: 'TMTM', available_balance: 0 }],
      by_currency: [{ currency: 'TMTM', treasury_balance: 0 }],
      recent_transfers: [{ id: 't1', currency: 'TMTM', amount: 1 }],
    }));
    const dumped = JSON.stringify(treasury.result.body);
    assert.equal(dumped.includes('TMTM'), false);
    assert.equal(dumped.includes('storage_currency'), false);
    assert.match(dumped, /"currency":"TMT"/);

    const payout = await handleCashierControlRequest(
      {
        method: 'GET',
        pathname: '/api/cashier/payouts/0123456789abcdef',
        cookie: cashierCookie(),
        cookieSecure: true,
      },
      {
        sessionPorts: cashierPorts(),
        rpcFactory: () => ({
          async invoke() {
            return { ok: true, player_public_id: PLAYER_PUBLIC, amount: 150, currency: 'TMTM', status: 'pending' };
          },
        }),
      },
    );
    assert.equal(payout.status, 200);
    assert.equal((payout.body.data as { currency: string }).currency, 'TMT');
    assert.equal(JSON.stringify(payout.body).includes('TMTM'), false);

    const reverse = await handleCashierControlRequest(
      {
        method: 'POST',
        pathname: '/api/cashier/deposits/11111111-1111-4111-8111-111111111111/reverse',
        cookie: cashierCookie(),
        cookieSecure: true,
        body: { idempotencyKey: 'rev-tmt', reason: 'ошибка' },
      },
      {
        sessionPorts: cashierPorts(),
        rpcFactory: () => ({
          async invoke() {
            return {
              ok: true,
              original_transfer_id: '11111111-1111-4111-8111-111111111111',
              reversal_transfer_id: '22222222-2222-4222-8222-222222222222',
              amount: 10,
              currency: 'TMTM',
              player_public_id: PLAYER_PUBLIC,
            };
          },
        }),
      },
    );
    assert.equal(reverse.status, 200);
    assert.equal((reverse.body.data as { currency: string }).currency, 'TMT');
    assert.equal(JSON.stringify(reverse.body).includes('TMTM'), false);
  });
});

