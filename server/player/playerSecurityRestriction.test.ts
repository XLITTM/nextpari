import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mapCashierRpcError } from '../cashier/cashierRpc.js';
import { mapOwnerRpcError } from '../owner/ownerRpc.js';
import { mapPlayerGameRpcError } from './playerGameRpc.js';
import {
  PLAYER_EXTERNAL_CASINO_GATE_RPC,
  PLAYER_EXTERNAL_CASINO_RESTRICTED,
  PLAYER_SECURITY_DEPOSIT_RESTRICTED,
  PLAYER_SECURITY_WITHDRAWAL_RESTRICTED,
} from './playerSecurityRestrictionGate.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql049 = readFileSync(join(root, 'supabase/migrations/20260914020000_player_security_restrictions_049.sql'), 'utf8');
const sql048 = readFileSync(join(root, 'supabase/migrations/20260913234500_player_fraud_security_foundation_048.sql'), 'utf8');
const sql041 = readFileSync(join(root, 'supabase/migrations/20260913133000_withdrawal_ledger_041.sql'), 'utf8');
const sql036 = readFileSync(join(root, 'supabase/migrations/20260903_036_server_only_sports_place.sql'), 'utf8');
const sql029 = readFileSync(join(root, 'supabase/migrations/20260901_029_canonical_games_engine.sql'), 'utf8');
const sql024 = readFileSync(join(root, 'supabase/migrations/20260831_024_cashier_player_finance_api.sql'), 'utf8');
const sql042 = readFileSync(join(root, 'supabase/migrations/20260913163000_owner_player_debit_cashier_reversal_042.sql'), 'utf8');
const login = readFileSync(join(root, 'server/player/playerAuthService.ts'), 'utf8');
const sportsPlace = readFileSync(join(root, 'server/player/sportsPlaceService.ts'), 'utf8');
const gate = readFileSync(join(root, 'server/player/playerSecurityRestrictionGate.ts'), 'utf8');
const ownerHttp = readFileSync(join(root, 'server/owner/ownerControlHttp.ts'), 'utf8');
const playersPanel = readFileSync(join(root, 'src/owner/PlayersPanel.tsx'), 'utf8');
const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

