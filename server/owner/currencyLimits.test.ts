import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import { mapOwnerRpcError, type OwnerRpcPort } from './ownerRpc.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import { mapCashierRpcError, type CashierRpcPort } from '../cashier/cashierRpc.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { parseExactPositiveDecimal } from '../player/exactDecimal.js';
import {
  displayPlayerCurrency,
  parseOperationalDisplayCurrency,
  PLAYER_DISPLAY_CURRENCIES,
  providerFacingCurrency,
  storagePlayerCurrency,
} from '../player/playerCurrency.js';
import { mapPlayerGameRpcError } from '../player/playerGameRpc.js';
import { mapPlayerWalletError } from '../player/playerWalletsService.js';
import { handlePlayerSportsRequest } from '../player/sportsPlaceHttp.js';
import type { SportsPlacePorts } from '../player/sportsPlaceService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from '../player/playerCookies.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationsDir = join(root, 'supabase/migrations');

function migrationNamed(suffix: string): string {
  const name = readdirSync(migrationsDir).find((file) => file.endsWith(suffix));
  assert.ok(name, `missing migration ${suffix}`);
  return readFileSync(join(migrationsDir, name), 'utf8');
}

const sql034 = migrationNamed('dice_blackjack_win2.sql');
const sql038 = migrationNamed('provider_aware_sports_settlement.sql');
const sql057 = migrationNamed('player_multi_currency_wallets_057.sql');
const sql058 = migrationNamed('multi_currency_operational_treasury_058.sql');
const sql059 = migrationNamed('currency_limits_multicurrency_gameplay_059.sql');
const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const PLAYER_ID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';

function functionSql(sql: string, signature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  assert.equal(start >= 0, true, `missing ${signature}`);
  const end = sql.indexOf('$fn$;', start);
  assert.equal(end > start, true, `missing body ${signature}`);
  return sql.slice(start, end + 5);
}

