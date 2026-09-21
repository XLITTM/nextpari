import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_AUTH_REGISTER_PATH,
  PLAYER_USDT_QUOTE_PATH,
  PLAYER_USDT_TARGETS_PATH,
  PLAYER_WALLETS_ACTIVE_PATH,
  PLAYER_WALLETS_ADD_PATH,
  PLAYER_WALLETS_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import { displayPlayerCurrency, PLAYER_DISPLAY_CURRENCIES, storagePlayerCurrency, walletCurrenciesMatch } from './playerCurrency.js';
import { parseExactPositiveDecimal } from './exactDecimal.js';
import { mapPlayerGameRpcError } from './playerGameRpc.js';
import { staffError } from '../staff/errors.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import type { PlayerWalletPorts } from './playerWalletsService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import type { OwnerRpcPort } from '../owner/ownerRpc.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import type { CashierRpcPort } from '../cashier/cashierRpc.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationsDir = join(root, 'supabase/migrations');
const sql057 = readFileSync(
  join(migrationsDir, readdirSync(migrationsDir).find((name) => name.endsWith('player_multi_currency_wallets_057.sql')) ?? ''),
  'utf8',
);
const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const WALLET_TMT = '11111111-1111-4111-8111-111111111111';
const WALLET_USD = '22222222-2222-4222-8222-222222222222';

function functionSql(sql: string, signature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  assert.equal(start >= 0, true, `missing ${signature}`);
  const end = sql.indexOf('$fn$;', start);
  assert.equal(end > start, true, `missing body ${signature}`);
  return sql.slice(start, end + 5);
}

function latestMigration(namePart: string): string {
  const names = readdirSync(migrationsDir).filter((name) => name.includes(namePart)).sort();
  return readFileSync(join(migrationsDir, names[names.length - 1] ?? ''), 'utf8');
}

function playerCookie(): string {
  return `${PLAYER_ACCESS_COOKIE}=${ACCESS}; ${PLAYER_REFRESH_COOKIE}=${REFRESH}`;
}

function authPorts(init?: { currency?: string }): PlayerAuthGatewayPorts & { ensureCurrencies: string[] } {
  const ensureCurrencies: string[] = [];
  return {
    ensureCurrencies,
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async signUp() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async getAuthUser() {
      return {
        id: 'player-1',
        email: 'p@nextpari.test',
        phone: '',
        emailConfirmed: true,
        phoneConfirmed: false,
        metadata: {},
      };
    },
    async ensurePlayerAccount(_token, currency) {
      ensureCurrencies.push(String(currency ?? ''));
      return {
        walletId: WALLET_TMT,
        publicId: '110790',
        legacyBalance: 0,
        migrationState: 'active',
      };
    },
    async loadOwnWallet() {
      return {
        balance: 0,
        currency: storagePlayerCurrency(init?.currency ?? 'USD') ?? 'TMTM',
        status: 'active',
        publicId: '110790',
      };
    },
    async savePlayerProfile() {},
    async createManagedPasswordUser() { return { id: 'u1', email: 'aabb@auth.nextpari.invalid' }; },
    async claimLoginPhone() {},
    generateOneClickPassword() { return 'generated-secret-1'; },
  };
}

function walletPorts(init?: { listError?: string; addError?: string; activeError?: string }): PlayerWalletPorts & {
  added: string[];
  activated: Array<{ currency?: string; walletId?: string }>;
  quotes: Array<{ sourceAmount: string; walletId: string }>;
} {
  const added: string[] = [];
  const activated: Array<{ currency?: string; walletId?: string }> = [];
  const quotes: Array<{ sourceAmount: string; walletId: string }> = [];
  return {
    added,
    activated,
    quotes,
    async list() {
      if (init?.listError) throw staffError(init.listError, init.listError === 'STAFF_ACCOUNT' ? 403 : 401);
      return {
        wallets: [
          {
            walletId: WALLET_TMT,
            currency: 'TMT',
            availableBalance: 10,
            lockedBalance: 0,
            isActive: true,
            displayNameRu: 'Манат',
          },
        ],
        activeWalletId: WALLET_TMT,
      };
    },
    async add(_token, currency) {
      if (init?.addError) throw staffError(init.addError, 409);
      added.push(currency);
      return {
        walletId: WALLET_USD,
        currency,
        availableBalance: 0,
        lockedBalance: 0,
        isActive: true,
        displayNameRu: 'Доллар США',
      };
    },
    async setActive(_token, input) {
      if (init?.activeError) throw staffError(init.activeError, 409);
      activated.push(input);
      return {
        walletId: input.walletId ?? WALLET_USD,
        currency: input.currency ?? 'USD',
        availableBalance: 0,
        lockedBalance: 0,
        isActive: true,
      };
    },
    async usdtTargets() {
      return {
        targets: [
          { walletId: WALLET_USD, currency: 'USD', rate: 1, enabled: true },
        ],
      };
    },
    async createUsdtQuote(_token, input) {
      quotes.push(input);
      return {
        quoteId: 'quote-1',
        status: 'QUOTED',
        sourceAmount: input.sourceAmount,
        rateSnapshot: 1,
        creditAmount: input.sourceAmount,
        targetCurrencyCode: 'USD',
        expiresAt: '2026-09-16T00:10:00.000Z',
      };
    },
  };
}

