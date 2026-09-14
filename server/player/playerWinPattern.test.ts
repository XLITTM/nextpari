import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import { handleSecurityControlRequest } from '../security/securityControlHttp.js';
import { SECURITY_DENIED_RPCS } from '../security/securityRpc.js';
import { settledGameRoundId } from '../security/winPatternEvaluate.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import type { SecurityAuthGatewayPorts } from '../staff/securityAuthService.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from '../staff/securityCookies.js';
import { staffError } from '../staff/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(join(root, 'supabase/migrations/20260914043000_player_win_pattern_risk_signals_052.sql'), 'utf8');
const sql048 = readFileSync(join(root, 'supabase/migrations/20260913234500_player_fraud_security_foundation_048.sql'), 'utf8');
const sql035 = readFileSync(join(root, 'supabase/migrations/20260902_035_sports_betting_engine.sql'), 'utf8');
const settleHttp = readFileSync(join(root, 'server/sports/settleHttp.ts'), 'utf8');
const gamesService = readFileSync(join(root, 'server/player/playerGamesService.ts'), 'utf8');
const sql029 = readFileSync(join(root, 'supabase/migrations/20260901_029_canonical_games_engine.sql'), 'utf8');

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

describe('player win-pattern risk signals 052 (not executed)', () => {
  it('EXISTING FLAG TYPES PRESERVED and new types added on canonical table', () => {
    assert.match(sql, /'SHARED_DEVICE'/);
    assert.match(sql, /'SHARED_NETWORK'/);
    assert.match(sql, /'LOGIN_FAILURE_BURST'/);
    assert.match(sql, /'AUTH_RATE_LIMITED'/);
    assert.match(sql, /'HIGH_WIN_FREQUENCY'/);
    assert.match(sql, /'HIGH_NET_PROFIT'/);
    assert.match(sql, /'HIGH_ROI'/);
    assert.match(sql048, /CREATE TABLE IF NOT EXISTS private\.player_risk_flags/);
    assert.equal(sql.includes('CREATE TABLE IF NOT EXISTS private.player_risk_flags'), false);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_win_pattern_settings/);
    assert.match(sql, /player_risk_flags_active_uidx/);
    assert.match(sql, /'source', NULLIF\(f\.source, ''\)/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.owner_list_security_flags\(/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.security_list_security_flags\(/);
    assert.match(sql, /\(player_user_id, flag_type, source\)/);
  });

  it('SPORTS and OWNED GAMES analytics are separate; EXTERNAL_CASINO is not invented', () => {
    const metrics = extractFn(sql, 'private.player_win_pattern_metrics_json(');
    assert.match(metrics, /FROM private\.sports_bets/);
    assert.match(metrics, /FROM private\.game_rounds/);
    assert.match(metrics, /v_source = 'EXTERNAL_CASINO'/);
    assert.match(metrics, /'available', false/);
    assert.equal(metrics.includes('betb2b'), false);
    assert.equal(metrics.includes('wallet_ledger'), false);
    assert.equal(sql.includes('INSERT INTO private.sports_bets'), false);
    assert.equal(sql.includes('INSERT INTO private.game_rounds'), false);
  });

  it('SPORTS WIN CALCULATION, VOID EXCLUDED, EXPRESS COUNTED AS ONE BET', () => {
    const metrics = extractFn(sql, 'private.player_win_pattern_metrics_json(');
    assert.match(metrics, /b\.settlement_state = 'winner'/);
    assert.match(metrics, /b\.settlement_state = 'loser'/);
    assert.match(metrics, /b\.settlement_state IN \('winner', 'loser'\)/);
    assert.match(metrics, /b\.status = 'settled'/);
    assert.equal(/settlement_state = 'refund'/.test(metrics), false);
    assert.match(metrics, /b\.mode = 'express'/);
    assert.equal(metrics.includes('FROM private.sports_bet_legs'), false);
    assert.match(sql035, /CREATE TABLE IF NOT EXISTS private\.sports_bets/);
  });

  it('OWNED GAME PROFITABLE WIN, BREAK-EVEN NOT WIN, CANCELLED EXCLUDED', () => {
    const metrics = extractFn(sql, 'private.player_win_pattern_metrics_json(');
    assert.match(metrics, /r\.payout > r\.total_stake/);
    assert.match(metrics, /r\.payout < r\.total_stake/);
    assert.match(metrics, /r\.state = 'settled'/);
    assert.equal(metrics.includes("r.state = 'cancelled'"), false);
    assert.equal(metrics.includes('payout >= total_stake'), false);
    assert.match(sql029, /CREATE TABLE IF NOT EXISTS private\.game_rounds/);
  });

  it('ROI CALCULATION and ZERO STAKE DIVISION SAFE', () => {
    const metrics = extractFn(sql, 'private.player_win_pattern_metrics_json(');
    assert.match(metrics, /v_profit \/ v_stake/);
    assert.match(metrics, /COALESCE\(v_stake, 0\) > 0/);
    assert.match(metrics, /v_roi := NULL/);
    assert.match(metrics, /v_rate := NULL/);
  });

  it('MINIMUM SETTLED COUNT and MINIMUM TOTAL STAKE enforced; small sample cannot flag', () => {
    const evaluate = extractFn(sql, 'private.evaluate_player_win_pattern(');
    assert.match(evaluate, /v_settled < v_settings\.minimum_settled_count OR v_stake < v_settings\.minimum_total_stake/);
    assert.match(sql, /minimum_settled_count INTEGER NOT NULL/);
    assert.match(sql, /\('SPORTS', TRUE, 168, 25, 1000\.00/);
    assert.match(sql, /\('OWNED_GAMES', TRUE, 168, 40, 500\.00/);
    assert.match(sql, /CHECK \(minimum_settled_count BETWEEN 10 AND 10000\)/);
  });

  it('HIGH_WIN_FREQUENCY / HIGH_NET_PROFIT / HIGH_ROI flags upsert without duplicates', () => {
    const upsert = extractFn(sql, 'private.player_win_pattern_upsert_flag(');
    assert.match(upsert, /ON CONFLICT \(player_user_id, flag_type, source\) WHERE status IN \('open', 'reviewed'\)/);
    assert.match(upsert, /signal_count = private\.player_risk_flags\.signal_count \+ 1/);
    const evaluate = extractFn(sql, 'private.evaluate_player_win_pattern(');
    assert.match(evaluate, /HIGH_WIN_FREQUENCY/);
    assert.match(evaluate, /HIGH_NET_PROFIT/);
    assert.match(evaluate, /HIGH_ROI/);
  });

  it('AUTO ENFORCEMENT is absent', () => {
    const evaluate = extractFn(sql, 'private.evaluate_player_win_pattern(');
    assert.equal(evaluate.includes('set_player_security_restriction'), false);
    assert.equal(evaluate.includes('owner_set_player_blocked'), false);
    assert.equal(sql.includes('apply_wallet_entry'), false);
    assert.equal(sql.includes('sports_apply_settlement'), false);
    assert.equal(sql.includes('sports_engine_place'), false);
    assert.match(evaluate, /'automatic_restriction', false/);
    assert.match(evaluate, /'investigation_only', true/);
  });

  it('RISK FAILURE does not live inside settlement or payout engines', () => {
    assert.equal(sql035.includes('evaluate_player_win_pattern'), false);
    assert.equal(sql029.includes('evaluate_player_win_pattern'), false);
    assert.match(settleHttp, /safeEvaluateWinPatternAfterSportsFixtures/);
    assert.match(settleHttp, /must not fail a completed settlement/);
    assert.match(gamesService, /safeEvaluateWinPatternAfterGameRound/);
    assert.match(gamesService, /must not fail a completed payout/);
    const sportsFn = extractFn(sql, 'public.player_win_pattern_evaluate_after_sports_fixtures(');
    assert.match(sportsFn, /GRANT EXECUTE[\s\S]*TO service_role|private\.evaluate_player_win_pattern/);
  });

  it('thresholds are Owner-writable and Security-readable', () => {
    assert.match(sql, /public\.owner_set_win_pattern_settings\(/);
    assert.match(sql, /public\.security_win_pattern_settings\(\)/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.security_set_win_pattern_settings'), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_set_win_pattern_settings/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.security_win_pattern_settings\(\) TO authenticated/);
  });

  it('does not expose raw IP, device token, full hashes, or wallet ledger ids', () => {
    assert.equal(/raw.?ip/i.test(sql), false);
    assert.equal(sql.includes('device_token'), false);
    assert.equal(sql.includes('wallet_id'), false);
    assert.equal(sql.includes('bet_ledger_id'), false);
    assert.equal(sql.includes('idempotency_key'), false);
    const extras = extractFn(sql, 'private.player_win_pattern_dossier_extras(');
    assert.match(extras, /device_ref/);
    assert.match(extras, /network_ref/);
    assert.equal(extras.includes('device_hash'), false);
    assert.equal(extras.includes('network_hash'), false);
  });
});

describe('win-pattern HTTP and session isolation', () => {
  const ACCESS = 'tok';
  const REFRESH = 'ref';
  const OWNER_CTX = { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
  const SECURITY_CTX = { role: 'security', status: 'active', auth_user_id: 'sec-uid', display_name: 'Sec', login: 'sec01' };

  it('OWNER CAN CHANGE THRESHOLDS: YES and SECURITY CAN CHANGE THRESHOLDS: NO', async () => {
    const ownerCalls: string[] = [];
    const owner = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/security/win-pattern-settings',
        cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
        body: {
          source: 'SPORTS',
          enabled: true,
          lookbackHours: 168,
          minimumSettledCount: 25,
          minimumTotalStake: 1000,
          winRateThreshold: 0.7,
          netProfitThreshold: 3000,
          roiThreshold: 0.4,
        },
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async currentStaffContext() { return OWNER_CTX; },
        } satisfies OwnerAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name) {
            ownerCalls.push(name);
            return { ok: true };
          },
        }),
      },
    );
    assert.equal(owner.status, 200);
    assert.equal(ownerCalls[0], 'owner_set_win_pattern_settings');

    const securityPost = await handleSecurityControlRequest(
      {
        method: 'POST',
        pathname: '/api/security/win-pattern-settings',
        cookie: `${SECURITY_ACCESS_COOKIE}=${ACCESS}; ${SECURITY_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
        body: { source: 'SPORTS', enabled: false },
      },
      {
        sessionPorts: {
          async lookupLoginEmail() { throw staffError('AUTH_FAILED', 401); },
          async signInWithPassword() { throw staffError('AUTH_FAILED', 401); },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async currentStaffContext() { return SECURITY_CTX; },
        } satisfies SecurityAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke() {
            throw new Error('should not invoke');
          },
        }),
      },
    );
    assert.equal(securityPost.status, 405);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_set_win_pattern_settings'), true);
  });

  it('OWNER and SECURITY can read settings; Security can reevaluate', async () => {
    const owner = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/security/win-pattern-settings',
        cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async currentStaffContext() { return OWNER_CTX; },
        },
        rpcFactory: () => ({
          async invoke(name) {
            assert.equal(name, 'owner_win_pattern_settings');
            return { ok: true, rows: [] };
          },
        }),
      },
    );
    assert.equal(owner.status, 200);

    const security = await handleSecurityControlRequest(
      {
        method: 'GET',
        pathname: '/api/security/win-pattern-settings',
        cookie: `${SECURITY_ACCESS_COOKIE}=${ACCESS}; ${SECURITY_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async lookupLoginEmail() { throw staffError('AUTH_FAILED', 401); },
          async signInWithPassword() { throw staffError('AUTH_FAILED', 401); },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async currentStaffContext() { return SECURITY_CTX; },
        },
        rpcFactory: () => ({
          async invoke(name) {
            assert.equal(name, 'security_win_pattern_settings');
            return { ok: true, rows: [] };
          },
        }),
      },
    );
    assert.equal(security.status, 200);
  });

  it('settled game round helper only accepts settled payloads', () => {
    assert.equal(settledGameRoundId({ state: 'open', id: '11111111-1111-4111-8111-111111111111' }), null);
    assert.equal(settledGameRoundId({ state: 'cancelled', id: '11111111-1111-4111-8111-111111111111' }), null);
    assert.equal(
      settledGameRoundId({ state: 'settled', id: '11111111-1111-4111-8111-111111111111' }),
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
