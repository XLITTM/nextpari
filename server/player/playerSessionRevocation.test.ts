import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import { isCanonicalSportsBetEnabled } from '../sports/enabled.js';
import { PLAYER_GAMES_START_PATH, handlePlayerGamesRequest } from './playerGamesHttp.js';
import type { PlayerGameGatewayPorts } from './playerGamesService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { mapPlayerGameRpcError } from './playerGameRpc.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = '20260921233000_player_session_revocation_070.sql';

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function slice(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  assert.ok(start >= 0, signature);
  const end = sql.indexOf('$fn$;', start);
  assert.ok(end > start, signature);
  return sql.slice(start, end);
}

const sql = read('supabase/migrations/' + migrationName);
const sql054 = read('supabase/migrations/20260914060000_player_password_recovery_054.sql');
const sql059 = read('supabase/migrations/20260916203125_currency_limits_multicurrency_gameplay_059.sql');
const sql031 = read('supabase/migrations/20260901_031_game_stability_shared_aviator_rtp.sql');
const gate = slice(sql, 'CREATE OR REPLACE FUNCTION private.player_require_live_auth_session()');
const ctx = slice(sql, 'CREATE OR REPLACE FUNCTION private.game_require_player_context()');
const viewer = slice(sql, 'CREATE OR REPLACE FUNCTION private.game_require_session_viewer()');
const start = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_game_start(');
const action = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_game_action(');
const getter = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_game_get(');
const create = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_create_withdrawal(');
const list = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_list_withdrawals()');
const destinations = slice(sql, 'CREATE OR REPLACE FUNCTION public.player_list_cash_payout_destinations()');
const live054 = sql054.slice(
  sql054.indexOf('CREATE OR REPLACE FUNCTION private.player_auth_session_is_active('),
  sql054.indexOf('CREATE OR REPLACE FUNCTION public.player_auth_session_is_active('),
);

function cookieHeader(access = 'player-access-token', refresh = 'player-refresh-token'): string {
  return `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}; ${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`;
}

function gamePorts(mode: 'expire-once' | 'always-expired' | 'refresh-fails'): PlayerGameGatewayPorts & {
  rpcs: string[];
  refreshes: number;
} {
  const rpcs: string[] = [];
  let refreshes = 0;
  return {
    rpcs,
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
      if (mode === 'refresh-fails') throw staffError('JWT_INVALID', 401);
      return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
    },
    async getAuthUser() {
      return { id: 'player-1', email: 'player@nextpari.test' };
    },
    async ensurePlayerAccount() {
      return { walletId: 'w', publicId: '1', legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 0, currency: 'TMT', status: 'active', publicId: '1' };
    },
    async savePlayerProfile() {},
    gameRpc(accessToken: string) {
      return {
        async invoke() {
          rpcs.push(accessToken);
          if (mode === 'expire-once' && rpcs.length === 1) {
            throw staffError('SESSION_EXPIRED', 401);
          }
          if (mode === 'always-expired' || mode === 'refresh-fails') {
            throw staffError('SESSION_EXPIRED', 401);
          }
          return { ok: true, isDuplicate: true, roundId: 'round-1' };
        },
      };
    },
  };
}

describe('player session revocation', () => {
  it('A-E. canonical gate requires auth.uid and a live matching session', () => {
    assert.ok(gate.indexOf("RAISE EXCEPTION 'AUTH_REQUIRED'") < gate.indexOf("auth.jwt() ->> 'session_id'"));
    assert.match(gate, /v_uid := auth\.uid\(\)/);
    assert.match(gate, /NULLIF\(BTRIM\(COALESCE\(auth\.jwt\(\) ->> 'session_id', ''\)\), ''\)/);
    assert.match(gate, /WHEN invalid_text_representation THEN/);
    assert.match(gate, /RAISE EXCEPTION 'SESSION_EXPIRED'/);
    assert.match(gate, /private\.player_auth_session_is_active\(v_uid, v_session\)/);
    assert.match(gate, /RETURN v_uid/);
    assert.equal(gate.includes('FROM auth.sessions'), false);
    assert.match(live054, /FROM auth\.sessions AS s/);
    assert.match(live054, /s\.id = p_session_id/);
    assert.match(live054, /s\.user_id = p_player_user_id/);
    assert.equal(sql.includes('FROM auth.sessions'), false);
  });

  it('F-J. game and session-viewer RPCs call the live-session gate before the engine', () => {
    assert.match(ctx, /v_uid := private\.player_require_live_auth_session\(\)/);
    assert.equal(ctx.includes('auth.uid()'), false);
    assert.match(ctx, /STAFF_CANNOT_PLAY/);
    assert.match(ctx, /WALLET_BLOCKED/);
    assert.match(ctx, /WALLET_CLOSED/);
    assert.match(ctx, /PLAYER_WALLET_NOT_ACTIVE/);
    assert.match(ctx, /private\.player_active_wallet\(v_uid\)/);
    assert.match(viewer, /v_uid := private\.player_require_live_auth_session\(\)/);
    assert.equal(viewer.includes('auth.uid()'), false);
    assert.match(viewer, /STAFF_CANNOT_PLAY/);
    assert.match(viewer, /PLAYER_PROFILE_MISSING/);
    assert.ok(start.indexOf('player_require_live_auth_session') < start.indexOf('game_engine_start'));
    assert.ok(action.indexOf('player_require_live_auth_session') < action.indexOf('game_engine_action'));
    assert.ok(getter.indexOf('player_require_live_auth_session') < getter.indexOf('game_engine_get'));
    assert.match(sql031, /PERFORM private\.game_require_session_viewer\(\)/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.game_engine_start'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.player_game_session_get'), false);
  });

  it('K-M. withdrawal RPCs reject a revoked session before mutation or protected reads', () => {
    const gateAt = create.indexOf('player_require_live_auth_session');
    assert.ok(gateAt >= 0);
    assert.ok(gateAt < create.indexOf('owner_require_idempotency_key'));
    assert.ok(gateAt < create.indexOf('withdrawal_lock_player_wallet'));
    assert.ok(gateAt < create.indexOf('WITHDRAWAL_HOLD'));
    assert.ok(gateAt < create.indexOf('player_request_cashier_payout'));
    assert.ok(gateAt < create.indexOf('INSERT INTO private.player_withdrawal_requests'));
    assert.equal(create.includes('v_uid := auth.uid()'), false);
    assert.match(create, /is_duplicate', true/);
    assert.ok(list.indexOf('player_require_live_auth_session') < list.indexOf('withdrawal_reconcile_expired_cash'));
    assert.match(destinations, /player_require_live_auth_session/);
    assert.equal(destinations.includes('auth.uid()'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
  });

  it('N. SESSION_EXPIRED maps to HTTP 401', () => {
    const mapped = mapPlayerGameRpcError({ message: 'SESSION_EXPIRED' });
    assert.equal(mapped.code, 'SESSION_EXPIRED');
    assert.equal(mapped.httpStatus, 401);
    assert.match(read('server/player/playerGameRpc.ts'), /code === 'SESSION_EXPIRED'/);
    assert.match(read('server/player/playerGamesService.ts'), /error\.code === 'SESSION_EXPIRED'/);
  });

  it('O-Q. refresh runs once and does not loop after revocation', async () => {
    const replaced = gamePorts('expire-once');
    const ok = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'live-retry' },
      },
      replaced,
    );
    assert.equal(ok.status, 200);
    assert.equal(replaced.refreshes, 1);
    assert.deepEqual(replaced.rpcs, ['player-access-token', 'player-access-rotated']);

    const failed = gamePorts('refresh-fails');
    const denied = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'revoked' },
      },
      failed,
    );
    assert.equal(denied.status, 401);
    assert.equal(failed.refreshes, 1);
    assert.equal(failed.rpcs.length, 1);

    const loop = gamePorts('always-expired');
    const still = await handlePlayerGamesRequest(
      {
        method: 'POST',
        pathname: PLAYER_GAMES_START_PATH,
        cookie: cookieHeader(),
        body: { gameCode: 'dice', stake: 10, idempotencyKey: 'still-revoked' },
      },
      loop,
    );
    assert.equal(still.status, 401);
    assert.equal(still.body.error, 'SESSION_EXPIRED');
    assert.equal(loop.refreshes, 1);
    assert.equal(loop.rpcs.length, 2);
  });

  it('R-S. live idempotent replay stays in the unchanged engine and withdrawal body', () => {
    const engine = slice(sql059, 'CREATE OR REPLACE FUNCTION private.game_engine_start(');
    assert.match(engine, /IF v_existing\.start_response IS NOT NULL THEN/);
    assert.match(engine, /RETURN v_existing\.start_response/);
    assert.match(create, /IF FOUND THEN/);
    assert.match(create, /'is_duplicate', true/);
    assert.ok(create.indexOf('player_require_live_auth_session') < create.indexOf('IF FOUND THEN'));
  });

  it('keeps logout and password-reset revocation wired to auth.sessions', () => {
    const auth = read('server/player/playerAuthService.ts');
    assert.match(auth, /async signOut\(accessToken, refreshToken\)/);
    assert.match(auth, /client\.auth\.signOut\(\)/);
    assert.match(sql054, /DELETE FROM auth\.sessions AS s/);
    assert.match(sql054, /WHERE s\.user_id = p_player_user_id/);
    const recovery = read('server/email/playerPasswordRecoveryService.ts');
    assert.match(recovery, /liveRevokePlayerAuthSessions/);
    assert.equal(sql.includes('DELETE FROM auth.sessions'), false);
  });

  it('T. private session gate is not granted to browser roles', () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION private\.player_require_live_auth_session\(\) FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\.player_require_live_auth_session\(\) FROM anon, authenticated/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.player_require_live_auth_session'), false);
    assert.equal(/GRANT EXECUTE ON FUNCTION public\.player_create_withdrawal[\s\S]{0,120}TO anon/.test(sql), false);
    assert.equal(/GRANT EXECUTE ON FUNCTION public\.player_game_start[\s\S]{0,80}TO anon/.test(sql), false);
    const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('_070.sql'));
    assert.deepEqual(files, [migrationName]);
    assert.equal(sql.includes('CANONICAL_SPORTS_BET_ENABLED'), false);
    assert.equal(isCanonicalSportsBetEnabled({}), false);
    assert.equal(sql.includes('supabase db push'), false);
  });
});
