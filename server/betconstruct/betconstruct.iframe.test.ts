import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PLAYER_ACCESS_COOKIE } from '../player/playerCookies.js';
import { PLAYER_EXTERNAL_CASINO_GATE_RPC } from '../player/playerSecurityRestrictionGate.js';
import {
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_PROVIDER_KEY,
  BETCONSTRUCT_SINGLE_WALLET_METHODS,
  BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS,
  betConstructCredentialStatus,
  isBetConstructLive,
} from './config.js';
import {
  bindCurrencyLaunchToken,
  buildBetConstructCasinoIframeUrl,
  buildBetConstructSportsbookIframeUrl,
  launchTokenCurrency,
} from './iframe.js';
import {
  handleBetConstructRequest,
  isBetConstructPath,
} from './http.js';
import {
  BETCONSTRUCT_CASINO_SECURITY_GATE,
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
} from './launch.js';
import { BETCONSTRUCT_OPERATOR_PATH } from './operatorApi.js';
import { BETCONSTRUCT_WALLET_PATH } from './singleWallet.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTs(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
      ? entry.name.includes('.test.') ? [] : [path]
      : [];
  });
}

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(sportsStore|quoteProvider|lsports|sportsPlace)/;

describe('BetConstruct iframe-first architecture', () => {
  it('stays disabled without real credentials and does not claim live traffic', () => {
    assert.equal(isBetConstructLive(process.env), false);
    assert.equal(isBetConstructLive({
      BETCONSTRUCT_ENABLED: '1',
      BETCONSTRUCT_OPERATOR_ID: 'op',
      BETCONSTRUCT_SHARED_KEY: 'key',
      BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN: 'https://sport.example',
      BETCONSTRUCT_CASINO_IFRAME_ORIGIN: 'https://casino.example',
      BETCONSTRUCT_IP_ALLOWLIST: '203.0.113.10',
    }), false);
    assert.equal(betConstructCredentialStatus({}).allPresent, false);
    assert.equal(BETCONSTRUCT_PROVIDER_KEY, 'betconstruct');
  });

  it('builds sportsbook and casino iframe URLs with integrationMode=1 and AuthToken', () => {
    const sports = buildBetConstructSportsbookIframeUrl({
      origin: 'https://sport.betconstruct.example',
      authToken: 'tok-usd',
      lang: 'ru',
    });
    const sportsUrl = new URL(sports);
    assert.equal(sportsUrl.searchParams.get('integrationMode'), '1');
    assert.equal(sportsUrl.searchParams.get('AuthToken'), 'tok-usd');
    const casino = buildBetConstructCasinoIframeUrl({
      origin: 'https://casino.betconstruct.example',
      authToken: 'tok-uzs',
      gameId: 'roulette-1',
    });
    const casinoUrl = new URL(casino);
    assert.equal(casinoUrl.searchParams.get('integrationMode'), '1');
    assert.equal(casinoUrl.searchParams.get('AuthToken'), 'tok-uzs');
    assert.equal(casinoUrl.searchParams.get('gameId'), 'roulette-1');
  });

  it('binds launch tokens to wallet currency and never to a player-specific RTP', () => {
    const usd = bindCurrencyLaunchToken({
      playerUserId: '11111111-1111-4111-8111-111111111111',
      walletId: '22222222-2222-4222-8222-222222222222',
      currency: 'USD',
      issuedAtMs: 1,
    });
    const uzs = bindCurrencyLaunchToken({
      playerUserId: usd.playerUserId,
      walletId: '33333333-3333-4333-8333-333333333333',
      currency: 'UZS',
      issuedAtMs: 1,
    });
    assert.equal(usd.currency, 'USD');
    assert.equal(uzs.currency, 'UZS');
    assert.equal(launchTokenCurrency(usd.token), 'USD');
    assert.notEqual(usd.token, uzs.token);
    assert.equal(usd.token.includes('rtp'), false);
  });

  it('lists Operator API and Single Wallet methods without native odds routing', () => {
    assert.deepEqual([...BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS], [
      'GetClientDetails',
      'GetClientBalance',
      'BetPlaced',
      'BetResulted',
      'Rollback',
    ]);
    assert.deepEqual([...BETCONSTRUCT_SINGLE_WALLET_METHODS], [
      'Authentication',
      'GetBalance',
      'Withdraw',
      'Deposit',
      'WithdrawAndDeposit',
      'Rollback',
    ]);
    assert.equal(BETCONSTRUCT_CASINO_SECURITY_GATE, PLAYER_EXTERNAL_CASINO_GATE_RPC);
  });

  it('requires a player session for launch and then fails closed', async () => {
    const unauth = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
    });
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.error, 'JWT_REQUIRED');

    const sports = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
      cookie: `${PLAYER_ACCESS_COOKIE}=player-access`,
    });
    assert.equal(sports.status, 409);
    assert.equal(sports.body.error, BETCONSTRUCT_NOT_CONFIGURED);

    const casino = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
      cookie: `${PLAYER_ACCESS_COOKIE}=player-access`,
    });
    assert.equal(casino.status, 409);
    assert.equal(casino.body.error, BETCONSTRUCT_NOT_CONFIGURED);
  });

  it('rejects Operator API and Single Wallet callbacks before any wallet write', async () => {
    for (const method of BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS) {
      const result = await handleBetConstructRequest({
        method: 'POST',
        pathname: BETCONSTRUCT_OPERATOR_PATH,
        body: { method },
      });
      assert.equal(result.status, 409, method);
      assert.equal(result.body.error, BETCONSTRUCT_NOT_CONFIGURED, method);
    }
    for (const method of BETCONSTRUCT_SINGLE_WALLET_METHODS) {
      const result = await handleBetConstructRequest({
        method: 'POST',
        pathname: BETCONSTRUCT_WALLET_PATH,
        body: { method },
      });
      assert.equal(result.status, 409, method);
      assert.equal(result.body.error, BETCONSTRUCT_NOT_CONFIGURED, method);
    }
    const bad = await handleBetConstructRequest({
      method: 'POST',
      pathname: BETCONSTRUCT_OPERATOR_PATH,
      body: { method: 'PlaceNativeSportsBet' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'BETCONSTRUCT_METHOD_UNSUPPORTED');
    assert.equal(isBetConstructPath('/api/player/sports/place'), false);
  });

  it('does not ingest BetConstruct odds or import the native sports engine', () => {
    const files = [
      ...listTs(join(root, 'server/betconstruct')),
      join(root, 'src/lib/betconstructLaunch.ts'),
      join(root, 'src/components/BetConstructIframeHost.tsx'),
      join(root, 'src/screens/ProviderIframeScreen.tsx'),
      join(root, 'src/screens/ProviderSportsbookScreen.tsx'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.equal(FORBIDDEN_IMPORT.test(src), false, file);
      assert.equal(src.includes('apply_wallet_entry('), false, file);
      assert.equal(src.includes('useSportsStore'), false, file);
      assert.equal(src.includes('MarketsGrid'), false, file);
      assert.equal(src.includes('BetSlipScreen'), false, file);
    }
    const sportsStore = read('src/stores/sportsStore.ts');
    const place = read('src/lib/sportsPlaceRequest.ts');
    const lsports = read('src/lib/lsportsFeed.ts');
    assert.equal(sportsStore.toLowerCase().includes('betconstruct'), false);
    assert.equal(place.toLowerCase().includes('betconstruct'), false);
    assert.equal(lsports.toLowerCase().includes('betconstruct'), false);
    assert.match(place, /LSPORTS_PROVIDER = 'lsports'/);
  });

  it('keeps native betslip and menu bet-builder separate from the provider iframe', () => {
    const host = read('src/components/BetConstructIframeHost.tsx');
    const menu = read('src/screens/MenuScreen.tsx');
    const sportsbook = read('src/screens/ProviderSportsbookScreen.tsx');
    const plugin = read('plugins/owner-staff-onboarding.ts');
    assert.match(host, /<iframe/);
    assert.match(host, /integrationMode/);
    assert.match(host, /AuthToken/);
    assert.equal(host.includes('useSportsStore'), false);
    assert.equal(host.includes('MarketsGrid'), false);
    assert.match(sportsbook, /product="sportsbook"/);
    assert.match(menu, /provider-sportsbook/);
    assert.match(menu, /Бетконструктор/);
    assert.match(plugin, /attachBetConstructHttp/);
    assert.equal(plugin.includes('adaptLsportsStore'), false);
  });
});