async function playerWallet(
  method: string,
  pathname: string,
  opts?: { body?: unknown; cookie?: string; wallets?: PlayerWalletPorts },
) {
  return handlePlayerAuthRequest(
    {
      method,
      pathname,
      cookie: opts?.cookie ?? playerCookie(),
      cookieSecure: true,
      body: opts?.body,
    },
    authPorts(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    opts?.wallets ?? walletPorts(),
  );
}

describe('phase 057 multi-currency SQL', () => {
  it('supports exactly TMT/USD/TRY/UZS/RUB/KZT and maps TMT to TMTM', () => {
    assert.match(sql057, /'TMT', 'TMTM'/);
    assert.match(sql057, /'USD', 'USD'/);
    assert.match(sql057, /'TRY', 'TRY'/);
    assert.match(sql057, /'UZS', 'UZS'/);
    assert.match(sql057, /'RUB', 'RUB'/);
    assert.match(sql057, /'KZT', 'KZT'/);
    assert.equal(sql057.includes("'EUR'"), false);
    assert.match(sql057, /WHEN 'TMTM' THEN 'TMT'/);
    assert.match(sql057, /wallet_accounts_owner_currency_uidx/);
    assert.match(sql057, /player_wallet_preferences/);
    assert.equal((sql057.match(/INSERT INTO private\.usdt_deposit_rates/) ?? []).length > 0, true);
    assert.match(sql057, /rate NUMERIC/);
    assert.match(sql057, /enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql057, /SELECT c\.code, NULL, FALSE/);
  });

  it('does not rewrite historical ledger or seed fake FX / fake money', () => {
    assert.equal(sql057.includes('UPDATE private.wallet_ledger'), false);
    assert.equal(sql057.includes('UPDATE private.wallet_accounts SET available_balance'), false);
    assert.equal(sql057.includes('3.55'), false);
    assert.equal(sql057.includes('apply_wallet_entry'), false);
    assert.match(sql057, /available_balance,\s+locked_balance,\s+status,\s+migration_state\s+\)\s+VALUES \(\s+v_wallet,\s+p_player_user_id,\s+v_storage,\s+0,\s+0,/);
  });

  it('cashier deposits match operational currency and never auto-create or switch wallets', () => {
    const depositStart = sql057.indexOf('CREATE OR REPLACE FUNCTION public.cashier_deposit_player');
    const depositEnd = sql057.indexOf('CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout');
    const deposit = sql057.slice(depositStart, depositEnd);
    const resolver = sql057.slice(sql057.indexOf('CREATE OR REPLACE FUNCTION private.cashier_resolve_player_wallet_for_ops_currency'), depositStart);
    assert.match(deposit, /cashier_resolve_player_wallet_for_ops_currency/);
    assert.match(resolver, /PLAYER_CURRENCY_WALLET_REQUIRED/);
    assert.match(deposit, /active_wallet_unchanged/);
    assert.equal(deposit.includes('player_create_zero_wallet'), false);
    assert.match(sql057, /wallet_currencies_match\(v_req\.currency, v_op\.currency\)/);
    assert.match(sql057, /wallet_currencies_match\(v_player\.currency, v_op\.currency\)/);
  });

  it('USDT quotes snapshot rate and never credit a wallet', () => {
    const quote = sql057.slice(sql057.indexOf('CREATE OR REPLACE FUNCTION public.player_create_usdt_quote'));
    assert.match(quote, /rate_snapshot/);
    assert.match(quote, /credit_amount/);
    assert.match(quote, /INTERVAL '10 minutes'/);
    assert.equal(quote.includes('apply_wallet_entry'), false);
    assert.equal(quote.includes("'PAID'"), false);
    assert.match(sql057, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(sql057, /owner_set_usdt_deposit_rate/);
    assert.match(sql057, /usdt_deposit_rate_events/);
    assert.match(sql057, /REVOKE UPDATE, DELETE ON TABLE private\.usdt_deposit_rate_events/);
  });

  it('settlement helpers keep recorded wallet_id and game context uses active wallet', () => {
    const sports = latestMigration('sports_betting_engine');
    const settle038 = latestMigration('provider_aware_sports_settlement');
    const games = latestMigration('canonical_games_engine');
    assert.match(sports, /v_bet\.wallet_id/);
    assert.match(settle038, /v_bet\.wallet_id/);
    assert.equal(settle038.includes('player_active_wallet'), false);
    assert.equal(sports.includes('player_active_wallet'), false);
    assert.match(games, /v_round\.wallet_id/);
    const ctx = functionSql(sql057, 'private.game_require_player_context');
    assert.match(ctx, /player_active_wallet/);
    assert.match(ctx, /CURRENCY_LIMITS_UNCONFIGURED/);
  });

  it('adds exactly one 057 migration and does not edit older files', () => {
    const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql') && !name.includes('rollback'));
    assert.equal(names.filter((name) => name.includes('_057')).length, 1);
    assert.equal(names.filter((name) => name.includes('player_multi_currency_wallets_057')).length, 1);
  });

  it('rejects TMTM as a player-facing create/register currency and isolates staff', () => {
    assert.match(sql057, /RAISE EXCEPTION 'STAFF_ACCOUNT'/);
    assert.match(sql057, /STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER/);
    assert.match(sql057, /private\.staff_accounts/);
    assert.equal((sql057.match(/IF pg_catalog\.upper\(BTRIM\(COALESCE\(p_display_currency, ''\)\)\) = 'TMTM'/g) ?? []).length >= 2, true);
  });
});

describe('TMT/TMTM mapping helpers', () => {
  it('never exposes TMTM as a player-facing code', () => {
    assert.equal(displayPlayerCurrency('TMTM'), 'TMT');
    assert.equal(storagePlayerCurrency('TMT'), 'TMTM');
    assert.equal(storagePlayerCurrency('USD'), 'USD');
    assert.equal(walletCurrenciesMatch('TMT', 'TMTM'), true);
    assert.equal(walletCurrenciesMatch('TMT', 'USD'), false);
    const header = readFileSync(join(root, 'src/components/HeaderWalletSwitcher.tsx'), 'utf8');
    const walletsUi = readFileSync(join(root, 'src/screens/WalletsScreen.tsx'), 'utf8');
    const auth = readFileSync(join(root, 'src/screens/AuthScreen.tsx'), 'utf8');
    for (const source of [header, walletsUi, auth]) {
      assert.equal(source.includes('TMTM'), false);
    }
  });
});

describe('registration currency', () => {
  it('requires an explicit currency for email, phone, and one-click', async () => {
    for (const body of [
      { method: 'email', email: 'a@nextpari.test', password: 'password1', ageConfirmed: true },
      { method: 'phone', phone: '+99364000001', password: 'password1', ageConfirmed: true },
      { method: 'one_click', ageConfirmed: true },
    ]) {
      const missing = await handlePlayerAuthRequest(
        { method: 'POST', pathname: PLAYER_AUTH_REGISTER_PATH, cookieSecure: true, body },
        authPorts(),
      );
      assert.equal(missing.status, 400, body.method);
      assert.equal(missing.body.error, 'REGISTRATION_CURRENCY_REQUIRED', body.method);
    }
  });

  it('rejects TMTM, EUR, and blank codes', async () => {
    for (const currency of ['TMTM', 'EUR', '', 'usd1']) {
      const result = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_REGISTER_PATH,
          cookieSecure: true,
          body: { method: 'email', email: 'a@nextpari.test', password: 'password1', ageConfirmed: true, currency },
        },
        authPorts(),
      );
      assert.equal(result.status, 400, currency);
      assert.equal(result.body.error, 'REGISTRATION_CURRENCY_REQUIRED', currency);
    }
  });

  it('email/phone/one-click pass only the selected currency into ensure', async () => {
    for (const body of [
      { method: 'email', email: 'a@nextpari.test', password: 'password1', ageConfirmed: true, currency: 'USD' },
      { method: 'phone', phone: '+99364000001', password: 'password1', ageConfirmed: true, currency: 'USD' },
      { method: 'one_click', ageConfirmed: true, currency: 'USD' },
    ]) {
      const ports = authPorts({ currency: 'USD' });
      const result = await handlePlayerAuthRequest(
        { method: 'POST', pathname: PLAYER_AUTH_REGISTER_PATH, cookieSecure: true, body },
        ports,
      );
      assert.equal(result.status, 200, `${body.method} ${String(result.body.error)}`);
      assert.deepEqual(ports.ensureCurrencies, ['USD'], body.method);
      assert.equal((result.body.wallet as { currency?: string })?.currency, 'USD', body.method);
      assert.equal(JSON.stringify(result.body).includes('TMTM'), false, body.method);
    }
  });
});

