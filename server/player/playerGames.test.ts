import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_GAMES_START_PATH,
  handlePlayerGamesRequest,
} from './playerGamesHttp.js';
import type { PlayerGameGatewayPorts } from './playerGamesService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), 'utf8');
}

function cookieHeader(access = 'player-access-token', refresh = 'player-refresh-token'): string {
  return `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}; ${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`;
}

function createPorts(init?: {
  staff?: boolean;
  rpcError?: string;
  rpcPayload?: Record<string, unknown>;
  expireFirstRpc?: boolean;
  refreshFail?: boolean;
}): PlayerGameGatewayPorts & {
  rpcs: Array<{ token: string; name: string; args?: Record<string, unknown> }>;
  snapshotCalls: string[];
  refreshes: number;
} {
  const rpcs: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const snapshotCalls: string[] = [];
  let refreshes = 0;
  let rpcAttempts = 0;
  const ports = {
    rpcs,
    snapshotCalls,
    get refreshes() {
      return refreshes;
    },
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signUp() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      refreshes += 1;
      if (init?.refreshFail) throw staffError('JWT_INVALID', 401);
      return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
    },
    async getAuthUser(accessToken: string) {
      snapshotCalls.push('getAuthUser');
      if (!accessToken) throw staffError('AUTH_REQUIRED', 401);
      return { id: 'player-1', email: 'player@nextpari.test' };
    },
    async ensurePlayerAccount() {
      snapshotCalls.push('ensurePlayerAccount');
      if (init?.staff) throw staffError('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER', 403);
      return {
        walletId: '11111111-2222-3333-4444-555555555555',
        publicId: '110790',
        legacyBalance: 50,
        migrationState: 'staging',
      };
    },
    async loadOwnWallet() {
      snapshotCalls.push('loadOwnWallet');
      return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    gameRpc(accessToken: string) {
      return {
        async invoke(name: string, args?: Record<string, unknown>) {
          rpcs.push({ token: accessToken, name, args });
          rpcAttempts += 1;
          if (init?.expireFirstRpc && rpcAttempts === 1) {
            throw staffError('JWT_INVALID', 401);
          }
          if (init?.rpcError) {
            const status = init.rpcError === 'STAFF_CANNOT_PLAY'
              ? 403
              : init.rpcError === 'JWT_INVALID'
                ? 401
                : 409;
            throw staffError(init.rpcError, status);
          }
          return init?.rpcPayload ?? {
            ok: true,
            isDuplicate: false,
            roundId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            gameCode: 'dice',
            state: 'settled',
            stake: 10,
            totalStake: 10,
            payout: 0,
            balanceAfter: 40,
            serverSeedHash: 'abc',
            serverSeed: 'seed',
            nonce: 4,
            publicResult: { outcome: 'lose' },
            allowedActions: [],
          };
        },
      };
    },
  };
  return ports;
}

describe('player games BFF', () => {
  it('rejects unauthenticated start/action/get', async () => {
    const ports = createPorts();
    const start = await handlePlayerGamesRequest(
      { method: 'POST', pathname: PLAYER_GAMES_START_PATH, body: { gameCode: 'dice', stake: 10, idempotencyKey: 'k1' } },
      ports,
    );
    assert.equal(start.status, 401);
    assert.equal(start.body.error, 'JWT_REQUIRED');
    assert.equal(ports.rpcs.length, 0);

    const action = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: '/api/player/games/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/action',
        body: { action: 'hit', idempotencyKey: 'k2' },
      },
      ports,
    );
    assert.equal(action.status, 401);

    const get = await handlePlayerGamesRequest(
      { method: 'GET', pathname: '/api/player/games/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      ports,
    );
    assert.equal(get.status, 401);
  });

  it('rejects staff through session resolution and maps STAFF_CANNOT_PLAY', async () => {
    const playPorts = createPorts({ rpcError: 'STAFF_CANNOT_PLAY' });
    const play = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'k1' },
      },
      playPorts,
    );
    assert.equal(play.status, 403);
    assert.equal(play.body.error, 'STAFF_CANNOT_PLAY');
    assert.equal(playPorts.snapshotCalls.length, 0);
  });

  it('starts a game with player JWT and strips injected money fields', async () => {
    const ports = createPorts();
    const result = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: {
          gameCode: 'dice',
          stake: 10,
          idempotencyKey: 'same-key',
          options: { userId: 'evil', walletId: 'evil', payout: 999, result: 'win', autoCashout: 2 },
        },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(ports.rpcs.length, 1);
    assert.equal(ports.rpcs[0]?.name, 'player_game_start');
    assert.equal(ports.rpcs[0]?.token, 'player-access-token');
    const args = ports.rpcs[0]?.args ?? {};
    assert.equal(args.p_game_code, 'dice');
    assert.equal(args.p_stake, 10);
    assert.equal(args.p_idempotency_key, 'same-key');
    const options = args.p_options as Record<string, unknown>;
    assert.equal(options.userId, undefined);
    assert.equal(options.walletId, undefined);
    assert.equal(options.payout, undefined);
    assert.equal(options.result, undefined);
    assert.equal(options.autoCashout, 2);
    assert.equal(args.p_user_id, undefined);
    assert.equal(args.p_wallet_id, undefined);
    assert.equal(ports.snapshotCalls.length, 0);
    assert.equal(ports.rpcs.length, 1);
    assert.match(String(result.headers?.['Cache-Control'] ?? ''), /no-store/);
    assert.match(String(result.headers?.['Server-Timing'] ?? ''), /game;dur=/);
  });

  it('refreshes access once then retries the original game RPC once', async () => {
    const ports = createPorts({ expireFirstRpc: true });
    const result = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'k-refresh' },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.refreshes, 1);
    assert.equal(ports.rpcs.length, 2);
    assert.equal(ports.rpcs[1]?.token, 'player-access-rotated');
    assert.equal(ports.snapshotCalls.length, 0);
    assert.match(String(result.headers?.['Server-Timing'] ?? ''), /refresh;desc="1"/);
  });

  it('fails when refresh is invalid', async () => {
    const ports = createPorts({ expireFirstRpc: true, refreshFail: true });
    const result = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'k-bad-refresh' },
      },
      ports,
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_INVALID');
    assert.equal(ports.rpcs.length, 1);
  });

  it('maps insufficient balance and disabled/maintenance games', async () => {
    const low = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'k' },
      },
      createPorts({ rpcError: 'INSUFFICIENT_AVAILABLE_BALANCE' }),
    );
    assert.equal(low.status, 409);

    const disabled = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'future_seven', stake: 10, idempotencyKey: 'k' },
      },
      createPorts({ rpcError: 'GAME_DISABLED' }),
    );
    assert.equal(disabled.status, 409);

    const maint = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'future_seven', stake: 10, idempotencyKey: 'k' },
      },
      createPorts({ rpcError: 'GAME_MAINTENANCE' }),
    );
    assert.equal(maint.status, 409);
  });

  it('rejects wrong methods and does not use service_role', async () => {
    const ports = createPorts();
    const result = await handlePlayerGamesRequest(
      { method: 'GET', pathname: PLAYER_GAMES_START_PATH, cookie: cookieHeader() },
      ports,
    );
    assert.equal(result.status, 405);
    const service = readRel('./playerGamesService.ts') + readRel('./playerGameRpc.ts') + readRel('./playerGamesHttp.ts');
    assert.equal(service.includes('service_role'), false);
    assert.equal(service.includes('SERVICE_ROLE'), false);
  });
});
