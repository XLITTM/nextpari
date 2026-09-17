import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BETCONSTRUCT_NOT_CONFIGURED, isBetConstructLive } from './config.js';
import { handleBetConstructRequest } from './http.js';
import { bindCurrencyLaunchToken } from './iframe.js';
import { betConstructOperatorCallbackPath } from './operatorApi.js';
import { betConstructWalletCallbackPath } from './singleWallet.js';
import {
  CASINO_ERROR,
  TEST_CASINO_SHARED_KEY,
  TEST_SPORTS_SHARED_KEY,
  canonicalPublicIdFromPlayerId,
  casinoAuthentication,
  casinoDeposit,
  casinoGetBalance,
  casinoPlayerIdFromPublicId,
  casinoPublicKey,
  casinoRollback,
  casinoWithdraw,
  casinoWithdrawAndDeposit,
  createMemoryWalletPorts,
  digestAuthToken,
  MemoryWalletLedger,
  persistLaunchBinding,
  provePublicIdIntegerUnique,
  providerDisplayCurrency,
  sportsBetPlaced,
  sportsBetResulted,
  sportsbookMd5Hash,
  sportsGetClientBalance,
  sportsRollback,
  walletStorageCurrency,
} from './wallet/index.js';
import { sportsbookHashPayload } from './wallet/sportsHash.js';
import { assertSportsTsFresh } from './wallet/sportsTs.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql061 = readFileSync(join(root, 'supabase/migrations/20260917131916_betconstruct_wallet_core_061.sql'), 'utf8');
const sql046 = readFileSync(join(root, 'supabase/migrations/20260913220000_provider_settlement_foundation_046.sql'), 'utf8');

const NOW_MS = 1_714_000_000_000;
const TS = Math.floor(NOW_MS / 1000);
const PLAYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WALLET_USD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WALLET_USD_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WALLET_TMT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PUBLIC_ID = '000006';

function signSports(method: 'GetClientDetails' | 'GetClientBalance' | 'BetPlaced' | 'BetResulted' | 'Rollback', params: Record<string, unknown>) {
  const body: Record<string, unknown> = { ...params, TS };
  body.Hash = sportsbookMd5Hash(method, body, TEST_SPORTS_SHARED_KEY);
  return body;
}

function signCasino(body: Record<string, unknown>) {
  const next = { ...body };
  next.PublicKey = casinoPublicKey(next, TEST_CASINO_SHARED_KEY);
  return next;
}

function sportsWorld(balance = 1000) {
  const ports = createMemoryWalletPorts({
    wallets: [new MemoryWalletLedger({
      walletId: WALLET_USD,
      playerAuthUserId: PLAYER,
      currency: 'USD',
      balance,
    })],
    nowMs: NOW_MS,
  });
  return ports;
}

async function bindSports(ports: ReturnType<typeof sportsWorld>, token = 'sports-token', currency = 'USD') {
  return persistLaunchBinding(ports, {
    product: 'sportsbook',
    rawToken: token,
    playerAuthUserId: PLAYER,
    playerPublicId: PUBLIC_ID,
    walletId: currency === 'TMT' ? WALLET_TMT : WALLET_USD,
    displayCurrency: currency,
    issuedAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 60_000,
  });
}

function casinoWorld(input?: { balance?: number; restricted?: boolean; blocked?: boolean; currency?: string }) {
  const currency = input?.currency ?? 'USD';
  const walletId = currency === 'TMT' ? WALLET_TMT : WALLET_USD;
  return createMemoryWalletPorts({
    wallets: [new MemoryWalletLedger({
      walletId,
      playerAuthUserId: PLAYER,
      currency: currency === 'TMT' ? 'TMTM' : currency,
      balance: input?.balance ?? 1000,
      status: input?.blocked ? 'blocked' : 'active',
    })],
    restrictedPlayerIds: input?.restricted ? [PLAYER] : [],
    nowMs: NOW_MS,
  });
}

async function bindCasino(ports: ReturnType<typeof casinoWorld>, token = 'casino-token', currency = 'USD') {
  return persistLaunchBinding(ports, {
    product: 'casino',
    rawToken: token,
    playerAuthUserId: PLAYER,
    playerPublicId: PUBLIC_ID,
    walletId: currency === 'TMT' ? WALLET_TMT : WALLET_USD,
    displayCurrency: currency,
    issuedAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 60_000,
  });
}