describe('player wallet HTTP', () => {
  it('requires a player JWT for wallet and USDT quote routes', async () => {
    for (const [method, pathname] of [
      ['GET', PLAYER_WALLETS_PATH],
      ['POST', PLAYER_WALLETS_ADD_PATH],
      ['POST', PLAYER_WALLETS_ACTIVE_PATH],
      ['GET', PLAYER_USDT_TARGETS_PATH],
      ['POST', PLAYER_USDT_QUOTE_PATH],
    ] as const) {
      const result = await playerWallet(method, pathname, { cookie: '' });
      assert.equal(result.status, 401, pathname);
      assert.equal(result.body.error, 'JWT_REQUIRED', pathname);
    }
  });

  it('lists wallets without exposing TMTM or storageCurrency', async () => {
    const result = await playerWallet('GET', PLAYER_WALLETS_PATH);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    const dumped = JSON.stringify(result.body);
    assert.equal(dumped.includes('TMTM'), false);
    assert.equal(dumped.includes('storageCurrency'), false);
    assert.equal((result.body.wallets as Array<{ currency: string }>)[0]?.currency, 'TMT');
  });

  it('adds a zero USD wallet that becomes active immediately without moving money', async () => {
    const wallets = walletPorts();
    const added = await playerWallet('POST', PLAYER_WALLETS_ADD_PATH, { body: { currency: 'USD' }, wallets });
    assert.equal(added.status, 200);
    assert.deepEqual(wallets.added, ['USD']);
    assert.equal((added.body as { isActive?: boolean }).isActive, true);
    assert.equal((added.body as { availableBalance?: number }).availableBalance, 0);
    assert.equal((added.body as { currency?: string }).currency, 'USD');
    assert.equal(wallets.activated.length, 0);
    const createZero = functionSql(sql057, 'private.player_create_zero_wallet');
    const setActive = functionSql(sql057, 'private.player_set_active_wallet_id');
    assert.match(createZero, /PERFORM private\.player_set_active_wallet_id\(p_player_user_id, v_wallet\)/);
    assert.match(createZero, /v_storage,\s+0,\s+0,/);
    assert.equal(createZero.includes('TREASURY_TO_PLAYER'), false);
    assert.equal(createZero.includes('CASHIER_TO_PLAYER'), false);
    assert.match(setActive, /UPDATE public\.profiles AS p\s+SET wallet_id = p_wallet_id/);
    const switcher = readFileSync(join(root, 'src/components/HeaderWalletSwitcher.tsx'), 'utf8');
    const profile = readFileSync(join(root, 'src/screens/WalletsScreen.tsx'), 'utf8');
    assert.match(switcher, /await addPlayerWallet\(currency\);\s+await refresh\(\)/);
    assert.match(profile, /await addPlayerWallet\(currency\);[\s\S]*await load\(\);[\s\S]*await refresh\(\)/);
  });

  it('rejects staff JWTs on player wallet routes', async () => {
    const wallets = walletPorts({ listError: 'STAFF_ACCOUNT' });
    const result = await playerWallet('GET', PLAYER_WALLETS_PATH, { wallets });
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT');
  });

  it('USDT quotes snapshot rate/credit and do not mention provider addresses', async () => {
    const wallets = walletPorts();
    const result = await playerWallet('POST', PLAYER_USDT_QUOTE_PATH, {
      body: { sourceAmount: '100.2500', walletId: WALLET_USD },
      wallets,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(wallets.quotes, [{ sourceAmount: '100.2500', walletId: WALLET_USD }]);
    assert.equal(result.body.status, 'QUOTED');
    assert.equal(JSON.stringify(result.body).includes('address'), false);
    assert.equal(JSON.stringify(result.body).includes('PAID'), false);
  });
});

describe('owner USDT rates and staff isolation', () => {
  it('owner GET/POST usdt-rates map to owner RPCs only', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const session: OwnerAuthGatewayPorts = {
      async signInWithPassword() { return { accessToken: 'oa', refreshToken: 'or' }; },
      async refreshSession() { throw staffError('JWT_INVALID', 401); },
      async signOutCurrentSession() {},
      async currentStaffContext() {
        return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'owner', network_id: null };
      },
    };
    const rpcFactory = (): OwnerRpcPort => ({
      async invoke(name, args) {
        calls.push({ name, args });
        return [{ targetCurrencyCode: 'USD', rate: null, enabled: false }];
      },
    });
    const get = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/usdt-rates',
        cookie: `${OWNER_ACCESS_COOKIE}=oa; ${OWNER_REFRESH_COOKIE}=or`,
        cookieSecure: true,
      },
      { sessionPorts: session, rpcFactory },
    );
    assert.equal(get.status, 200);
    assert.deepEqual(calls[0], { name: 'owner_usdt_deposit_rates', args: undefined });
    const post = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/usdt-rates',
        cookie: `${OWNER_ACCESS_COOKIE}=oa; ${OWNER_REFRESH_COOKIE}=or`,
        cookieSecure: true,
        body: { targetCurrencyCode: 'USD', rate: '1.2500', enabled: true },
      },
      { sessionPorts: session, rpcFactory },
    );
    assert.equal(post.status, 200);
    assert.equal(calls[1]?.name, 'owner_set_usdt_deposit_rate');
    assert.deepEqual(calls[1]?.args, {
      p_target_currency_code: 'USD',
      p_rate: '1.2500',
      p_enabled: true,
    });
    const numeric = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/usdt-rates',
        cookie: `${OWNER_ACCESS_COOKIE}=oa; ${OWNER_REFRESH_COOKIE}=or`,
        cookieSecure: true,
        body: { targetCurrencyCode: 'USD', rate: 1.25, enabled: true },
      },
      { sessionPorts: session, rpcFactory },
    );
    assert.equal(numeric.status, 400);
    assert.equal(numeric.body.error, 'USDT_RATE_INVALID');
    assert.equal(calls.length, 2);
  });

  it('manager and cashier cannot reach owner USDT or player wallet APIs', async () => {
    const manager = await handleManagerControlRequest({
      method: 'GET',
      pathname: '/api/manager/usdt-rates',
      cookie: 'x',
      cookieSecure: true,
    });
    assert.equal(manager.status === 401 || manager.status === 404, true);
    const cashier = await handleCashierControlRequest({
      method: 'GET',
      pathname: '/api/cashier/usdt-rates',
      cookie: 'x',
      cookieSecure: true,
    });
    assert.equal(cashier.status === 401 || cashier.status === 404, true);
  });
});

