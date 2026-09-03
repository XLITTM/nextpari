import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_SPORTS_PLACE_PATH,
  handlePlayerSportsRequest,
} from './sportsPlaceHttp.js';
import { handleSportsSettleRequest, INTERNAL_SPORTS_SETTLE_PATH } from '../sports/settleHttp.js';
import { SPORTS_PLACE_SERVER_RPC } from '../sports/placeRpc.js';
import type { SportsPlacePorts } from './sportsPlaceService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import type { SportsQuote } from '../sports/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYER_ID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';
const ATTACKER_ID = 'ffffffff-9999-4999-8999-ffffffffffff';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

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

const PLACE_BODY = {
  stake: 10,
  mode: 'single' as const,
  idempotencyKey: 'k1',
  selections: [{
    fixtureId: '19981248',
    marketId: '1',
    marketKey: '19981248:1:',
    outcomeId: '117469638719981250',
    price: 1.85,
    playerUserId: ATTACKER_ID,
    userId: ATTACKER_ID,
    walletId: 'should-be-ignored',
  }],
  playerUserId: ATTACKER_ID,
  userId: ATTACKER_ID,
  walletId: 'should-be-ignored',
};

function createPorts(init?: {
  quote?: SportsQuote;
  rpcPayload?: Record<string, unknown>;
  rpcError?: string;
  placeImpl?: SportsPlacePorts['placeAsVerifiedPlayer'];
}): SportsPlacePorts & {
  places: Array<{ playerUserId: string; idempotencyKey: string; stake: number }>;
  rpcs: Array<{ name: string; args?: Record<string, unknown> }>;
  authUsers: string[];
} {
  const places: Array<{ playerUserId: string; idempotencyKey: string; stake: number }> = [];
  const rpcs: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const authUsers: string[] = [];
  return {
    places,
    rpcs,
    authUsers,
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signUp() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
    },
    async getAuthUser(accessToken) {
      authUsers.push(accessToken);
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
      return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    fetchQuote: async () => init?.quote ?? OPEN,
    placeAsVerifiedPlayer: init?.placeImpl ?? (async (args) => {
      places.push({
        playerUserId: args.playerUserId,
        idempotencyKey: args.idempotencyKey,
        stake: args.stake,
      });
      if (init?.rpcError) throw staffError(init.rpcError, 409);
      return init?.rpcPayload ?? {
        ok: true,
        isDuplicate: false,
        betId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        stake: args.stake,
        acceptedOdds: 1.85,
        balanceAfter: 40,
      };
    }),
    gameRpc() {
      return {
        async invoke(name: string, args?: Record<string, unknown>) {
          rpcs.push({ name, args });
          return { ok: true, bets: [] };
        },
      };
    },
  };
}

const enabled = { CANONICAL_SPORTS_BET_ENABLED: '1' };

async function place(
  ports: SportsPlacePorts,
  body: Record<string, unknown> = PLACE_BODY,
  env: NodeJS.ProcessEnv = enabled,
) {
  return handlePlayerSportsRequest(
    {
      method: 'POST',
      pathname: PLAYER_SPORTS_PLACE_PATH,
      cookie: cookieHeader(),
      cookieSecure: true,
      body,
    },
    ports,
    { error() {} },
    env,
  );
}