function ownerCookie(): string {
  return `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`;
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

function ownerRpc(handler?: (name: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ name, args });
      if (handler) return handler(name, args);
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

async function ownerReq(method: string, pathname: string, body?: unknown) {
  const rpc = ownerRpc();
  const result = await handleOwnerControlRequest(
    { method, pathname, cookie: ownerCookie(), cookieSecure: true, body },
    { sessionPorts: ownerPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('phase 059 currency catalog', () => {
  it('keeps exactly six display currencies and TMT -> TMTM storage', () => {
    assert.deepEqual([...PLAYER_DISPLAY_CURRENCIES], ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT']);
    assert.equal(storagePlayerCurrency('TMT'), 'TMTM');
    assert.equal(displayPlayerCurrency('TMTM'), 'TMT');
    assert.equal(providerFacingCurrency('TMTM'), 'TMT');
    assert.equal(providerFacingCurrency('USD'), 'USD');
    assert.equal(parseOperationalDisplayCurrency('TMTM'), null);
    assert.equal(parseOperationalDisplayCurrency('EUR'), null);
    assert.equal(parseOperationalDisplayCurrency('USDT'), null);
    assert.match(sql059, /WHERE c\.code IN \('TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'\)/);
    assert.match(functionSql(sql059, 'private.require_supported_display_currency(p_code TEXT)'), /v_display = 'TMTM'/);
  });

  it('does not seed numeric limits and leaves non-TMT products off', () => {
    const preamble = sql059.slice(0, sql059.indexOf('CREATE OR REPLACE FUNCTION private.require_supported_display_currency'));
    assert.match(preamble, /ADD COLUMN IF NOT EXISTS sports_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(preamble, /ADD COLUMN IF NOT EXISTS owned_games_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(preamble, /WHERE code = 'TMT'/);
    assert.match(preamble, /sports_enabled = TRUE/);
    assert.match(preamble, /owned_games_enabled = TRUE/);
    assert.equal(preamble.includes('limits_configured = TRUE'), false);
    assert.equal(preamble.includes('min_stake ='), false);
    assert.equal(preamble.includes('INSERT INTO private.supported_currencies'), false);
    assert.match(sql057, /limits_configured BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql058, /operational_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('requires all five positive NUMERIC limits and range rules', () => {
    const validate = functionSql(sql059, 'private.validate_currency_limit_fields(');
    assert.match(validate, /RAISE EXCEPTION 'LIMIT_REQUIRED'/);
    assert.match(validate, /RAISE EXCEPTION 'LIMIT_NOT_POSITIVE'/);
    assert.match(validate, /RAISE EXCEPTION 'LIMIT_STAKE_RANGE_INVALID'/);
    assert.match(validate, /RAISE EXCEPTION 'LIMIT_PAYOUT_RANGE_INVALID'/);
    assert.match(validate, /pg_catalog\.scale/);
    assert.equal(validate.includes('double precision'), false);
    assert.equal(validate.includes('FLOAT'), false);
  });
});

describe('phase 059 owner HTTP and audit', () => {
  it('reads and writes limits through Owner RPCs only', async () => {
    const get = await ownerReq('GET', '/api/owner/currency-limits');
    assert.equal(get.result.status, 200);
    assert.equal(get.rpc.calls[0]?.name, 'owner_currency_limits');

    const post = await ownerReq('POST', '/api/owner/currency-limits', {
      currency: 'USD',
      minStake: '1.25',
      maxStake: '100.00',
      maxPayout: '100000',
      minDeposit: '10',
      minWithdrawal: '20',
    });
    assert.equal(post.result.status, 200);
    assert.deepEqual(post.rpc.calls[0]?.args, {
      p_currency: 'USD',
      p_min_stake: '1.25',
      p_max_stake: '100.00',
      p_max_payout: '100000',
      p_min_deposit: '10',
      p_min_withdrawal: '20',
    });
  });

  it('rejects JSON numbers, TMTM, EUR and zero strings before RPC', async () => {
    for (const bad of [1, 1.25, 100, '', ' ', '0', '-1', '+1', '1e3', 'NaN', 'Infinity']) {
      assert.throws(() => parseExactPositiveDecimal(bad, 'AMOUNT_INVALID'), /AMOUNT_INVALID/, String(bad));
    }
    assert.equal(parseExactPositiveDecimal('1.25', 'AMOUNT_INVALID'), '1.25');
    assert.equal(parseExactPositiveDecimal('100000', 'AMOUNT_INVALID'), '100000');

    const numeric = await ownerReq('POST', '/api/owner/currency-limits', {
      currency: 'USD',
      minStake: 1.25,
      maxStake: '100',
      maxPayout: '1000',
      minDeposit: '10',
      minWithdrawal: '10',
    });
    assert.equal(numeric.result.status, 400);
    assert.equal(numeric.result.body.error, 'AMOUNT_INVALID');
    assert.equal(numeric.rpc.calls.length, 0);

    for (const currency of ['TMTM', 'EUR', 'USDT']) {
      const result = await ownerReq('POST', '/api/owner/currency-limits', {
        currency,
        minStake: '1',
        maxStake: '100',
        maxPayout: '1000',
        minDeposit: '10',
        minWithdrawal: '10',
      });
      assert.equal(result.result.status, 400, currency);
      assert.equal(result.result.body.error, 'CURRENCY_UNSUPPORTED', currency);
      assert.equal(result.rpc.calls.length, 0, currency);
    }
  });

  it('maps owner-only and product-safety errors without treating authenticated as enough', () => {
    assert.equal(mapOwnerRpcError({ message: 'OWNER_REQUIRED' }).httpStatus, 403);
    assert.equal(mapOwnerRpcError({ message: 'LIMIT_NOT_POSITIVE' }).httpStatus, 400);
    assert.equal(mapOwnerRpcError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).httpStatus, 409);
    assert.equal(mapOwnerRpcError({ message: 'OWNED_GAMES_CURRENCY_NOT_READY' }).httpStatus, 409);
    const setFn = functionSql(sql059, 'public.owner_set_currency_limits(');
    assert.match(setFn, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(setFn, /LIMITS_UPDATED/);
    assert.match(setFn, /limits_configured = TRUE/);
    assert.equal(setFn.includes('apply_wallet_entry'), false);
    assert.equal(setFn.includes('apply_operational_transfer'), false);
  });

  it('enables sports only for configured non-TMT and rejects non-TMT owned games', async () => {
    const sports = functionSql(sql059, 'public.owner_set_currency_sports_enabled(');
    assert.match(sports, /CURRENCY_LIMITS_UNCONFIGURED/);
    assert.match(sports, /SPORTS_ENABLED_CHANGED/);
    const owned = functionSql(sql059, 'public.owner_set_currency_owned_games_enabled(');
    assert.match(owned, /OWNED_GAMES_CURRENCY_NOT_READY/);
    assert.match(owned, /OWNED_GAMES_ENABLED_REJECTED/);
    assert.match(sql059, /supported_currencies_non_tmt_owned_games_blocked/);

    const enable = await ownerReq('POST', '/api/owner/currency-limits/sports', { currency: 'RUB', enabled: true });
    assert.equal(enable.rpc.calls[0]?.name, 'owner_set_currency_sports_enabled');
    const games = await ownerReq('POST', '/api/owner/currency-limits/owned-games', { currency: 'USD', enabled: true });
    assert.equal(games.rpc.calls[0]?.name, 'owner_set_currency_owned_games_enabled');
  });

  it('keeps currency_limit_events append-only and without secrets', () => {
    assert.match(sql059, /CREATE TABLE IF NOT EXISTS private\.currency_limit_events/);
    assert.match(sql059, /CURRENCY_LIMIT_EVENTS_IMMUTABLE/);
    assert.match(sql059, /REVOKE UPDATE, DELETE ON TABLE private\.currency_limit_events FROM service_role/);
    assert.equal(sql059.includes('service_role_key'), false);
  });
});

describe('phase 059 sports placement and settlement', () => {
  it('writes recorded wallet storage currency and keeps old idempotency identity', () => {
    const place = functionSql(sql059, 'private.sports_engine_place_as(');
    assert.match(place, /v_storage,/);
    assert.match(place, /currency,\s+provider,/);
    assert.match(place, /private\.sports_place_request_fingerprint\(v_stake, v_mode, p_legs\)/);
    assert.equal(place.includes('sports_place_request_fingerprint(v_stake, v_mode, p_legs, v_storage)'), false);
    assert.equal(place.includes('sports_place_request_fingerprint(v_stake, v_mode, p_legs, v_display)'), false);
    const insert = place.slice(place.indexOf('INSERT INTO private.sports_bets'));
    assert.match(insert, /v_storage/);
    assert.match(place, /enforce_sports_currency_limits\(v_display, v_stake, v_payout\)/);
    assert.match(place, /SPORTS_STAKE_LIMIT/);
    assert.match(place, /SPORTS_PAYOUT_LIMIT/);
    assert.match(place, /game_current_balance\(v_existing\.wallet_id\)/);
  });

  it('duplicate lookup does not use the current active wallet', () => {
    const lookup = functionSql(sql059, 'private.sports_lookup_existing_place_as(');
    assert.equal(lookup.includes('sports_require_player_by_id'), false);
    assert.match(lookup, /player_user_id = p_player_user_id/);
    assert.match(lookup, /game_current_balance\(v_existing\.wallet_id\)/);
    const requirePlayer = functionSql(sql059, 'private.sports_require_player_by_id(');
    assert.match(requirePlayer, /require_sports_currency_ready/);
    assert.equal(requirePlayer.includes("<> 'TMT'"), false);
    assert.equal(requirePlayer.includes("IS DISTINCT FROM 'TMT'"), false);
  });

  it('maps public sports JSON through display currency and keeps settlement on original wallet', () => {
    const json = functionSql(sql059, 'private.sports_bet_json(');
    assert.match(json, /wallet_display_currency\(p_bet\.currency\)/);
    assert.equal(json.includes("'TMTM'"), false);
    const security = functionSql(sql059, 'private.security_sports_bet_json(p_bet private.sports_bets)');
    assert.match(security, /wallet_display_currency\(p_bet\.currency\)/);
    assert.equal(displayPlayerCurrency('TMTM'), 'TMT');
    const settle = functionSql(sql038, 'private.sports_apply_one(');
    const walletHits = settle.match(/v_bet\.wallet_id/g) ?? [];
    assert.equal(walletHits.length >= 4, true, 'settlement must credit original bet wallet');
    assert.equal(settle.includes('player_active_wallet'), false);
    assert.match(functionSql(sql059, 'private.require_sports_currency_ready(p_display TEXT)'), /SPORTS_CURRENCY_DISABLED/);
    assert.match(functionSql(sql059, 'private.require_sports_currency_ready(p_display TEXT)'), /CURRENCY_LIMITS_UNCONFIGURED/);
    const tmtBranch = functionSql(sql059, 'private.require_sports_currency_ready(p_display TEXT)');
    assert.match(tmtBranch, /v_row\.code IS DISTINCT FROM 'TMT'/);
  });

  it('rejects sports below/above currency limits before debit and maps HTTP codes', () => {
    const enforce = functionSql(sql059, 'private.enforce_sports_currency_limits(');
    assert.match(enforce, /SPORTS_STAKE_BELOW_CURRENCY_MIN/);
    assert.match(enforce, /SPORTS_STAKE_ABOVE_CURRENCY_MAX/);
    assert.match(enforce, /SPORTS_PAYOUT_ABOVE_CURRENCY_MAX/);
    const place = functionSql(sql059, 'private.sports_engine_place_as(');
    assert.ok(place.indexOf('enforce_sports_currency_limits') < place.indexOf('INSERT INTO private.sports_bets'));
    assert.ok(place.indexOf('enforce_sports_currency_limits') < place.indexOf('apply_wallet_entry'));
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_STAKE_BELOW_CURRENCY_MIN' }).httpStatus, 409);
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_CURRENCY_DISABLED' }).httpStatus, 409);
    assert.equal(mapPlayerGameRpcError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).httpStatus, 409);
  });

  it('sports place HTTP replay uses original payload and does not inject current wallet', async () => {
    const lookups: Array<Record<string, unknown>> = [];
    const ports: SportsPlacePorts = {
      async signInWithPassword() { throw staffError('AUTH_FAILED', 401); },
      async signUp() { throw staffError('AUTH_FAILED', 401); },
      async refreshSession() {
        return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
      },
      async getAuthUser() {
        return { id: PLAYER_ID, email: 'player@nextpari.test' };
      },
      async ensurePlayerAccount() {
        return {
          walletId: '11111111-2222-3333-4444-555555555555',
          publicId: '110790',
          legacyBalance: 50,
          migrationState: 'staging',
        };
      },
      async loadOwnWallet() {
        return { balance: 50, currency: 'TMT', status: 'active', publicId: '110790' };
      },
      async savePlayerProfile() {},
      async lookupExistingPlace(input) {
        lookups.push(input as unknown as Record<string, unknown>);
        return {
          ok: true,
          isDuplicate: true,
          betId: 'bet-usd',
          currency: 'USD',
          stake: 10,
        };
      },
      async placeAsVerifiedPlayer() {
        throw new Error('must not place again');
      },
    };
    const result = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: '/api/player/sports/place',
        cookie: `${PLAYER_ACCESS_COOKIE}=pa; ${PLAYER_REFRESH_COOKIE}=pr`,
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'dup-1',
          selections: [{
            provider: 'lsports',
            fixtureId: '1',
            marketId: '1',
            marketKey: '1:1:',
            outcomeId: '2',
            price: 1.85,
          }],
        },
      },
      ports,
      { error() {} },
      { CANONICAL_SPORTS_BET_ENABLED: '1' },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.currency, 'USD');
    assert.equal(result.body.betId, 'bet-usd');
    assert.equal(lookups.length, 1);
    assert.equal('walletId' in (lookups[0] ?? {}), false);
  });
});

describe('phase 059 player funding limits', () => {
  it('enforces cashier min_deposit only on player funding RPCs', () => {
    const tmt = functionSql(sql059, 'public.cashier_deposit_player(');
    const currency = functionSql(sql059, 'public.cashier_deposit_player_currency(');
    assert.match(tmt, /require_player_min_amount/);
    assert.match(currency, /require_player_min_amount\(v_display, p_amount, 'deposit'\)/);
    assert.equal(sql058.includes('require_player_min_amount'), false);
    const helper = functionSql(sql059, 'private.require_player_min_amount(');
    assert.match(helper, /DEPOSIT_BELOW_CURRENCY_MIN/);
    assert.match(helper, /WITHDRAWAL_BELOW_CURRENCY_MIN/);
    assert.match(helper, /CURRENCY_LIMITS_UNCONFIGURED/);
    assert.match(helper, /v_row\.code IS DISTINCT FROM 'TMT'/);
    assert.equal(mapCashierRpcError({ message: 'DEPOSIT_BELOW_CURRENCY_MIN' }).httpStatus, 400);
    assert.equal(mapCashierRpcError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).httpStatus, 409);
  });

  it('cashier HTTP surfaces deposit-below-min without switching wallets', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const session: CashierAuthGatewayPorts = {
      async signInWithPassword() { return { accessToken: 'ca', refreshToken: 'cr' }; },
      async refreshSession() { throw staffError('JWT_INVALID', 401); },
      async currentStaffContext() {
        return {
          role: 'cashier',
          status: 'active',
          auth_user_id: 'cashier-uid',
          display_name: 'agent01',
          network_id: NETWORK_ID,
          legacy_cashier_id: CASHIER_ID,
        };
      },
    };
    const result = await handleCashierControlRequest(
      {
        method: 'POST',
        pathname: '/api/cashier/deposits',
        cookie: `${CASHIER_ACCESS_COOKIE}=ca; ${CASHIER_REFRESH_COOKIE}=cr`,
        cookieSecure: true,
        body: {
          playerPublicId: '110790',
          amount: '5',
          idempotencyKey: 'dep-min',
          currency: 'RUB',
        },
      },
      {
        sessionPorts: session,
        rpcFactory: (): CashierRpcPort => ({
          async invoke(name, args) {
            calls.push({ name, args });
            throw staffError('DEPOSIT_BELOW_CURRENCY_MIN', 400);
          },
        }),
      },
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'DEPOSIT_BELOW_CURRENCY_MIN');
    assert.equal(calls[0]?.name, 'cashier_deposit_player_currency');
    assert.equal(calls[0]?.args?.p_amount, '5');
    const deposit = functionSql(sql059, 'public.cashier_deposit_player_currency(');
    assert.match(deposit, /SET active_wallet_id = v_active/);
  });

  it('USDT quotes compare credited target amount, not the USDT source', () => {
    const quote = functionSql(sql059, 'public.player_create_usdt_quote(');
    assert.match(quote, /v_credit := p_source_amount \* v_rate/);
    assert.match(quote, /require_player_min_amount\(v_display, v_credit, 'deposit'\)/);
    assert.equal(quote.includes('require_player_min_amount(v_display, p_source_amount'), false);
    assert.match(quote, /rate_snapshot/);
    assert.equal(mapPlayerWalletError({ message: 'DEPOSIT_BELOW_CURRENCY_MIN' }).httpStatus, 400);
    assert.equal(mapPlayerWalletError({ message: 'CURRENCY_LIMITS_UNCONFIGURED' }).httpStatus, 409);
  });

  it('withdrawals use the locked wallet and keep pending identity', () => {
    const create = functionSql(sql059, 'public.player_create_withdrawal(');
    assert.match(create, /withdrawal_lock_player_wallet/);
    assert.match(create, /require_player_min_amount/);
    assert.match(create, /'withdrawal'/);
    const helper = functionSql(sql059, 'private.require_player_min_amount(');
    assert.match(helper, /WITHDRAWAL_BELOW_CURRENCY_MIN/);
    const json = functionSql(sql059, 'private.withdrawal_public_json(');
    assert.match(json, /wallet_display_currency\(p_row\.currency\)/);
    assert.equal(mapPlayerGameRpcError({ message: 'WITHDRAWAL_BELOW_CURRENCY_MIN' }).httpStatus, 400);
  });
});

describe('phase 059 owned games safety', () => {
  it('blocks non-TMT owned games even when limits exist and does not clip payouts', () => {
    const ready = functionSql(sql059, 'private.require_owned_games_currency_ready(p_display TEXT)');
    assert.match(ready, /OWNED_GAMES_CURRENCY_NOT_READY/);
    const ctx = functionSql(sql059, 'private.game_require_player_context()');
    assert.match(ctx, /require_owned_games_currency_ready/);
    const start = functionSql(sql059, 'private.game_engine_start(');
    assert.match(start, /game_effective_stake_bounds/);
    assert.equal(start.includes('CLIP'), false);
    assert.equal(start.includes('max_payout'), false);
    assert.match(start, /game_current_balance\(v_existing\.wallet_id\)/);
    assert.match(sql059, /Owned-game max-payout is NOT enforced here/);
    assert.match(sql034, /'rtpTarget', 1\.000000000000000000/);
    assert.match(sql034, /1\.013623494/);
    assert.equal(sql059.includes('rtp_target'), false);
    assert.equal(mapPlayerGameRpcError({ message: 'OWNED_GAMES_CURRENCY_NOT_READY' }).httpStatus, 409);
  });
});

describe('phase 059 owner UI and money safety', () => {
  it('adds Финансы → Лимиты валют cards without a fake non-TMT games toggle', () => {
    const dash = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const panel = readFileSync(join(root, 'src/owner/OwnerCurrencyLimitsPanel.tsx'), 'utf8');
    assert.match(dash, /OwnerCurrencyLimitsPanel/);
    assert.match(panel, /Лимиты валют/);
    assert.match(panel, /Минимальная ставка/);
    assert.match(panel, /Максимальная ставка/);
    assert.match(panel, /Максимальная выплата/);
    assert.match(panel, /Минимальное пополнение/);
    assert.match(panel, /Минимальный вывод/);
    assert.match(panel, /Лимиты настроены/);
    assert.match(panel, /Не настроены/);
    assert.match(panel, /Спорт \{row\?\.sportsEnabled \? 'включён' : 'выключен'\}/);
    assert.match(panel, /Будет доступно после завершения настройки математики собственных игр/);
    assert.equal(panel.includes('setOwnerCurrencyOwnedGamesEnabled'), false);
    for (const code of PLAYER_DISPLAY_CURRENCIES) {
      assert.match(panel, new RegExp(`'${code}'`));
    }
  });

  it('does not rewrite historical money and keeps thin adapters', () => {
    const preamble = sql059.slice(0, sql059.indexOf('CREATE OR REPLACE FUNCTION private.require_supported_display_currency'));
    for (const table of [
      'wallet_accounts',
      'wallet_ledger',
      'operational_accounts',
      'operational_ledger',
      'sports_bets',
      'sports_bet_legs',
      'game_rounds',
      'player_withdrawal_requests',
      'crypto_deposit_quotes',
    ]) {
      assert.equal(preamble.includes(`UPDATE private.${table}`), false, table);
      assert.equal(preamble.includes(`INSERT INTO private.${table}`), false, table);
    }
    assert.match(sql059, /SET search_path = ''/);
    assert.match(sql059, /REVOKE ALL ON FUNCTION public\.owner_set_currency_limits/);
    assert.equal(sql059.includes('GRANT EXECUTE ON FUNCTION public.owner_set_currency_limits'), true);
    for (const file of [
      'api/owner/currency-limits.ts',
      'api/owner/currency-limits/sports.ts',
      'api/owner/currency-limits/owned-games.ts',
    ]) {
      const src = readFileSync(join(root, file), 'utf8');
      assert.match(src, /vercelOwnerControl/);
      assert.equal(src.includes('SERVICE_ROLE'), false);
    }
  });
});
