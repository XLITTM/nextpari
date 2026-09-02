import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_SPORTS_PLACE_PATH,
  handlePlayerSportsRequest,
} from './sportsPlaceHttp.js';
import { handleSportsSettleRequest, INTERNAL_SPORTS_SETTLE_PATH } from '../sports/settleHttp.js';
import type { SportsPlacePorts } from './sportsPlaceService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import type { SportsQuote } from '../sports/types.js';

function cookieHeader(access = 'player-access-token', refresh = 'player-refresh-token'): string {
  return `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}; ${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`;
}

const OPEN: SportsQuote = {
  provider: 'lsports',
  feedType: 'inplay',
  fixtureId: '19981248',
  marketId: '1',
  marketKey: '19981248:1:',
  line: '',
  outcomeId: '117469638719981250',
  outcomeName: '1',
  price: 1.85,
  status: 'open',
  marketStatus: '1',
  betStatus: '1',
  betStatusId: '1',
  selectable: true,
  updatedAt: null,
  health: 'HEALTHY',
  heartbeatAgeMs: 100,
};

function createPorts(init?: {
  quote?: SportsQuote;
  rpcPayload?: Record<string, unknown>;
  rpcError?: string;
}): SportsPlacePorts & { rpcs: Array<{ name: string; args?: Record<string, unknown> }> } {
  const rpcs: Array<{ name: string; args?: Record<string, unknown> }> = [];
  return {
    rpcs,
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signUp() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
    },
    async getAuthUser() {
      return { id: 'player-1', email: 'player@nextpari.test' };
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
      return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    fetchQuote: async () => init?.quote ?? OPEN,
    gameRpc() {
      return {
        async invoke(name: string, args?: Record<string, unknown>) {
          rpcs.push({ name, args });
          if (init?.rpcError) throw staffError(init.rpcError, 409);
          return init?.rpcPayload ?? {
            ok: true,
            isDuplicate: false,
            betId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            stake: 10,
            acceptedOdds: 1.85,
            balanceAfter: 40,
          };
        },
      };
    },
  };
}

const enabled = { CANONICAL_SPORTS_BET_ENABLED: '1' };

describe('player sports place HTTP', () => {
  it('rejects when the global switch is off', async () => {
    const result = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'k1',
          selections: [{ fixtureId: '19981248', outcomeId: '117469638719981250', price: 1.85 }],
        },
      },
      createPorts(),
      { error() {} },
      { CANONICAL_SPORTS_BET_ENABLED: '0' },
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'SPORTS_BET_DISABLED');
  });

  it('accepts a valid open selection and does not trust a second debit on duplicate RPC', async () => {
    const ports = createPorts({
      rpcPayload: {
        ok: true,
        isDuplicate: true,
        betId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        stake: 10,
        acceptedOdds: 1.85,
        balanceAfter: 40,
      },
    });
    const result = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'same-key',
          selections: [{
            fixtureId: '19981248',
            marketId: '1',
            outcomeId: '117469638719981250',
            price: 1.85,
          }],
        },
      },
      ports,
      { error() {} },
      enabled,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.isDuplicate, true);
    assert.equal(result.body.acceptedOdds, 1.85);
    assert.equal(ports.rpcs.length, 1);
    assert.equal(ports.rpcs[0]?.name, 'player_sports_place');
    assert.equal((ports.rpcs[0]?.args?.p_legs as Array<{ acceptedOdds: number }>)[0]?.acceptedOdds, 1.85);
  });

  it('rejects browser fake prices, suspended markets, missing ids, and insufficient balance without placing', async () => {
    const changed = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'k2',
          selections: [{ fixtureId: '19981248', outcomeId: '117469638719981250', price: 9.99 }],
        },
      },
      createPorts(),
      { error() {} },
      enabled,
    );
    assert.equal(changed.body.error, 'ODDS_CHANGED');
    assert.equal(changed.body.currentPrice, 1.85);

    const suspended = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'k3',
          selections: [{ fixtureId: '19981248', outcomeId: '117469638719981250', price: 1.85 }],
        },
      },
      createPorts({ quote: { ...OPEN, selectable: false, status: 'suspended' } }),
      { error() {} },
      enabled,
    );
    assert.equal(suspended.body.error, 'MARKET_SUSPENDED');

    const missingBet = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'k4',
          selections: [{ fixtureId: '19981248', outcomeId: '', price: 1.85 }],
        },
      },
      createPorts(),
      { error() {} },
      enabled,
    );
    assert.equal(missingBet.body.error, 'MISSING_BET_ID');

    const broke = createPorts({ rpcError: 'INSUFFICIENT_AVAILABLE_BALANCE' });
    const poor = await handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          stake: 10,
          mode: 'single',
          idempotencyKey: 'k5',
          selections: [{ fixtureId: '19981248', outcomeId: '117469638719981250', price: 1.85 }],
        },
      },
      broke,
      { error() {} },
      enabled,
    );
    assert.equal(poor.status, 409);
    assert.equal(poor.body.error, 'INSUFFICIENT_AVAILABLE_BALANCE');
  });
});

describe('internal settlement webhook', () => {
  it('requires the settlement secret and is idempotent at the RPC boundary', async () => {
    const denied = await handleSportsSettleRequest(
      { method: 'POST', pathname: INTERNAL_SPORTS_SETTLE_PATH, authorization: 'Bearer no', body: { items: [{}] } },
      { LSPORTS_SETTLEMENT_SECRET: 'expected-secret' },
    );
    assert.equal(denied.status, 401);

    let calls = 0;
    const ok = await handleSportsSettleRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SPORTS_SETTLE_PATH,
        authorization: 'Bearer expected-secret',
        body: { items: [{ fingerprint: 'a', fixtureId: '1', outcomeId: '2', settlement: 2 }] },
      },
      { LSPORTS_SETTLEMENT_SECRET: 'expected-secret' },
      { error() {} },
      async (items) => {
        calls += 1;
        return { ok: true, results: items.map(() => ({ result: 'duplicate' })) };
      },
    );
    assert.equal(ok.status, 200);
    assert.equal(calls, 1);
  });
});
