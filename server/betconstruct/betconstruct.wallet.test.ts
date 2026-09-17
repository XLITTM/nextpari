import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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
  CASINO_SESSION_TOKEN_MAX_LEN,
  BETCONSTRUCT_CASINO_SESSION_TTL_MS,
  BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY,
  DISPLAY_SCALE,
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
  ordinalKeySort,
  parseProviderInt64,
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
const migrationsDir = join(root, 'supabase/migrations');
const sql061 = readFileSync(join(root, 'supabase/migrations/20260917131916_betconstruct_wallet_core_061.sql'), 'utf8');
const sql046 = readFileSync(join(root, 'supabase/migrations/20260913220000_provider_settlement_foundation_046.sql'), 'utf8');

const NOW_MS = 1_714_000_000_000;
const TS = Math.floor(NOW_MS / 1000);
const PLAYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
const WALLET_USD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WALLET_USD_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WALLET_TMT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WALLET_UZS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const WALLET_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PUBLIC_ID = '000006';
const PUBLIC_OTHER = '000007';

function functionSql(sql: string, signature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  assert.equal(start >= 0, true, `missing ${signature}`);
  const end = sql.indexOf('$fn$;', start);
  assert.equal(end > start, true, `missing body ${signature}`);
  return sql.slice(start, end + 5);
}

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
  return createMemoryWalletPorts({
    wallets: [new MemoryWalletLedger({
      walletId: WALLET_USD,
      playerAuthUserId: PLAYER,
      currency: 'USD',
      balance,
    })],
    nowMs: NOW_MS,
  });
}

async function bindSports(ports: ReturnType<typeof sportsWorld>, token = 'sports-token', currency = 'USD') {
  return persistLaunchBinding(ports, {
    product: 'sportsbook',
    rawToken: token,
    tokenKind: 'launch',
    playerAuthUserId: PLAYER,
    playerPublicId: PUBLIC_ID,
    walletId: currency === 'TMT' ? WALLET_TMT : WALLET_USD,
    displayCurrency: currency,
    issuedAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 60_000,
  });
}