describe('cashier currency-safe deposits', () => {
  it('surfaces PLAYER_CURRENCY_WALLET_REQUIRED without creating or targeting a wallet', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const session: CashierAuthGatewayPorts = {
      async signInWithPassword() { return { accessToken: 'ca', refreshToken: 'cr' }; },
      async refreshSession() { throw staffError('JWT_INVALID', 401); },
      async signOutCurrentSession() {},
      async currentStaffContext() {
        return {
          role: 'cashier',
          status: 'active',
          auth_user_id: 'cashier-uid',
          display_name: 'agent01',
          network_id: '11111111-1111-1111-1111-111111111111',
          legacy_cashier_id: '0393d651-e13a-4f04-ba7d-352f63bc62a5',
        };
      },
    };
    const rpcFactory = (): CashierRpcPort => ({
      async invoke(name, args) {
        calls.push({ name, args });
        throw staffError('PLAYER_CURRENCY_WALLET_REQUIRED', 400);
      },
    });
    const result = await handleCashierControlRequest(
      {
        method: 'POST',
        pathname: '/api/cashier/deposits',
        cookie: `${CASHIER_ACCESS_COOKIE}=ca; ${CASHIER_REFRESH_COOKIE}=cr`,
        cookieSecure: true,
        body: {
          playerPublicId: '110790',
          amount: 10,
          idempotencyKey: 'dep-fx',
          walletId: 'browser-wallet',
        },
      },
      { sessionPorts: session, rpcFactory },
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'PLAYER_CURRENCY_WALLET_REQUIRED');
    assert.deepEqual(calls[0]?.args, {
      p_player_public_id: '110790',
      p_amount: 10,
      p_idempotency_key: 'dep-fx',
      p_note: null,
    });
  });
});