describe('player sports place HTTP', () => {
  it('rejects when the global switch is off and never debits', async () => {
    const ports = createPorts();
    const result = await place(ports, PLACE_BODY, { CANONICAL_SPORTS_BET_ENABLED: '0' });
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'SPORTS_BET_DISABLED');
    assert.equal(ports.places.length, 0);
    assert.equal(ports.authUsers.length, 0);
  });

  it('places through the server-only path after canonical quote validation', async () => {
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
    const result = await place(ports, { ...PLACE_BODY, idempotencyKey: 'same-key' });
    assert.equal(result.status, 200);
    assert.equal(result.body.isDuplicate, true);
    assert.equal(result.body.acceptedOdds, 1.85);
    assert.equal(ports.places.length, 1);
    assert.equal(String(ports.places[0]?.playerUserId), PLAYER_ID);
    assert.equal(String(ports.places[0]?.playerUserId) === ATTACKER_ID, false);
    assert.equal(ports.rpcs.some((row) => row.name === 'player_sports_place'), false);
    assert.equal(ports.authUsers.length, 1);
  });

  it('rejects browser fake prices, suspended markets, stale feed, missing ids, and insufficient balance without placing', async () => {
    const changedPorts = createPorts();
    const changed = await place(changedPorts, {
      ...PLACE_BODY,
      idempotencyKey: 'k2',
      selections: [{
        fixtureId: '19981248',
        marketId: '1',
        marketKey: '19981248:1:',
        outcomeId: '117469638719981250',
        price: 9.99,
      }],
    });
    assert.equal(changed.body.error, 'ODDS_CHANGED');
    assert.equal(changed.body.currentPrice, 1.85);
    assert.equal(changedPorts.places.length, 0);

    const missingKey = await place(createPorts(), {
      ...PLACE_BODY,
      idempotencyKey: 'k-missing-key',
      selections: [{
        fixtureId: '19981248',
        marketId: '1',
        outcomeId: '117469638719981250',
        price: 1.85,
      }],
    });
    assert.equal(missingKey.body.error, 'EVENT_UNAVAILABLE');

    const suspendedPorts = createPorts({ quote: { ...OPEN, selectable: false, status: 'suspended' } });
    const suspended = await place(suspendedPorts, { ...PLACE_BODY, idempotencyKey: 'k3' });
    assert.equal(suspended.body.error, 'MARKET_SUSPENDED');
    assert.equal(suspendedPorts.places.length, 0);

    const stalePorts = createPorts({ quote: { ...OPEN, health: 'STALE', heartbeatAgeMs: 20_000 } });
    const stale = await place(stalePorts, { ...PLACE_BODY, idempotencyKey: 'k-stale' });
    assert.equal(stale.body.error, 'FEED_STALE');
    assert.equal(stalePorts.places.length, 0);

    const missingBet = await place(createPorts(), {
      ...PLACE_BODY,
      idempotencyKey: 'k4',
      selections: [{ fixtureId: '19981248', outcomeId: '', price: 1.85 }],
    });
    assert.equal(missingBet.body.error, 'MISSING_BET_ID');

    const broke = createPorts({ rpcError: 'INSUFFICIENT_AVAILABLE_BALANCE' });
    const poor = await place(broke, { ...PLACE_BODY, idempotencyKey: 'k5' });
    assert.equal(poor.status, 409);
    assert.equal(poor.body.error, 'INSUFFICIENT_AVAILABLE_BALANCE');
    assert.equal(broke.places.length, 1);
  });

  it('debits once for the same idempotency key and for two concurrent identical requests', async () => {
    let debits = 0;
    const seen = new Map<string, Record<string, unknown>>();
    const ports = createPorts({
      placeImpl: async (args) => {
        const key = `${args.playerUserId}:${args.idempotencyKey}`;
        const existing = seen.get(key);
        if (existing) return { ...existing, isDuplicate: true };
        debits += 1;
        const row = {
          ok: true,
          isDuplicate: false,
          betId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          stake: args.stake,
          acceptedOdds: 1.85,
          balanceAfter: 40,
        };
        seen.set(key, row);
        return row;
      },
    });
    const first = await place(ports, { ...PLACE_BODY, idempotencyKey: 'dup' });
    const second = await place(ports, { ...PLACE_BODY, idempotencyKey: 'dup' });
    assert.equal(first.body.isDuplicate, false);
    assert.equal(second.body.isDuplicate, true);
    assert.equal(debits, 1);

    const concurrent = await Promise.all([
      place(ports, { ...PLACE_BODY, idempotencyKey: 'race' }),
      place(ports, { ...PLACE_BODY, idempotencyKey: 'race' }),
    ]);
    assert.equal(concurrent.filter((row) => row.status === 200).length, 2);
    assert.equal(debits, 2);
    assert.equal(concurrent.filter((row) => row.body.isDuplicate === true).length, 1);
  });
});

describe('sports place bypass lock', () => {
  it('revokes authenticated EXECUTE on the money RPC and grants only the server-only function to service_role', () => {
    const sql = read('supabase/migrations/20260903_036_server_only_sports_place.sql');
    assert.match(sql, /SPORTS_PLACE_SERVER_ONLY/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_sports_place\(TEXT, NUMERIC, TEXT, JSONB\) FROM anon, authenticated, service_role/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sports_place_for_player\(UUID, TEXT, NUMERIC, TEXT, JSONB\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.sports_place_for_player\(UUID, TEXT, NUMERIC, TEXT, JSONB\) FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_sports_list\(\) TO authenticated/);
    assert.match(sql, /private\.sports_require_player_by_id\(p_player_user_id\)/);
    assert.equal(sql.includes('auth.uid()'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.match(sql, /CASINO_BET/);
    assert.match(sql, /pg_advisory_xact_lock/);

    const place = read('server/player/sportsPlaceService.ts');
    assert.match(place, /getAuthUser/);
    assert.match(place, /placeAsVerifiedPlayer/);
    assert.equal(place.includes('player_sports_place'), false);
    assert.equal(place.includes('createServiceRoleClient'), false);
    assert.equal(place.includes('service_role'), false);
    assert.equal(SPORTS_PLACE_SERVER_RPC, 'sports_place_for_player');

    const rpc = read('server/sports/placeRpc.ts');
    assert.match(rpc, /createServiceRoleClient/);
    assert.match(rpc, /sports_place_for_player/);
    assert.equal(rpc.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), false);
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

    const dispatch = read('server/sports/settlementDispatch.ts');
    assert.match(dispatch, /LSPORTS_SETTLEMENT_WEBHOOK_URL/);
    assert.match(dispatch, /LSPORTS_SETTLEMENT_SECRET/);
    const settle = read('server/sports/settleHttp.ts');
    assert.match(settle, /\/api\/internal\/sports\/settle/);
    assert.match(settle, /sports_apply_settlement/);
    assert.match(settle, /createServiceRoleClient/);
    const example = read('deploy/lsports-worker.env.example');
    assert.match(example, /LSPORTS_SETTLEMENT_WEBHOOK_URL=https:\/\/nextpari\.net\/api\/internal\/sports\/settle/);
  });
});