function casinoWorld(input?: {
  balance?: number;
  restricted?: boolean;
  blocked?: boolean;
  currency?: string;
}) {
  const currency = input?.currency ?? 'USD';
  const walletId = currency === 'TMT' ? WALLET_TMT : currency === 'UZS' ? WALLET_UZS : WALLET_USD;
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

async function bindCasinoLaunch(
  ports: ReturnType<typeof casinoWorld>,
  token = 'casino-launch',
  currency = 'USD',
) {
  return persistLaunchBinding(ports, {
    product: 'casino',
    rawToken: token,
    tokenKind: 'launch',
    playerAuthUserId: PLAYER,
    playerPublicId: PUBLIC_ID,
    walletId: currency === 'TMT' ? WALLET_TMT : currency === 'UZS' ? WALLET_UZS : WALLET_USD,
    displayCurrency: currency,
    issuedAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 60_000,
  });
}

async function bindCasinoSession(
  ports: ReturnType<typeof casinoWorld>,
  token = 'casino-session',
  currency = 'USD',
) {
  return persistLaunchBinding(ports, {
    product: 'casino',
    rawToken: token,
    tokenKind: 'session',
    playerAuthUserId: PLAYER,
    playerPublicId: PUBLIC_ID,
    walletId: currency === 'TMT' ? WALLET_TMT : currency === 'UZS' ? WALLET_UZS : WALLET_USD,
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
      body: { WithdrawAmount: 5, RGSTransactionId: 'rgs-1' },
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

  it('hashes token bytes bit-exactly in TypeScript and SQL, including whitespace', () => {
    const padded = '  padded-token  ';
    const ts = digestAuthToken(padded);
    assert.equal(ts, createHash('sha256').update(padded, 'utf8').digest('hex'));
    assert.notEqual(ts, digestAuthToken(padded.trim()));
    const digestSql = functionSql(sql061, 'private.betconstruct_token_digest(p_token TEXT)');
    assert.match(digestSql, /convert_to\(COALESCE\(p_token, ''\), 'UTF8'\)/);
    assert.equal(digestSql.includes('BTRIM'), false);
    assert.equal(digestSql.includes('lower('), false);
    assert.equal(digestSql.includes('upper('), false);
  });

  it('debits BetPlaced once and ignores exact duplicates / conflicts', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    const placed = await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 1001,
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
      TransactionId: 1001,
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
      TransactionId: 1001,
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
      TransactionId: 2001,
      BetId: 9,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2,
    }), TEST_SPORTS_SHARED_KEY);
    const r1 = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 2002,
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
      TransactionId: 2003,
      BetId: 9,
      BetState: 2,
      Amount: 150,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(r2.balance, 1050);
    const r3 = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 2004,
      BetId: 9,
      BetState: 2,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(r3.balance, 1100);
    const sameTx = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 2004,
      BetId: 9,
      BetState: 2,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(sameTx.replayed, true);
    assert.equal(sameTx.balance, 1100);
    const newTxSameAmount = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 2005,
      BetId: 9,
      BetState: 3,
      Amount: 200,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(newTxSameAmount.ok, true);
    assert.equal(newTxSameAmount.balance, 1100);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD_NEW), 5);
  });

  it('rejects another player sports token from settling or rolling back a bet', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 1000 }),
        new MemoryWalletLedger({ walletId: WALLET_OTHER, playerAuthUserId: PLAYER_OTHER, currency: 'USD', balance: 800 }),
      ],
      nowMs: NOW_MS,
    });
    await bindSports(ports);
    await persistLaunchBinding(ports, {
      product: 'sportsbook',
      rawToken: 'other-sports',
      tokenKind: 'launch',
      playerAuthUserId: PLAYER_OTHER,
      playerPublicId: PUBLIC_OTHER,
      walletId: WALLET_OTHER,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 3001,
      BetId: 44,
      Amount: 25,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.2,
    }), TEST_SPORTS_SHARED_KEY);
    const stolen = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'other-sports',
      TransactionId: 3002,
      BetId: 44,
      BetState: 2,
      Amount: 80,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(stolen.ok, false);
    assert.equal(stolen.error, 'TOKEN_PLAYER_MISMATCH');
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 975);
    assert.equal(await ports.wallet.balanceOf(WALLET_OTHER), 800);
    const stolenRb = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'other-sports',
      TransactionId: 3001,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(stolenRb.ok, false);
    assert.equal(stolenRb.error, 'TOKEN_PLAYER_MISMATCH');
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 975);
  });

  it('rolls back an original placement once and no-ops an absent placement', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 4001,
      BetId: 3,
      Amount: 40,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.5,
    }), TEST_SPORTS_SHARED_KEY);
    const first = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 4001,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(first.ok, true);
    assert.equal(first.balance, 1000);
    const second = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 4001,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(second.replayed, true);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 1000);
    const missing = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 4002,
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

  it('signs casino requests with ordinal key order and rejects the sports secret', async () => {
    assert.deepEqual(ordinalKeySort(['Token', 'PublicKey', 'Amount']), ['Amount', 'PublicKey', 'Token']);
    const body = { Token: 'casino-session', PlayerId: 6 };
    const key = casinoPublicKey(body, TEST_CASINO_SHARED_KEY);
    assert.equal(key, key.toLowerCase());
    assert.notEqual(casinoPublicKey(body, TEST_SPORTS_SHARED_KEY), key);
    const src = readFileSync(join(here, 'wallet/casinoPublicKey.ts'), 'utf8');
    assert.equal(src.includes('localeCompare'), false);
    const ports = casinoWorld();
    await bindCasinoSession(ports);
    const bad = await casinoGetBalance(ports, {
      Token: 'casino-session',
      PlayerId: 6,
      PublicKey: casinoPublicKey({ Token: 'casino-session', PlayerId: 6 }, TEST_SPORTS_SHARED_KEY),
    }, TEST_CASINO_SHARED_KEY);
    assert.equal(bad.errorId, CASINO_ERROR.INVALID_TOKEN);
  });

  it('maps 6-digit public ids to stable Int32 PlayerIds without ambiguity', () => {
    assert.deepEqual(casinoPlayerIdFromPublicId('000006'), { playerId: 6, canonicalPublicId: '000006' });
    assert.equal(canonicalPublicIdFromPlayerId(6), '000006');
    assert.equal(provePublicIdIntegerUnique(['000006', '000007', '100000', '999999']), true);
    assert.notEqual(canonicalPublicIdFromPlayerId(6), '6');
  });

  it('issues a new casino session token distinct from the launch token', async () => {
    const ports = casinoWorld();
    await bindCasinoLaunch(ports);
    const auth = await casinoAuthentication(ports, signCasino({
      Token: 'casino-launch',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(auth.ok, true);
    assert.ok(auth.token);
    assert.notEqual(auth.token, 'casino-launch');
    assert.ok((auth.token as string).length <= CASINO_SESSION_TOKEN_MAX_LEN);
    const persisted = JSON.stringify({
      sessions: ports.sessionRows,
      callbacks: ports.callbackRows,
      transactions: ports.transactionRows,
    });
    assert.equal(persisted.includes(auth.token as string), false);
    assert.equal(persisted.includes('casino-launch'), false);
    const sessionRow = ports.sessionRows.find((row) => row.tokenKind === 'session');
    const launchRow = ports.sessionRows.find((row) => row.tokenKind === 'launch');
    assert.ok(sessionRow);
    assert.ok(launchRow);
    assert.equal(sessionRow!.tokenDigest, digestAuthToken(auth.token as string));
    assert.equal(launchRow!.tokenDigest, digestAuthToken('casino-launch'));
    assert.notEqual(sessionRow!.tokenDigest, launchRow!.tokenDigest);
    const balance = await casinoGetBalance(ports, signCasino({
      Token: auth.token,
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(balance.ok, true);
    assert.equal(balance.balance, 1000);
    const launchBalance = await casinoGetBalance(ports, signCasino({
      Token: 'casino-launch',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(launchBalance.errorId, CASINO_ERROR.INVALID_TOKEN);
  });

  it('allows a second casino session and a second-currency session without mutating the old binding', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 400 }),
        new MemoryWalletLedger({ walletId: WALLET_TMT, playerAuthUserId: PLAYER, currency: 'TMTM', balance: 80 }),
      ],
      nowMs: NOW_MS,
    });
    await bindCasinoLaunch(ports, 'launch-usd', 'USD');
    const first = await casinoAuthentication(ports, signCasino({
      Token: 'launch-usd',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'launch-usd-2',
      tokenKind: 'launch',
      playerAuthUserId: PLAYER,
      playerPublicId: PUBLIC_ID,
      walletId: WALLET_USD,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    const second = await casinoAuthentication(ports, signCasino({
      Token: 'launch-usd-2',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.notEqual(first.token, second.token);
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'launch-tmt',
      tokenKind: 'launch',
      playerAuthUserId: PLAYER,
      playerPublicId: PUBLIC_ID,
      walletId: WALLET_TMT,
      displayCurrency: 'TMT',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    const tmt = await casinoAuthentication(ports, signCasino({
      Token: 'launch-tmt',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(tmt.currency, 'TMT');
    const usdWithdraw = await casinoWithdraw(ports, signCasino({
      Token: first.token,
      PlayerId: 6,
      WithdrawAmount: 40,
      Currency: 'USD',
      RGSTransactionId: 9001,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(usdWithdraw.ok, true);
    assert.equal(usdWithdraw.balance, 360);
    assert.equal(await ports.wallet.balanceOf(WALLET_TMT), 80);
    const tmtWithdraw = await casinoWithdraw(ports, signCasino({
      Token: tmt.token,
      PlayerId: 6,
      WithdrawAmount: 10,
      Currency: 'TMT',
      RGSTransactionId: 9002,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(tmtWithdraw.ok, true);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 360);
    assert.equal(await ports.wallet.balanceOf(WALLET_TMT), 70);
    assert.equal(ports.sessionRows.filter((row) => row.tokenKind === 'session').length, 3);
    assert.equal(sql061.includes('betconstruct_session_casino_player_uidx'), false);
    assert.match(sql061, /betconstruct_session_casino_player_idx/);
  });

  it('withdraws once with documented fields and rejects Amount/CurrencyId aliases', async () => {
    const ports = casinoWorld({ balance: 500 });
    await bindCasinoSession(ports);
    const legacy = await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      Amount: 40,
      CurrencyId: 'USD',
      RGSTransactionId: 8001,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(legacy.ok, false);
    assert.equal(legacy.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 500);
    const withdraw = await casinoWithdraw(ports, signCasino({
      OperatorId: 1,
      PlayerId: 6,
      Token: 'casino-session',
      WithdrawAmount: 40,
      Currency: 'USD',
      GameId: 'game-1',
      RGSTransactionId: 8101,
      TypeId: 1,
      BonusDefId: 0,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(withdraw.ok, true);
    assert.equal(withdraw.balance, 460);
    assert.equal(Number.isInteger(withdraw.platformTransactionId), true);
    const dup = await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 40,
      Currency: 'USD',
      RGSTransactionId: 8101,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(dup.errorId, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    assert.equal(dup.platformTransactionId, withdraw.platformTransactionId);
    const d1 = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 10,
      Currency: 'USD',
      RGSTransactionId: 8102,
      RGSRelatedTransactionId: 8101,
    }), TEST_CASINO_SHARED_KEY);
    const d2 = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 15,
      Currency: 'USD',
      RGSTransactionId: 8103,
      RGSRelatedTransactionId: 8101,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(d1.ok, true);
    assert.equal(d2.ok, true);
    assert.notEqual(d1.platformTransactionId, d2.platformTransactionId);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 485);
  });

  it('keeps WithdrawAndDeposit atomic and preserves both accounting legs', async () => {
    const ports = casinoWorld({ balance: 200 });
    await bindCasinoSession(ports);
    const result = await casinoWithdrawAndDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 50,
      DepositAmount: 80,
      Currency: 'USD',
      RGSTransactionId: 8201,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(result.ok, true);
    assert.equal(result.balance, 230);
    const rows = [...ports.accounting.rows.values()].filter((row) => row.providerKey === 'betconstruct');
    assert.equal(rows.some((row) => row.kind === 'bet' && row.amount === 50), true);
    assert.equal(rows.some((row) => row.kind === 'win' && row.amount === 80), true);
    const dup = await casinoWithdrawAndDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 50,
      DepositAmount: 80,
      Currency: 'USD',
      RGSTransactionId: 8201,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(dup.errorId, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 230);
  });

  it('rejects the same casino RGS id across different financial methods', async () => {
    const ports = casinoWorld({ balance: 300 });
    await bindCasinoSession(ports);
    const withdraw = await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 20,
      Currency: 'USD',
      RGSTransactionId: 8301,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(withdraw.ok, true);
    const deposit = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 20,
      Currency: 'USD',
      RGSTransactionId: 8301,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(deposit.ok, false);
    assert.equal(deposit.errorId, CASINO_ERROR.GENERAL_ERROR);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 280);
    const wad = await casinoWithdrawAndDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 10,
      DepositAmount: 5,
      Currency: 'USD',
      RGSTransactionId: 8301,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(wad.ok, false);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 280);
  });

  it('rolls casino withdrawals back, allows expired session tokens, and maps unknown tokens to 102', async () => {
    const ports = casinoWorld({ balance: 100 });
    await bindCasinoSession(ports);
    await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 20,
      Currency: 'USD',
      RGSTransactionId: 8401,
    }), TEST_CASINO_SHARED_KEY);
    ports.setNow(NOW_MS + 120_000);
    const first = await casinoRollback(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      RGSTransactionId: 8401,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(first.ok, true);
    assert.equal(first.balance, 100);
    const second = await casinoRollback(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      RGSTransactionId: 8401,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(second.replayed, true);
    const unknownTx = await casinoRollback(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      RGSTransactionId: 8402,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(unknownTx.errorId, CASINO_ERROR.TRANSACTION_NOT_FOUND);
    const ghost = await casinoRollback(ports, signCasino({
      Token: 'no-such-session',
      PlayerId: 6,
      RGSTransactionId: 8401,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(ghost.errorId, CASINO_ERROR.INVALID_TOKEN);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 100);
  });

  it('does not roll back a standalone Deposit and rejects another player session token', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 100 }),
        new MemoryWalletLedger({ walletId: WALLET_OTHER, playerAuthUserId: PLAYER_OTHER, currency: 'USD', balance: 50 }),
      ],
      nowMs: NOW_MS,
    });
    await bindCasinoSession(ports);
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'other-session',
      tokenKind: 'session',
      playerAuthUserId: PLAYER_OTHER,
      playerPublicId: PUBLIC_OTHER,
      walletId: WALLET_OTHER,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    const deposit = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 12,
      Currency: 'USD',
      RGSTransactionId: 8501,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(deposit.ok, true);
    const rbDeposit = await casinoRollback(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      RGSTransactionId: 8501,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(rbDeposit.errorId, CASINO_ERROR.TRANSACTION_NOT_FOUND);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 112);
    await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 10,
      Currency: 'USD',
      RGSTransactionId: 8502,
    }), TEST_CASINO_SHARED_KEY);
    const stolen = await casinoRollback(ports, signCasino({
      Token: 'other-session',
      PlayerId: 7,
      RGSTransactionId: 8502,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(stolen.errorId, CASINO_ERROR.WRONG_PLAYER_ID);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 102);
  });

  it('maps insufficient funds to 21 and blocked new casino play to 29 without stranding settlement', async () => {
    const poor = casinoWorld({ balance: 5 });
    await bindCasinoSession(poor);
    const ns = await casinoWithdraw(poor, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 40,
      Currency: 'USD',
      RGSTransactionId: 8601,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(ns.errorId, CASINO_ERROR.NOT_ENOUGH_BALANCE);
    const restricted = casinoWorld({ restricted: true, balance: 80 });
    await bindCasinoLaunch(restricted);
    const blocked = await casinoAuthentication(restricted, signCasino({
      Token: 'casino-launch',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(blocked.errorId, CASINO_ERROR.PLAYER_IS_BLOCKED);
    await bindCasinoSession(restricted);
    const settled = await casinoDeposit(restricted, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 12,
      Currency: 'USD',
      RGSTransactionId: 8602,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(settled.ok, true);
    assert.equal(settled.balance, 92);
  });

  it('maps TMT display to TMTM storage and rejects FX / currency mismatch', async () => {
    assert.equal(providerDisplayCurrency('TMTM'), 'TMT');
    assert.equal(walletStorageCurrency('TMT'), 'TMTM');
    assert.equal(providerDisplayCurrency('USD'), 'USD');
    assert.equal(providerDisplayCurrency('RUB'), 'RUB');
    const ports = casinoWorld({ currency: 'TMT', balance: 80 });
    await bindCasinoSession(ports, 'casino-session', 'TMT');
    const mismatch = await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 5,
      Currency: 'USD',
      RGSTransactionId: 8701,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(mismatch.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    const ok = await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 5,
      Currency: 'TMT',
      RGSTransactionId: 8702,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(ok.ok, true);
    assert.equal(ok.currency, 'TMT');
    assert.equal(ports.wallets.get(WALLET_TMT)!.currency, 'TMTM');
  });

  it('rejects excess monetary scale without rounding, including UZS', async () => {
    assert.equal(DISPLAY_SCALE.USD, 2);
    assert.equal(DISPLAY_SCALE.UZS, 0);
    const usd = casinoWorld({ balance: 100 });
    await bindCasinoSession(usd);
    const usdExcess = await casinoWithdraw(usd, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: '1.005',
      Currency: 'USD',
      RGSTransactionId: 8801,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(usdExcess.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    assert.equal(await usd.wallet.balanceOf(WALLET_USD), 100);
    const tmt = casinoWorld({ currency: 'TMT', balance: 80 });
    await bindCasinoSession(tmt, 'casino-session', 'TMT');
    const tmtExcess = await casinoWithdraw(tmt, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: '10.999',
      Currency: 'TMT',
      RGSTransactionId: 8802,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(tmtExcess.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    const uzs = casinoWorld({ currency: 'UZS', balance: 1000 });
    await bindCasinoSession(uzs, 'casino-session', 'UZS');
    const uzsExcess = await casinoWithdraw(uzs, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: '100.5',
      Currency: 'UZS',
      RGSTransactionId: 8803,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(uzsExcess.errorId, CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
    assert.equal(await uzs.wallet.balanceOf(WALLET_UZS), 1000);
    const uzsOk = await casinoWithdraw(uzs, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 100,
      Currency: 'UZS',
      RGSTransactionId: 8804,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(uzsOk.ok, true);
    assert.equal(uzsOk.balance, 900);
    const sports = sportsWorld(1000);
    await bindSports(sports);
    const sportsScale = await sportsBetPlaced(sports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 7001,
      BetId: 2,
      Amount: '1.005',
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(sportsScale.ok, false);
    assert.equal(sportsScale.error, 'AMOUNT_SCALE_INVALID');
    assert.equal(await sports.wallet.balanceOf(WALLET_USD), 1000);
  });

  it('rolls back all financial side effects when a later step is injected to fail', async () => {
    const sports = sportsWorld(1000);
    await bindSports(sports);
    sports.setFailAfter('sports_bet_persist');
    const placed = await sportsBetPlaced(sports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 6001,
      BetId: 77,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(placed.ok, false);
    assert.equal(await sports.wallet.balanceOf(WALLET_USD), 1000);
    assert.equal(sports.sportsBetRows.length, 0);
    assert.equal(sports.transactionRows.length, 0);
    assert.equal(sports.accounting.rows.size, 0);

    const casino = casinoWorld({ balance: 200 });
    await bindCasinoSession(casino);
    casino.setFailAfter('casino_withdraw_persist');
    const withdraw = await casinoWithdraw(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 40,
      Currency: 'USD',
      RGSTransactionId: 8901,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(withdraw.ok, false);
    assert.equal(await casino.wallet.balanceOf(WALLET_USD), 200);
    assert.equal(casino.transactionRows.length, 0);
    assert.equal(casino.accounting.rows.size, 0);

    casino.setFailAfter('casino_wad_win');
    const wad = await casinoWithdrawAndDeposit(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 50,
      DepositAmount: 80,
      Currency: 'USD',
      RGSTransactionId: 8902,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(wad.ok, false);
    assert.equal(await casino.wallet.balanceOf(WALLET_USD), 200);
    assert.equal(casino.transactionRows.length, 0);

    casino.setFailAfter(null);
    await casinoWithdraw(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 20,
      Currency: 'USD',
      RGSTransactionId: 8903,
    }), TEST_CASINO_SHARED_KEY);
    await casinoDeposit(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 8,
      Currency: 'USD',
      RGSTransactionId: 8904,
      RGSRelatedTransactionId: 8903,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(await casino.wallet.balanceOf(WALLET_USD), 188);
    casino.setFailAfter('casino_rollback_related_win');
    const rb = await casinoRollback(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      RGSTransactionId: 8903,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(rb.ok, false);
    assert.equal(await casino.wallet.balanceOf(WALLET_USD), 188);
    assert.equal(casino.transactionRows.some((row) => row.method === 'Rollback'), false);
  });

  it('uses Wallet Ledger for player money and Provider Ledger only for GGR', async () => {
    const ports = sportsWorld(1000);
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 5001,
      BetId: 1,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.8,
    }), TEST_SPORTS_SHARED_KEY);
    await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 5002,
      BetId: 1,
      Amount: 180,
    }), TEST_SPORTS_SHARED_KEY);
    await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 5003,
      BetId: 1,
      Amount: 150,
    }), TEST_SPORTS_SHARED_KEY);
    const ledgerSum = ports.wallets.get(WALLET_USD)!.entries.reduce(
      (sum, row) => sum + Number(row.signedAmountExact),
      0,
    );
    assert.equal(ledgerSum, 50);
    const ggr = [...ports.accounting.rows.values()].reduce((sum, row) => sum + row.economicEffect, 0);
    assert.equal(ggr, -50);
    assert.equal(sql061.includes('UPDATE private.wallet_accounts'), false);
    assert.equal(sql061.includes('INSERT INTO private.wallet_ledger'), false);
    assert.match(sql061, /FROM private\.apply_wallet_entry\(/);
    assert.match(sql046, /UNIQUE \(provider_key, external_transaction_id\)/);
  });

  it('does not change production data or expose browser RPCs in migration 061', () => {
    const files = readdirSync(migrationsDir);
    assert.equal(files.some((name) => name.includes('062') && name.includes('betconstruct')), false);
    assert.equal(files.filter((name) => name.endsWith('betconstruct_wallet_core_061.sql')).length, 1);
    assert.match(sql061, /BEGIN;/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_session_bindings/);
    assert.match(sql061, /token_kind TEXT NOT NULL/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_sports_bets/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_transactions/);
    assert.match(sql061, /CREATE TABLE IF NOT EXISTS private\.betconstruct_callback_events/);
    assert.match(sql061, /betconstruct_platform_transaction_id_seq/);
    assert.match(sql061, /private\.betconstruct_apply_wallet_entry/);
    assert.match(sql061, /public\.betconstruct_apply_financial/);
    assert.match(sql061, /betconstruct_tx_casino_rgs_uidx/);
    assert.match(functionSql(sql061, 'private.betconstruct_apply_wallet_entry('), /require_currency_amount_scale/);
    assert.equal(functionSql(sql061, 'private.betconstruct_apply_wallet_entry(').includes('ROUND('), false);
    assert.match(sql061, /pg_advisory_xact_lock/);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) TO authenticated'), false);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) TO anon'), false);
    assert.match(sql061, /REVOKE ALL ON FUNCTION public\.betconstruct_apply_financial\(TEXT, JSONB\) FROM PUBLIC/);
    assert.match(sql061, /REVOKE ALL ON FUNCTION public\.betconstruct_apply_financial\(TEXT, JSONB\) FROM anon/);
    assert.match(sql061, /REVOKE ALL ON FUNCTION public\.betconstruct_apply_financial\(TEXT, JSONB\) FROM authenticated/);
    assert.match(sql061, /GRANT EXECUTE ON FUNCTION public\.betconstruct_apply_financial\(TEXT, JSONB\) TO service_role/);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated'), false);
    assert.equal(sql061.includes('GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO anon'), false);
    assert.match(sql061, /REVOKE ALL ON FUNCTION private\.betconstruct_apply_wallet_entry[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.equal(sql061.includes('TEST_SPORTS_SHARED_KEY'), false);
    assert.equal(sql061.includes('VITE_'), false);
    assert.equal(/INSERT INTO private\.wallet_ledger/.test(sql061), false);
    assert.equal(/UPDATE\s+private\.wallet_accounts/.test(sql061), false);
    assert.equal(/COPY private/.test(sql061), false);
    const issue = functionSql(sql061, 'private.betconstruct_issue_casino_session(p_payload JSONB)');
    const withdrawFn = functionSql(sql061, 'private.betconstruct_casino_withdraw(p_payload JSONB)');
    const wadFn = functionSql(sql061, 'private.betconstruct_casino_withdraw_and_deposit(p_payload JSONB)');
    const depositFn = functionSql(sql061, 'private.betconstruct_casino_deposit(p_payload JSONB)');
    const casinoRb = functionSql(sql061, 'private.betconstruct_casino_rollback(p_payload JSONB)');
    assert.match(issue, /require_player_external_casino_allowed/);
    assert.match(withdrawFn, /require_player_external_casino_allowed/);
    assert.match(wadFn, /require_player_external_casino_allowed/);
    assert.equal(depositFn.includes('require_player_external_casino_allowed'), false);
    assert.equal(casinoRb.includes('require_player_external_casino_allowed'), false);
    assert.match(issue, /session_expires_at/);
    assert.equal(issue.includes('v_launch.expires_at'), false);
    assert.match(sql061, /private\.betconstruct_parse_int64/);
  });

  it('rejects unsafe JS numbers for provider Int64 ids and accepts canonical decimal strings', () => {
    assert.equal(parseProviderInt64(9007199254740991), '9007199254740991');
    assert.throws(() => parseProviderInt64(9007199254740992), /TRANSACTION_ID_INVALID/);
    assert.equal(parseProviderInt64('9007199254740992'), '9007199254740992');
    assert.equal(parseProviderInt64('9223372036854775807'), '9223372036854775807');
    assert.throws(() => parseProviderInt64('9223372036854775808'), /TRANSACTION_ID_INVALID/);
    assert.throws(() => parseProviderInt64(-1), /TRANSACTION_ID_INVALID/);
    assert.throws(() => parseProviderInt64('1e2'), /TRANSACTION_ID_INVALID/);
    assert.throws(() => parseProviderInt64('1.5'), /TRANSACTION_ID_INVALID/);
  });

  it('rejects unsafe JS numeric BetId/TransactionId/RGSTransactionId before money movement', async () => {
    const sports = sportsWorld(1000);
    await bindSports(sports);
    const unsafeBet = await sportsBetPlaced(sports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 1001,
      BetId: 9007199254740992,
      Amount: 10,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(unsafeBet.ok, false);
    assert.equal(unsafeBet.error, 'TRANSACTION_ID_INVALID');
    assert.equal(await sports.wallet.balanceOf(WALLET_USD), 1000);
    const stringOk = await sportsBetPlaced(sports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: '9007199254740992',
      BetId: '9223372036854775807',
      Amount: 10,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(stringOk.ok, true);
    assert.equal(sports.sportsBetRows[0].betId, '9223372036854775807');
    assert.equal(sports.callbackRows.some((row) => row.providerBetId === '9223372036854775807'), true);
    const casino = casinoWorld({ balance: 100 });
    await bindCasinoSession(casino);
    const unsafeRgs = await casinoWithdraw(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 10,
      Currency: 'USD',
      RGSTransactionId: 9007199254740992,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(unsafeRgs.ok, false);
    assert.equal(await casino.wallet.balanceOf(WALLET_USD), 100);
    const stringRgs = await casinoWithdraw(casino, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 10,
      Currency: 'USD',
      RGSTransactionId: '9007199254740992',
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(stringRgs.ok, true);
  });

  it('does not let a Casino session inherit remaining launch TTL', async () => {
    const ports = casinoWorld();
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'short-launch',
      tokenKind: 'launch',
      playerAuthUserId: PLAYER,
      playerPublicId: PUBLIC_ID,
      walletId: WALLET_USD,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 5_000,
    });
    const auth = await casinoAuthentication(ports, signCasino({
      Token: 'short-launch',
      PlayerId: 6,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(auth.ok, true);
    const session = ports.sessionRows.find((row) => row.tokenKind === 'session');
    const launch = ports.sessionRows.find((row) => row.tokenKind === 'launch');
    assert.ok(session);
    assert.equal(launch!.expiresAtMs, NOW_MS + 5_000);
    assert.equal(session!.expiresAtMs, NOW_MS + BETCONSTRUCT_CASINO_SESSION_TTL_MS);
    assert.notEqual(session!.expiresAtMs, launch!.expiresAtMs);
    assert.ok(session!.expiresAtMs - NOW_MS > 5_000);
  });

  it('requires related casino deposits to match the original bet player/wallet/currency', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 200 }),
        new MemoryWalletLedger({ walletId: WALLET_TMT, playerAuthUserId: PLAYER, currency: 'TMTM', balance: 80 }),
        new MemoryWalletLedger({ walletId: WALLET_OTHER, playerAuthUserId: PLAYER_OTHER, currency: 'USD', balance: 50 }),
      ],
      nowMs: NOW_MS,
    });
    await bindCasinoSession(ports);
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'tmt-session',
      tokenKind: 'session',
      playerAuthUserId: PLAYER,
      playerPublicId: PUBLIC_ID,
      walletId: WALLET_TMT,
      displayCurrency: 'TMT',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: 'other-session',
      tokenKind: 'session',
      playerAuthUserId: PLAYER_OTHER,
      playerPublicId: PUBLIC_OTHER,
      walletId: WALLET_OTHER,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    await casinoWithdraw(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      WithdrawAmount: 20,
      Currency: 'USD',
      RGSTransactionId: 9101,
    }), TEST_CASINO_SHARED_KEY);
    const missing = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 5,
      Currency: 'USD',
      RGSTransactionId: 9102,
      RGSRelatedTransactionId: 9199,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(missing.errorId, CASINO_ERROR.TRANSACTION_NOT_FOUND);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 180);
    const crossWallet = await casinoDeposit(ports, signCasino({
      Token: 'tmt-session',
      PlayerId: 6,
      DepositAmount: 5,
      Currency: 'TMT',
      RGSTransactionId: 9103,
      RGSRelatedTransactionId: 9101,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(crossWallet.ok, false);
    assert.equal(await ports.wallet.balanceOf(WALLET_TMT), 80);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 180);
    const crossPlayer = await casinoDeposit(ports, signCasino({
      Token: 'other-session',
      PlayerId: 7,
      DepositAmount: 5,
      Currency: 'USD',
      RGSTransactionId: 9104,
      RGSRelatedTransactionId: 9101,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(crossPlayer.errorId, CASINO_ERROR.WRONG_PLAYER_ID);
    assert.equal(await ports.wallet.balanceOf(WALLET_OTHER), 50);
    const d1 = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 3,
      Currency: 'USD',
      RGSTransactionId: 9105,
      RGSRelatedTransactionId: 9101,
    }), TEST_CASINO_SHARED_KEY);
    const d2 = await casinoDeposit(ports, signCasino({
      Token: 'casino-session',
      PlayerId: 6,
      DepositAmount: 4,
      Currency: 'USD',
      RGSTransactionId: 9106,
      RGSRelatedTransactionId: 9101,
    }), TEST_CASINO_SHARED_KEY);
    assert.equal(d1.ok, true);
    assert.equal(d2.ok, true);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 187);
  });

  it('denies sports rollback replay that would expose another player wallet', async () => {
    const ports = createMemoryWalletPorts({
      wallets: [
        new MemoryWalletLedger({ walletId: WALLET_USD, playerAuthUserId: PLAYER, currency: 'USD', balance: 1000 }),
        new MemoryWalletLedger({ walletId: WALLET_OTHER, playerAuthUserId: PLAYER_OTHER, currency: 'USD', balance: 800 }),
      ],
      nowMs: NOW_MS,
    });
    await bindSports(ports);
    await persistLaunchBinding(ports, {
      product: 'sportsbook',
      rawToken: 'other-sports',
      tokenKind: 'launch',
      playerAuthUserId: PLAYER_OTHER,
      playerPublicId: PUBLIC_OTHER,
      walletId: WALLET_OTHER,
      displayCurrency: 'USD',
      issuedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
    });
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 9201,
      BetId: 55,
      Amount: 40,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.2,
    }), TEST_SPORTS_SHARED_KEY);
    const first = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'sports-token',
      TransactionId: 9201,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(first.ok, true);
    assert.equal(first.balance, 1000);
    const stolen = await sportsRollback(ports, signSports('Rollback', {
      AuthToken: 'other-sports',
      TransactionId: 9201,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(stolen.ok, false);
    assert.equal(stolen.error, 'TOKEN_PLAYER_MISMATCH');
    assert.equal(stolen.balance, undefined);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 1000);
    assert.equal(await ports.wallet.balanceOf(WALLET_OTHER), 800);
  });

  it('documents BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY fail-closed', async () => {
    assert.equal(
      BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY,
      'BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY',
    );
    const ports = sportsWorld(100);
    await bindSports(ports);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 9301,
      BetId: 11,
      Amount: 100,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 2,
    }), TEST_SPORTS_SHARED_KEY);
    const won = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 9302,
      BetId: 11,
      BetState: 2,
      Amount: 180,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(won.balance, 180);
    await sportsBetPlaced(ports, signSports('BetPlaced', {
      AuthToken: 'sports-token',
      TransactionId: 9303,
      BetId: 12,
      Amount: 150,
      Created: '2026-01-01',
      BetType: 1,
      SystemMinCount: 0,
      TotalPrice: 1.5,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 30);
    const correction = await sportsBetResulted(ports, signSports('BetResulted', {
      AuthToken: 'sports-token',
      TransactionId: 9304,
      BetId: 11,
      BetState: 3,
      Amount: 0,
    }), TEST_SPORTS_SHARED_KEY);
    assert.equal(correction.ok, false);
    assert.equal(correction.error, 'INSUFFICIENT_AVAILABLE_BALANCE');
    assert.equal(await ports.wallet.balanceOf(WALLET_USD), 30);
    assert.equal(ports.sportsBetRows.find((row) => row.betId === '11')!.latestResultAmountExact, '180');
  });
});