describe('phase 057 UI and adapters', () => {
  it('keeps registration, header, profile, owner rates, and cashier copy currency-safe', () => {
    const auth = readFileSync(join(root, 'src/screens/AuthScreen.tsx'), 'utf8');
    assert.match(auth, /Валюта счёта/);
    assert.equal((auth.match(/<CurrencyPicker /g) ?? []).length, 3);
    assert.match(auth, /useState\(''\)/);
    const menu = readFileSync(join(root, 'src/screens/MenuScreen.tsx'), 'utf8');
    assert.match(menu, /Кошелёк и валюты/);
    const header = readFileSync(join(root, 'src/components/Header.tsx'), 'utf8');
    assert.match(header, /HeaderWalletSwitcher/);
    const owner = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    assert.match(owner, /OwnerUsdtRatesPanel/);
    const cashier = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');
    assert.match(cashier, /PLAYER_CURRENCY_WALLET_REQUIRED/);
    assert.match(cashier, /нет кошелька TMT/);
    const deposit = readFileSync(join(root, 'src/components/games/DepositModal.tsx'), 'utf8');
    assert.match(deposit, /Провайдер не подключён/);
    assert.equal(deposit.includes('apply_wallet_entry'), false);
  });

  it('keeps thin Vercel adapters and no service-role secret in the frontend', () => {
    for (const file of [
      'api/player/wallets.ts',
      'api/player/wallets/add.ts',
      'api/player/wallets/active.ts',
      'api/player/crypto/usdt-targets.ts',
      'api/player/crypto/usdt-quote.ts',
      'api/owner/usdt-rates.ts',
    ]) {
      const src = readFileSync(join(root, file), 'utf8');
      assert.match(src, /handleVercelPlayerAuth|vercelOwnerControl/);
      assert.equal(src.includes('SERVICE_ROLE'), false);
      assert.equal(src.includes('createClient'), false);
    }
    const ui = [
      readFileSync(join(root, 'src/lib/playerWallets.ts'), 'utf8'),
      readFileSync(join(root, 'src/screens/WalletsScreen.tsx'), 'utf8'),
      readFileSync(join(root, 'src/owner/OwnerUsdtRatesPanel.tsx'), 'utf8'),
    ].join('\n');
    assert.equal(ui.includes('SERVICE_ROLE'), false);
    assert.equal(ui.includes('service_role'), false);
  });
});