describe('BetConstruct wallet core — fail-closed foundation', () => {
  it('keeps live=false even with dummy credentials', () => {
    assert.equal(isBetConstructLive(process.env), false);
    assert.equal(isBetConstructLive({
      BETCONSTRUCT_ENABLED: '1',
      BETCONSTRUCT_OPERATOR_ID: 'op',
      BETCONSTRUCT_SPORTS_SHARED_KEY: 'sports',
      BETCONSTRUCT_CASINO_SHARED_KEY: 'casino',
      BETCONSTRUCT_SPORTS_ALLOWED_IPS: '1.1.1.1',
      BETCONSTRUCT_CASINO_ALLOWED_IPS: '2.2.2.2',
      BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN: 'https://sport.example',
      BETCONSTRUCT_CASINO_IFRAME_ORIGIN: 'https://casino.example',
    }), false);
  });

  it('public provider callbacks still cannot move money', async () => {
    const placed = await handleBetConstructRequest({
      method: 'POST',
      pathname: betConstructOperatorCallbackPath('BetPlaced'),
      body: { Amount: 100, TransactionId: 'tx-1' },
    });
    assert.equal(placed.status, 409);
    assert.equal(placed.body.error, BETCONSTRUCT_NOT_CONFIGURED);
    const withdraw = await handleBetConstructRequest({
      method: 'POST',
      pathname: betConstructWalletCallbackPath('Withdraw'),
      body: { Amount: 5, RGSTransactionId: 'rgs-1' },
    });
    assert.equal(withdraw.status, 409);
    assert.equal(withdraw.body.error, BETCONSTRUCT_NOT_CONFIGURED);
  });

  it('uses exact sports field-order MD5 and rejects wrong/stale requests', () => {
    const params = { AuthToken: 'tok', TS: 1714000000 };
    const payload = sportsbookHashPayload('GetClientDetails', params, TEST_SPORTS_SHARED_KEY);
    assert.equal(payload, 'AuthTokentokTS1714000000TEST_SPORTS_SHARED_KEY');
    const hash = sportsbookMd5Hash('GetClientDetails', params, TEST_SPORTS_SHARED_KEY);
    assert.equal(hash, hash.toLowerCase());
    assert.equal(hash, createHash('md5').update(payload, 'utf8').digest('hex'));
    assert.notEqual(
      sportsbookMd5Hash('GetClientDetails', params, TEST_CASINO_SHARED_KEY),
      hash,
    );
    assert.equal(assertSportsTsFresh(TS, NOW_MS), TS);
    assert.throws(() => assertSportsTsFresh(TS - 21, NOW_MS), /TS_STALE/);
    assert.throws(() => assertSportsTsFresh(TS + 3, NOW_MS), /TS_FUTURE/);
  });

  it('keeps token/wallet/currency immutable and opaque', async () => {
    const first = bindCurrencyLaunchToken({
      playerUserId: PLAYER,
      walletId: WALLET_USD,
      currency: 'USD',
      issuedAtMs: NOW_MS,
    });
    const second = bindCurrencyLaunchToken({
      playerUserId: PLAYER,
      walletId: WALLET_USD,
      currency: 'USD',
      issuedAtMs: NOW_MS,
    });
    assert.notEqual(first.token, second.token);
    assert.equal(first.token.includes(PLAYER), false);
    assert.equal(digestAuthToken(first.token).length, 64);
    const ports = sportsWorld();
    const binding = await bindSports(ports, first.token);
    assert.equal(binding.displayCurrency, 'USD');
    await assert.rejects(
      () => ports.sessions.save({ ...binding, displayCurrency: 'RUB' }),
      /SESSION_IMMUTABLE/,
    );
  });

  it('debits BetPlaced once and ignores exact duplicates / conflicts', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    const placed = await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'place-1',
      BetId: 88,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2.5,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(placed.ok, true);
    assert.equal(placed.balance, 900);
    const replay = await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'place-1',
      BetId: 88,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2.5,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(replay.replayed, true);
    assert.equal(replay.balance, 900);
    const conflict = await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'place-1',
      BetId: 88,
      Amount: 50,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2.5,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error, 'CONFLICT');
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 900);
    assert.equal(ports.wallets.get(WALLET_USD)!.entries.filter((row) => row.operation === 'CASINO_BET').length, 1);
  });

  it('settles BetResulted as a final-amount delta on the original wallet', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 1000 }),
        new MemoryWalletLedger({ walletId: WALLET_USD_NEW, playerAuthUserId: PLAYER, currency: 'USD', balance: 5 }),
      ],
      nowMs: NOW_MS,
    });
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'place-delta',
      BetId: 9,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2,
    }), TEST_SPORTS_SHARED_KEY);
    const r1 = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'res-1',
      BetId: 9,
      BetState: 2,
      Amount: 180,
      BonusAmount: 0,
      BonusId: '',
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(r1.ok, true);
    assert.equal(r1.balance, 1080);
    const r2 = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'res-2',
      BetId: 9,
      BetState: 2,
      Amount: 150,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(r2.balance, 1050);
    const r3 = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'res-3',
      BetId: 9,
      BetState: 2,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(r3.balance, 1100);
    const sameTx = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'res-3',
      BetId: 9,
      BetState: 2,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(sameTx.replayed, true);
    assert.equal(sameTx.balance, 1100);
    const newTxSameAmount = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'res-4',
      BetId: 9,
      BetState: 3,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(newTxSameAmount.ok, true);
    assert.equal(newTxSameAmount.balance, 1100);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD_NEW), 5);
  });

  it('rolls back an original placement once and no-ops an absent placement', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'rb-1',
      BetId: 3,
      Amount: 40,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.5,
    }), TEST_SPORTS_SHARED_KEY);
    const first = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 'rb-1',
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(first.ok, true);
    assert.equal(first.balance, 1000);
    const second = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 'rb-1',
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(second.replayed, true);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 1000);
    const missing = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 'never-placed',
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(missing.ok, true);
  });

  it('rejects a sports hash computed with the casino secret', async () => {
    const ports = sportsWorld();
    await bindSports(ports);
    const params = signSports('GetClientBalance', { AuthToken: 'sports-token' });
    params.Hash = sportsbookMd5Hash('GetClientBalance', params, TEST_CASINO_SHARED_KEY);
    const result = await sportsGetClientBalance(ports, params, TEST_SPORTS_SHARED_KEY);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'HASH_INVALID');
  });

  it('signs casino requests with deterministic SHA256 and rejects the sports secret', async () => {
    const body = { Token: 'casino-token', PlayerId: 6 };
    const key = casinoPublicKey(body, TEST_CASINO_SHARED_KEY);
    assert.equal(key, key.toLowerCase());
    assert.notEqual(casinoPublicKey(body, TEST_SPORTS_SHARED_KEY), key);
    const ports = casinoWorld();
    await bindCasino(ports);
    const bad = await casinoGetBalance(ports, {
      Token: 'casino-token',
      PlayerId: 6,
      PublicKey: casinoPublicKey({ Token: 'casino-token', PlayerId: 6 }, TEST_SPORTS_SHARED_KEY),
    }, TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(bad.errorId, CASINO_ERROR.INVALID_TOKEN);
  });

  it('maps 6-digit public ids to stable Int32 PlayerIds without ambiguity', () => {
    assert.deepEqual(casinoPlayerIdFromPublicId('000006'), { playerId: 6, canonicalPublicId: '000006' });
    assert.equal(canonicalPublicIdFromPlayerId(6), '000006');
    assert.equal(provePublicIdIntegerUnique(['000006', '000007', '100000', '999999']), true);
    assert.notEqual(canonicalPublicIdFromPlayerId(6), '6');
  });

  it('withdraws once, deposits with distinct RGS ids sharing a related id, and returns Int64 platform ids', async () => {
    const ports = casinoWorld({ balance: 500 });
    await bindCasino(ports);
    const withdraw = await casinoWithdraw(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 40,
      CurrencyId: 'USD',
      RGSTransactionId: 'w-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(withdraw.ok, true);
    assert.equal(withdraw.balance, 460);
    assert.equal(Number.isInteger(withdraw.platformTransactionId), true);
    const dup = await casinoWithdraw(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 40,
      CurrencyId: 'USD',
      RGSTransactionId: 'w-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(dup.errorId, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    assert.equal(dup.platformTransactionId, withdraw.platformTransactionId);
    const d1 = await casinoDeposit(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 10,
      CurrencyId: 'USD',
      RGSTransactionId: 'd-1',
      RGSRelatedTransactionId: 'w-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    const d2 = await casinoDeposit(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 15,
      CurrencyId: 'USD',
      RGSTransactionId: 'd-2',
      RGSRelatedTransactionId: 'w-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(d1.ok, true);
    assert.equal(d2.ok, true);
    assert.notEqual(d1.platformTransactionId, d2.platformTransactionId);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 485);
  });

  it('keeps WithdrawAndDeposit atomic and preserves both accounting legs', async () => {
    const ports = casinoWorld({ balance: 200 });
    await bindCasino(ports);
    const result = await casinoWithdrawAndDeposit(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      WithdrawAmount: 50,
      DepositAmount: 80,
      CurrencyId: 'USD',
      RGSTransactionId: 'wad-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(result.ok, true);
    assert.equal(result.balance, 230);
    const rows = [...ports.accounting.rows.values()].filter((row) => row.providerKey === 'betconstruct');
    assert.equal(rows.some((row) => row.kind === 'bet' && row.amount === 50), true);
    assert.equal(rows.some((row) => row.kind === 'win' && row.amount === 80), true);
    const dup = await casinoWithdrawAndDeposit(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      WithdrawAmount: 50,
      DepositAmount: 80,
      CurrencyId: 'USD',
      RGSTransactionId: 'wad-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(dup.errorId, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 230);
  });

  it('rolls casino transactions back idempotently and maps unknown ids to 107', async () => {
    const ports = casinoWorld({ balance: 100 });
    await bindCasino(ports);
    await casinoWithdraw(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 20,
      RGSTransactionId: 'rb-w',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    const first = await casinoRollback(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      RGSTransactionId: 'rb-w',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(first.ok, true);
    assert.equal(first.balance, 100);
    const second = await casinoRollback(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      RGSTransactionId: 'rb-w',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(second.replayed, true);
    const unknown = await casinoRollback(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      RGSTransactionId: 'missing',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(unknown.errorId, CASINO_ERROR.TRANSACTION_NOT_FOUND);
  });

  it('maps insufficient funds to 21 and blocked new casino play to 29 without stranding settlement', async () => {
    const poor = casinoWorld({ balance: 5 });
    await bindCasino(poor);
    const ns = await casinoWithdraw(poor, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 40,
      RGSTransactionId: 'poor-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(ns.errorId, CASINO_ERROR.NOT_ENOUGH_BALANCE);
    const restricted = casinoWorld({ restricted: true, balance: 80 });
    await bindCasino(restricted);
    const blocked = await casinoAuthentication(restricted, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(blocked.errorId, CASINO_ERROR.PLAYER_IS_BLOCKED);
    const settled = await casinoDeposit(restricted, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 12,
      RGSTransactionId: 'win-old',
      RGSRelatedTransactionId: 'old-bet',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(settled.ok, true);
    assert.equal(settled.balance, 92);
  });

  it('maps TMT display to TMTM storage and rejects FX / currency mismatch', async () => {
    assert.equal(providerDisplayCurrency('TMTM'), 'TMT');
    assert.equal(walletStorageCurrency('TMT'), 'TMTM');
    assert.equal(providerDisplayCurrency('USD'), 'USD');
    assert.equal(providerDisplayCurrency('RUB'), 'RUB');
    const ports = casinoWorld({ currency: 'TMT', balance: 80 });
    await bindCasino(ports, 'casino-token', 'TMT');
    const mismatch = await casinoWithdraw(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 5,
      CurrencyId: 'USD',
      RGSTransactionId: 'fx-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(mismatch.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    const ok = await casinoWithdraw(ports, signCasino({
      Token: 'casino-token',
      PlayerId: 6,
      Amount: 5,
      CurrencyId: 'TMT',
      RGSTransactionId: 'tmt-1',
    }), TEST_CASINO_SHARED_KEY, 'casino-token');
    assert.equal(ok.ok, true);
    assert.equal(ok.currency, 'TMT');
    assert.equal(ports.wallets.get(WALLET_TMT)!.currency, 'TMTM');
  });

  it('uses Wallet Ledger for player money and Provider Ledger only for GGR', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 'acc-1',
      BetId: 1,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.8,
    }), TEST_SPORTS_SHARED_KEY);
    await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'acc-r1',
      BetId: 1,
      Amount: 180,
    }), TEST_SPORTS_SHARED_KEY);
    await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 'acc-r2',
      BetId: 1,
      Amount: 150,
    }), TEST_SPORTS_SHARED_KEY);
    const ledgerSum = ports.wallets.get(WALLET_USD)!.entries.reduce((sum, row) => sum + row.signedAmount, 0);
    assert.equal(ledgerSum, 50);
    const ggr = [...ports.accounting.rows.values()].reduce((sum, row) => sum + row.economicEffect, 0);
    assert.equal(ggr, -50);
    assert.equal(sql061.includes('UPDATE private.wallet_accounts'), false);
    assert.equal(sql061.includes('INSERT INTO private.wallet_ledger'), false);
    assert.match(sql061, /FROM private\.apply_wallet_entry\(/);
    assert.match(sql046, /UNIQUE \(provider_key, external_transaction_id\)/);
  });

  it('does not change production data or expose browser RPCs in migration 061', () => {
    assert.match(sql061, /BEGIN;/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_session_bindings/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_sports_bets/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_transactions/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_callback_events/);
    assert.match(sql061, /betconstruct_platform_transaction_id_seq/);
    assert.match(sql061, /private\.betconstruct_apply_wallet_entry/);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated'), false);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO anon'), false);
    assert.match(sql061, /REVOKE ALL ON FUNCTION private\.betconstruct_apply_wallet_entry[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.equal(sql061.includes('TEST_SPORTS_SHARED_KEY'), false);
    assert.equal(sql061.includes('VITE_'), false);
    assert.equal(/INSERT INTO private\.betconstruct_transactions/.test(sql061), false);
    assert.equal(/INSERT INTO private\.wallet_ledger/.test(sql061), false);
    assert.equal(/UPDATE\s+private\.wallet_accounts/.test(sql061), false);
  });
});