describe('player security restriction foundation 049', () => {
  it('creates current-state restriction model and append-only events', () => {
    assert.match(sql049, /CREATE TABLE IF NOT EXISTS private\.player_security_restrictions/);
    assert.match(sql049, /player_user_id UUID PRIMARY KEY/);
    assert.match(sql049, /player_public_id TEXT NOT NULL/);
    assert.match(sql049, /is_active BOOLEAN NOT NULL/);
    assert.match(sql049, /created_by UUID NOT NULL/);
    assert.match(sql049, /updated_by UUID NOT NULL/);
    assert.match(sql049, /CREATE TABLE IF NOT EXISTS private\.player_security_restriction_events/);
    assert.match(sql049, /SECURITY_RESTRICTION_APPLIED/);
    assert.match(sql049, /SECURITY_RESTRICTION_REMOVED/);
    assert.match(sql049, /PLAYER_SECURITY_RESTRICTION_EVENTS_APPEND_ONLY/);
    assert.match(sql049, /BEFORE UPDATE OR DELETE ON private\.player_security_restriction_events/);
    assert.match(sql049, /REVOKE ALL ON TABLE private\.player_security_restrictions FROM anon, authenticated/);
    assert.match(sql049, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_security_restriction_events FROM service_role/);
    assert.equal(sql049.includes('x-forwarded-for'), false);
    assert.equal(sql049.includes('device_token'), false);
    assert.equal(/raw IP|device token/i.test(sql049), false);
  });

  it('LOGIN UNDER SECURITY RESTRICTION: ALLOWED', () => {
    assert.equal(login.includes('is_player_security_restricted'), false);
    assert.equal(login.includes('require_player_withdrawal_allowed'), false);
    assert.equal(login.includes('SECURITY_WITHDRAWAL_RESTRICTED'), false);
    const checkLogin = extractFn(sql048, 'private.player_security_check_login');
    assert.equal(checkLogin.includes('is_player_security_restricted'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.player_security_check_login'), false);
  });

  it('SPORTS UNDER SECURITY RESTRICTION: ALLOWED and hard wallet block remains', () => {
    const sportsCtx = extractFn(sql036, 'private.sports_require_player_by_id');
    assert.match(sportsCtx, /WALLET_BLOCKED/);
    assert.equal(sportsCtx.includes('is_player_security_restricted'), false);
    assert.equal(sportsCtx.includes('SECURITY_CASINO_RESTRICTED'), false);
    assert.equal(sportsCtx.includes('SECURITY_WITHDRAWAL_RESTRICTED'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.sports_require_player_by_id'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place_as'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.sports_place_for_player'), false);
    assert.equal(sportsPlace.includes('require_player_external_casino_allowed'), false);
    assert.match(sql049, /Does NOT rewrite[\s\S]*sports settlement/);
  });

  it('OWNED GAMES UNDER SECURITY RESTRICTION: ALLOWED and hard wallet block remains', () => {
    const gameCtx = extractFn(sql029, 'private.game_require_player_context');
    assert.match(gameCtx, /WALLET_BLOCKED/);
    assert.equal(gameCtx.includes('is_player_security_restricted'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.game_require_player_context'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.player_game_start'), false);
    assert.match(sql029, /'CASINO_WIN'/);
    assert.equal(sql049.includes("RAISE EXCEPTION 'CASINO_WIN'"), false);
  });

  it('EXTERNAL CASINO UNDER SECURITY RESTRICTION: DENIED', () => {
    assert.equal(PLAYER_EXTERNAL_CASINO_GATE_RPC, 'require_player_external_casino_allowed');
    assert.equal(PLAYER_EXTERNAL_CASINO_RESTRICTED, 'SECURITY_CASINO_RESTRICTED');
    assert.match(sql049, /CREATE OR REPLACE FUNCTION private\.require_player_external_casino_allowed/);
    assert.match(sql049, /RAISE EXCEPTION 'SECURITY_CASINO_RESTRICTED'/);
    assert.match(sql049, /Future BetB2B launch\/wallet adapters MUST call this/);
    assert.match(gate, /public\.require_player_external_casino_allowed/);
    assert.equal(sql049.includes('betb2b'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.betb2b'), false);
    assert.equal(mapPlayerGameRpcError({ message: 'SECURITY_CASINO_RESTRICTED' }).httpStatus, 409);
  });

  it('WITHDRAWAL UNDER SECURITY RESTRICTION: DENIED before hold/payout', () => {
    const create = extractFn(sql049, 'public.player_create_withdrawal');
    const gateAt = create.indexOf('PERFORM private.require_player_withdrawal_allowed(v_uid)');
    const cashAt = create.indexOf('public.player_request_cashier_payout');
    const holdAt = create.indexOf("'WITHDRAWAL_HOLD'");
    assert.ok(gateAt > 0);
    assert.ok(gateAt < cashAt);
    assert.ok(gateAt < holdAt);
    assert.match(create, /SECURITY_WITHDRAWAL_RESTRICTED|require_player_withdrawal_allowed/);
    assert.equal(PLAYER_SECURITY_WITHDRAWAL_RESTRICTED, 'SECURITY_WITHDRAWAL_RESTRICTED');
    assert.match(sql049, /RAISE EXCEPTION 'SECURITY_WITHDRAWAL_RESTRICTED'/);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(create.includes('UPDATE public.wallets'), false);
    assert.equal(mapPlayerGameRpcError({ message: 'SECURITY_WITHDRAWAL_RESTRICTED' }).httpStatus, 409);
    assert.match(sql041, /CREATE OR REPLACE FUNCTION public\.player_create_withdrawal/);
  });

  it('CASHIER PLAYER DEPOSIT UNDER SECURITY RESTRICTION: DENIED before wallet mutation', () => {
    const deposit = extractFn(sql049, 'public.cashier_deposit_player');
    const gateAt = deposit.indexOf('PERFORM private.require_player_deposit_allowed');
    const moneyAt = deposit.indexOf("private.apply_operational_transfer");
    assert.ok(gateAt > 0 && gateAt < moneyAt);
    assert.match(sql049, /RAISE EXCEPTION 'SECURITY_DEPOSIT_RESTRICTED'/);
    assert.equal(PLAYER_SECURITY_DEPOSIT_RESTRICTED, 'SECURITY_DEPOSIT_RESTRICTED');
    assert.equal(deposit.includes('UPDATE public.wallets'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.cashier_reverse_player_deposit'), false);
    assert.match(sql042, /CREATE OR REPLACE FUNCTION public\.cashier_reverse_player_deposit/);
    assert.equal(sql049.includes('owner_fund_player'), false);
    assert.match(ownerHttp, /owner_fund_player/);
    assert.equal(mapCashierRpcError({ message: 'SECURITY_DEPOSIT_RESTRICTED' }).httpStatus, 409);
    assert.match(sql024, /CREATE OR REPLACE FUNCTION public\.cashier_deposit_player/);
  });

  it('WALLET STATUS CHANGED BY SECURITY RESTRICTION: NO and HARD BLOCK API CHANGED: NO', () => {
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION public.owner_set_player_blocked'), false);
    assert.equal(/UPDATE\s+public\.wallets/.test(sql049), false);
    assert.equal(/UPDATE\s+public\.profiles/.test(sql049), false);
    assert.equal(/UPDATE\s+private\.wallet_accounts/.test(sql049), false);
    assert.equal(/SET\s+is_blocked\s*=/.test(sql049), false);
    assert.match(ownerHttp, /owner_set_player_blocked/);
    assert.match(playersPanel, /setOwnerPlayerBlocked/);
    assert.equal(dashboard.includes('setOwnerPlayerBlocked'), false);
  });

  it('does not auto-close fraud flags or rewrite sports/owned-game money', () => {
    assert.equal(sql049.includes('owner_resolve_security_flag'), false);
    assert.equal(sql049.includes('UPDATE private.player_risk_flags'), false);
    assert.match(sql049, /private\.append_staff_audit/);
    assert.match(sql049, /'owner_only'/);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql049.includes('CREATE OR REPLACE FUNCTION private.apply_operational_transfer'), false);
    assert.equal(sql049.includes("RAISE EXCEPTION 'SPORTS_BET_DISABLED'"), false);
    const mutator = extractFn(sql049, 'private.security_restriction_mutator_role_allowed');
    assert.match(mutator, /'owner'/);
    assert.equal(mutator.includes("'manager'"), false);
    assert.equal(mutator.includes("'cashier'"), false);
    assert.equal(mutator.includes("'player'"), false);
    assert.match(sql049, /later dedicated security staff role/);
    assert.equal(mapOwnerRpcError({ message: 'SECURITY_RESTRICTION_ACTOR_DENIED' }).httpStatus, 403);
  });
});