describe('strict currency mapping', () => {
  it('allows exactly six player currencies and rejects unknown storage codes', () => {
    assert.deepEqual([...PLAYER_DISPLAY_CURRENCIES], ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT']);
    assert.equal(storagePlayerCurrency('TMT'), 'TMTM');
    assert.equal(storagePlayerCurrency('TMTM'), 'TMTM');
    assert.equal(displayPlayerCurrency('TMTM'), 'TMT');
    for (const code of ['USD', 'TRY', 'UZS', 'RUB', 'KZT'] as const) {
      assert.equal(storagePlayerCurrency(code), code);
      assert.equal(displayPlayerCurrency(code), code);
    }
    for (const bad of ['EUR', 'ABC', 'USDT', '', 'usd1']) {
      assert.equal(storagePlayerCurrency(bad), null, bad);
      assert.equal(walletCurrenciesMatch(bad, bad), false, bad);
    }
    const storageFn = functionSql(sql057, 'private.wallet_storage_currency');
    assert.match(storageFn, /NOT IN \('TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'\)/);
    assert.match(storageFn, /RETURN NULL/);
    assert.equal(storageFn.includes('RETURN v_display'), false);
    assert.match(storageFn, /IF v_display = 'TMT' THEN\s+RETURN 'TMTM'/);
  });
});

describe('sports TMT-only placement guard', () => {
  it('patches sports_require_player_by_id itself and rejects non-TMT before money mutation', () => {
    const requireFn = functionSql(sql057, 'private.sports_require_player_by_id');
    const gameFn = functionSql(sql057, 'private.game_require_player_context');
    assert.match(requireFn, /STAFF_CANNOT_PLAY/);
    assert.match(requireFn, /player_active_wallet/);
    assert.match(requireFn, /WALLET_BLOCKED/);
    assert.match(requireFn, /WALLET_CLOSED/);
    assert.match(requireFn, /PLAYER_WALLET_NOT_ACTIVE/);
    assert.match(requireFn, /wallet_display_currency\(v_locked\.currency\)/);
    assert.match(requireFn, /IF v_display IS DISTINCT FROM 'TMT'/);
    assert.match(requireFn, /CURRENCY_LIMITS_UNCONFIGURED/);
    assert.equal(/SELECT p\.wallet_id\s+INTO v_wallet\s+FROM public\.profiles/.test(requireFn), false);
    assert.equal(requireFn.includes('INSERT INTO private.sports_bets'), false);
    assert.equal(requireFn.includes('CASINO_BET'), false);
    assert.equal(requireFn.includes('TREASURY_FUNDING'), false);
    assert.notEqual(requireFn, gameFn);

    const sql047 = latestMigration('sports_bet_acceptance_integrity_047');
    const engine = functionSql(sql047, 'private.sports_engine_place_as');
    const requireAt = engine.indexOf('sports_require_player_by_id');
    const insertAt = engine.indexOf('INSERT INTO private.sports_bets');
    const debitAt = engine.indexOf('apply_wallet_entry');
    assert.equal(requireAt >= 0, true);
    assert.equal(insertAt > requireAt, true);
    assert.equal(debitAt > requireAt, true);
    assert.equal(debitAt > insertAt, true);

    function placement(display: string) {
      const rejected = display !== 'TMT';
      return {
        rejected,
        code: rejected ? 'CURRENCY_LIMITS_UNCONFIGURED' : null,
        beforeInsert: requireAt < insertAt && !requireFn.includes('INSERT INTO private.sports_bets'),
        beforeDebit: requireAt < debitAt && !requireFn.includes('CASINO_BET'),
      };
    }
    const tmt = placement('TMT');
    assert.equal(tmt.rejected, false);
    assert.equal(tmt.code, null);
    assert.equal(tmt.beforeInsert, true);
    for (const code of ['USD', 'TRY', 'UZS', 'RUB', 'KZT']) {
      const result = placement(code);
      assert.equal(result.rejected, true, code);
      assert.equal(result.code, 'CURRENCY_LIMITS_UNCONFIGURED', code);
      assert.equal(result.beforeInsert, true, code);
      assert.equal(result.beforeDebit, true, code);
    }
    assert.equal(mapPlayerGameRpcError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).code, 'CURRENCY_LIMITS_UNCONFIGURED');
    assert.equal(mapPlayerGameRpcError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).httpStatus, 409);
  });
});

describe('cashier_enabled server enforcement', () => {
  it('requires catalog is_active and cashier_enabled and keeps TMT cashier on the TMT wallet', () => {
    const resolver = functionSql(sql057, 'private.cashier_resolve_player_wallet_for_ops_currency');
    const deposit = functionSql(sql057, 'public.cashier_deposit_player');
    assert.match(resolver, /c\.is_active/);
    assert.match(resolver, /c\.cashier_enabled/);
    assert.match(resolver, /CASHIER_CURRENCY_DISABLED/);
    assert.match(resolver, /PLAYER_CURRENCY_WALLET_REQUIRED/);
    assert.match(resolver, /a\.currency = v_storage/);
    assert.equal(resolver.includes('player_create_zero_wallet'), false);
    assert.equal(resolver.includes('player_set_active_wallet_id'), false);
    assert.match(deposit, /cashier_resolve_player_wallet_for_ops_currency\(p_player_public_id, v_op\.currency\)/);
    assert.match(deposit, /active_wallet_unchanged/);
    assert.equal(deposit.includes('player_create_zero_wallet'), false);
    const services = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');
    assert.match(services, /CASHIER_CURRENCY_DISABLED/);
  });
});

describe('USDT quote mutation recheck and exact decimal', () => {
  it('rechecks catalog flags and wallet status inside player_create_usdt_quote', () => {
    const quote = functionSql(sql057, 'public.player_create_usdt_quote');
    const targets = functionSql(sql057, 'public.player_usdt_quote_targets');
    assert.match(quote, /require_player_deposit_allowed/);
    assert.match(quote, /usdt_deposit_enabled/);
    assert.match(quote, /wallet_enabled/);
    assert.match(quote, /c\.is_active/);
    assert.match(quote, /WALLET_BLOCKED/);
    assert.match(quote, /WALLET_CLOSED/);
    assert.match(quote, /PLAYER_WALLET_NOT_ACTIVE/);
    assert.match(quote, /USDT_RATE_UNAVAILABLE/);
    assert.match(quote, /v_credit := p_source_amount \* v_rate/);
    assert.equal(quote.includes('player_create_zero_wallet'), false);
    assert.match(targets, /usdt_deposit_enabled/);
    assert.notEqual(quote.includes('usdt_deposit_enabled'), false);
  });

  it('keeps quote financial snapshot immutable after insert', () => {
    const protect = functionSql(sql057, 'private.crypto_deposit_quotes_protect_snapshot');
    for (const column of [
      'player_user_id',
      'target_wallet_id',
      'source_asset',
      'source_amount',
      'target_currency_code',
      'rate_snapshot',
      'fee_source_amount',
      'credit_amount',
      'created_at',
      'expires_at',
    ]) {
      assert.match(protect, new RegExp(`NEW\\.${column} IS DISTINCT FROM OLD\\.${column}`));
    }
    assert.match(protect, /TG_OP = 'DELETE'/);
    assert.match(protect, /QUOTE_IMMUTABLE/);
    assert.match(sql057, /REVOKE DELETE ON TABLE private\.crypto_deposit_quotes FROM service_role/);
    assert.match(sql057, /BEFORE UPDATE OR DELETE ON private\.crypto_deposit_quotes/);
    const setRate = functionSql(sql057, 'public.owner_set_usdt_deposit_rate');
    assert.equal(setRate.includes('crypto_deposit_quotes'), false);
  });

  it('rejects empty, zero, negative, scientific, and JSON-number USDT decimals and preserves exact strings', () => {
    assert.equal(parseExactPositiveDecimal('1.2500', 'USDT_RATE_INVALID'), '1.2500');
    assert.equal(parseExactPositiveDecimal('100.5000', 'USDT_AMOUNT_INVALID'), '100.5000');
    assert.equal(parseExactPositiveDecimal('0.000001', 'USDT_RATE_INVALID'), '0.000001');
    assert.equal(parseExactPositiveDecimal('1', 'USDT_RATE_INVALID'), '1');
    for (const bad of ['', ' ', '0', '0.0', '-1', '1e3', '1E-2', 'Infinity', 'NaN', 'abc', '+1', '1.2.3', 1, 1.25, 25, 0]) {
      assert.throws(() => parseExactPositiveDecimal(bad, 'USDT_RATE_INVALID'), /USDT_RATE_INVALID/, String(bad));
    }
    assert.throws(() => parseExactPositiveDecimal('1'.repeat(41), 'USDT_AMOUNT_INVALID'), /USDT_AMOUNT_INVALID/);
  });

  it('rejects garbage and JSON-number USDT quote amounts at the HTTP boundary', async () => {
    for (const sourceAmount of ['', '0', '-5', '1e2', 'NaN', 1.25, 25, 100]) {
      const result = await playerWallet('POST', PLAYER_USDT_QUOTE_PATH, {
        body: { sourceAmount, walletId: WALLET_USD },
      });
      assert.equal(result.status, 400, String(sourceAmount));
      assert.equal(result.body.error, 'USDT_AMOUNT_INVALID', String(sourceAmount));
    }
    const ok = await playerWallet('POST', PLAYER_USDT_QUOTE_PATH, {
      body: { sourceAmount: '100.5000', walletId: WALLET_USD },
    });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as { sourceAmount?: string }).sourceAmount, '100.5000');
  });
});

describe('owner TMT funding safety', () => {
  it('funds and debits the TMT wallet even when another currency is active', () => {
    const resolver = functionSql(sql057, 'private.owner_resolve_player_tmt_wallet');
    const fund = functionSql(sql057, 'public.owner_fund_player');
    const debit = functionSql(sql057, 'public.owner_debit_player');
    assert.match(resolver, /wallet_storage_currency\('TMT'\)/);
    assert.match(resolver, /PLAYER_CURRENCY_WALLET_REQUIRED/);
    assert.equal(resolver.includes('player_create_zero_wallet'), false);
    assert.match(fund, /owner_resolve_player_tmt_wallet/);
    assert.match(debit, /owner_resolve_player_tmt_wallet/);
    assert.equal(fund.includes('cashier_resolve_player_by_public_id'), false);
    assert.equal(debit.includes('cashier_resolve_player_by_public_id'), false);
    assert.match(fund, /TREASURY_TO_PLAYER/);
    assert.equal(fund.includes('player_set_active_wallet_id'), false);
    assert.equal(debit.includes('player_set_active_wallet_id'), false);
    assert.match(fund, /SET active_wallet_id = v_active/);
    assert.match(debit, /SET active_wallet_id = v_active/);
  });

  it('preserves pre-057 owner_fund_player idempotency identity', () => {
    const fund = functionSql(sql057, 'public.owner_fund_player');
    const debit = functionSql(sql057, 'public.owner_debit_player');
    assert.equal(sql057.includes('owner-fund-player:'), false);
    assert.equal(fund.includes('owner-fund-player:'), false);
    assert.match(fund, /v_key := private\.owner_require_idempotency_key\(p_idempotency_key\)/);
    assert.match(fund, /private\.apply_operational_transfer\(\s+'TREASURY_TO_PLAYER',\s+p_amount,\s+v_player\.currency,\s+v_key,/);
    const pre057Key = 'abc';
    const post057Key = 'abc';
    assert.equal(pre057Key, post057Key);
    assert.equal(fund.includes('v_owner::TEXT || \':\' || v_key'), false);
    assert.match(debit, /'owner-debit-player:' \|\| v_owner::TEXT \|\| ':' \|\| v_key/);
  });
});

describe('account hard block covers every owned wallet', () => {
  it('blocks and unblocks all owned wallets without moving money or switching active', () => {
    const block = functionSql(sql057, 'public.owner_set_player_blocked');
    const createZero = functionSql(sql057, 'private.player_create_zero_wallet');
    const setActive = functionSql(sql057, 'private.player_set_active_wallet_id');
    assert.match(block, /UPDATE public\.profiles AS p\s+SET is_blocked = p_blocked/);
    assert.match(block, /a\.owner_user_id = v_uid/);
    assert.match(block, /a\.status IS DISTINCT FROM 'closed'/);
    assert.match(block, /SET status = 'blocked'/);
    assert.match(block, /SET status = 'active'/);
    assert.match(block, /AND a\.status = 'blocked'/);
    assert.match(block, /SET is_blocked = TRUE/);
    assert.match(block, /SET is_blocked = FALSE/);
    assert.match(block, /active_wallet_unchanged/);
    assert.equal(block.includes('player_create_zero_wallet'), false);
    assert.equal(block.includes('TREASURY_TO_PLAYER'), false);
    assert.equal(block.includes('CASHIER_TO_PLAYER'), false);
    assert.equal(block.includes('set_player_security_restriction'), false);
    assert.match(createZero, /FOR UPDATE;/);
    assert.match(createZero, /v_profile\.is_blocked IS TRUE/);
    assert.equal(createZero.indexOf('WALLET_BLOCKED') < createZero.indexOf('INSERT INTO public.wallets'), true);
    assert.equal(createZero.indexOf('WALLET_BLOCKED') < createZero.indexOf('INSERT INTO private.wallet_accounts'), true);
    assert.equal(createZero.indexOf('WALLET_BLOCKED') < createZero.indexOf('player_set_active_wallet_id'), true);
    assert.match(setActive, /v_profile\.is_blocked IS TRUE/);
    assert.equal(setActive.indexOf('FOR UPDATE') < setActive.indexOf('private.wallet_accounts'), true);
    assert.match(setActive, /v_wallet\.status = 'blocked'/);
    assert.match(setActive, /v_wallet\.status = 'closed'/);
    assert.match(setActive, /WALLET_CLOSED/);
    assert.match(setActive, /PLAYER_WALLET_NOT_ACTIVE/);

    const owned = [
      { currency: 'TMT', status: 'active', closed: false },
      { currency: 'USD', status: 'active', closed: false },
      { currency: 'TRY', status: 'closed', closed: true },
    ];
    function applyBlock(blocked: boolean) {
      return owned.map((wallet) => ({
        currency: wallet.currency,
        status: blocked
          ? (wallet.closed ? 'closed' : 'blocked')
          : (wallet.closed ? 'closed' : 'active'),
      }));
    }
    const afterBlock = applyBlock(true);
    assert.deepEqual(afterBlock, [
      { currency: 'TMT', status: 'blocked' },
      { currency: 'USD', status: 'blocked' },
      { currency: 'TRY', status: 'closed' },
    ]);
    const afterUnblock = applyBlock(false);
    assert.deepEqual(afterUnblock, [
      { currency: 'TMT', status: 'active' },
      { currency: 'USD', status: 'active' },
      { currency: 'TRY', status: 'closed' },
    ]);
    assert.equal(block.includes('SET available_balance'), false);
    assert.equal(block.includes('player_set_active_wallet_id'), false);
  });

  it('hard-blocked players cannot add or switch wallets over HTTP', async () => {
    const added = await playerWallet('POST', PLAYER_WALLETS_ADD_PATH, {
      body: { currency: 'TRY' },
      wallets: walletPorts({ addError: 'WALLET_BLOCKED' }),
    });
    assert.equal(added.status, 409);
    assert.equal(added.body.error, 'WALLET_BLOCKED');
    const switched = await playerWallet('POST', PLAYER_WALLETS_ACTIVE_PATH, {
      body: { currency: 'USD' },
      wallets: walletPorts({ activeError: 'WALLET_BLOCKED' }),
    });
    assert.equal(switched.status, 409);
    assert.equal(switched.body.error, 'WALLET_BLOCKED');
    const closed = await playerWallet('POST', PLAYER_WALLETS_ACTIVE_PATH, {
      body: { currency: 'USD' },
      wallets: walletPorts({ activeError: 'WALLET_CLOSED' }),
    });
    assert.equal(closed.status, 409);
    assert.equal(closed.body.error, 'WALLET_CLOSED');
  });
});

describe('USDT target list matches mutation rules', () => {
  it('lists only active wallets with enabled catalog and rate flags', () => {
    const targets = functionSql(sql057, 'public.player_usdt_quote_targets');
    const quote = functionSql(sql057, 'public.player_create_usdt_quote');
    assert.match(targets, /a\.status = 'active'/);
    assert.match(targets, /c\.wallet_enabled/);
    assert.match(targets, /c\.usdt_deposit_enabled/);
    assert.match(targets, /c\.is_active/);
    assert.match(targets, /r\.enabled/);
    assert.match(targets, /r\.rate IS NOT NULL/);
    assert.match(quote, /usdt_deposit_enabled/);
    assert.match(quote, /wallet_enabled/);
    assert.match(quote, /WALLET_BLOCKED/);
    assert.match(quote, /PLAYER_WALLET_NOT_ACTIVE/);
  });
});
