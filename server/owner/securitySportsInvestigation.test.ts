import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mapOwnerRpcError } from './ownerRpc.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql050 = readFileSync(join(root, 'supabase/migrations/20260914023000_security_sports_investigation_050.sql'), 'utf8');
const sql035 = readFileSync(join(root, 'supabase/migrations/20260902_035_sports_betting_engine.sql'), 'utf8');
const sql049 = readFileSync(join(root, 'supabase/migrations/20260914020000_player_security_restrictions_049.sql'), 'utf8');
const http = readFileSync(join(root, 'server/owner/ownerControlHttp.ts'), 'utf8');
const rpc = readFileSync(join(root, 'server/owner/ownerRpc.ts'), 'utf8');
const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
const ui = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
const dashboard = ui;

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

const SECRET_KEYS = [
  'wallet_id',
  'bet_ledger_id',
  'last_settlement_ledger_id',
  'idempotency_key',
  'request_fingerprint',
  'settlement_fingerprint',
  'last_settlement_fingerprint',
];

describe('security sports investigation foundation 050', () => {
  it('SECURITY SPORTS HISTORY READ: ALLOWED via security context and Owner wrappers', () => {
    const securityList = extractFn(sql050, 'public.security_player_sports_bets(');
    const ownerList = extractFn(sql050, 'public.owner_player_sports_bets(');
    assert.match(securityList, /PERFORM private\.get_current_security_context\(\)/);
    assert.match(ownerList, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(securityList, /private\.security_list_player_sports_bets\(/);
    assert.match(ownerList, /private\.security_list_player_sports_bets\(/);
    assert.match(sql050, /GRANT EXECUTE ON FUNCTION public\.security_player_sports_bets/);
    assert.match(sql050, /GRANT EXECUTE ON FUNCTION public\.owner_player_sports_bets/);
    assert.match(http, /owner_player_sports_bets/);
    assert.match(services, /\/api\/owner\/players\/\$\{encodeURIComponent\(params\.playerId\)\}\/sports/);
    assert.equal(sql050.includes('CREATE TABLE') && /CREATE TABLE[\s\S]*sports_bets/.test(sql050), false);
    assert.match(sql035, /CREATE TABLE IF NOT EXISTS private\.sports_bets/);
    assert.match(sql035, /CREATE TABLE IF NOT EXISTS private\.sports_bet_legs/);
  });

  it('SECURITY SPORTS BET DETAILS: ALLOWED', () => {
    const securityDetail = extractFn(sql050, 'public.security_player_sports_bet(');
    const ownerDetail = extractFn(sql050, 'public.owner_player_sports_bet(');
    assert.match(securityDetail, /PERFORM private\.get_current_security_context\(\)/);
    assert.match(ownerDetail, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(securityDetail, /private\.security_sports_bet_json\(v_bet\)/);
    assert.match(ownerDetail, /private\.security_sports_bet_json\(v_bet\)/);
    assert.match(http, /owner_player_sports_bet/);
    assert.match(services, /\/sports\/\$\{encodeURIComponent\(betId\)\}/);
  });

  it('SECURITY EXPRESS LEGS READ: ALLOWED', () => {
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    const legJson = extractFn(sql050, 'private.security_sports_leg_json');
    assert.match(betJson, /FROM private\.sports_bet_legs AS l/);
    assert.match(betJson, /jsonb_agg\(private\.security_sports_leg_json\(l\.\*\) ORDER BY l\.accepted_at, l\.id\)/);
    assert.match(legJson, /fixture_label/);
    assert.match(legJson, /outcome_name/);
    assert.match(legJson, /accepted_odds/);
    assert.match(ui, /Спортивные ставки/);
    assert.match(ui, /Исход \$\{index \+ 1\}/);
  });

  it('SECURITY SPORTS SUMMARY: ALLOWED', () => {
    const securitySummary = extractFn(sql050, 'public.security_player_sports_summary');
    const ownerSummary = extractFn(sql050, 'public.owner_player_sports_summary');
    const summary = extractFn(sql050, 'private.security_player_sports_summary');
    assert.match(securitySummary, /PERFORM private\.get_current_security_context\(\)/);
    assert.match(ownerSummary, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(summary, /bets_count/);
    assert.match(summary, /total_stake/);
    assert.match(summary, /settled_payout/);
    assert.match(summary, /sports_ggr/);
    assert.match(summary, /v_ggr := v_settled_stake - v_settled_payout/);
    assert.match(summary, /IF v_settled_count > 0 THEN/);
    assert.match(summary, /v_ggr := NULL/);
    assert.match(http, /owner_player_sports_summary/);
    assert.match(services, /\/sports\/summary/);
  });

  it('SPORTS BET MUTATION BY SECURITY: DENIED', () => {
    assert.equal(sql050.includes('INSERT INTO private.sports_bets'), false);
    assert.equal(sql050.includes('UPDATE private.sports_bets'), false);
    assert.equal(sql050.includes('DELETE FROM private.sports_bets'), false);
    assert.equal(sql050.includes('INSERT INTO private.sports_bet_legs'), false);
    assert.equal(sql050.includes('UPDATE private.sports_bet_legs'), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place'), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION public.sports_place_for_player'), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION public.player_sports_place'), false);
    assert.match(http, /playerSportsBets[\s\S]*return m === 'GET'/);
  });

  it('SPORTS SETTLEMENT BY SECURITY: DENIED', () => {
    assert.equal(sql050.includes('sports_apply_settlement'), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION private.sports_engine_settle'), false);
    assert.equal(sql050.includes('last_payout_amount ='), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
  });

  it('SPORTS CANCELLATION BY SECURITY: DENIED', () => {
    assert.equal(sql050.includes('sports_cancel'), false);
    assert.equal(sql050.includes('CREATE OR REPLACE FUNCTION private.sports_engine_cancel'), false);
    assert.equal(/UPDATE\s+private\.sports_bets/.test(sql050), false);
    assert.equal(/UPDATE\s+private\.sports_bet_legs/.test(sql050), false);
  });

  it('SPORTS ODDS EDIT BY SECURITY: DENIED', () => {
    assert.equal(sql050.includes('accepted_odds ='), false);
    assert.equal(sql050.includes('SET accepted_odds'), false);
    assert.equal(sql050.includes('potential_payout ='), false);
    assert.equal(sql050.includes('stake ='), false);
  });

  it('RAW WALLET LEDGER IDS EXPOSED: NO', () => {
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    const legJson = extractFn(sql050, 'private.security_sports_leg_json');
    for (const key of ['wallet_id', 'bet_ledger_id', 'last_settlement_ledger_id']) {
      assert.equal(betJson.includes(`'${key}'`), false, key);
      assert.equal(legJson.includes(`'${key}'`), false, key);
    }
    assert.equal(sql050.includes('apply_wallet_entry'), false);
  });

  it('IDEMPOTENCY KEY EXPOSED: NO', () => {
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    const legJson = extractFn(sql050, 'private.security_sports_leg_json');
    const summary = extractFn(sql050, 'private.security_player_sports_summary');
    assert.equal(betJson.includes('idempotency_key'), false);
    assert.equal(legJson.includes('idempotency_key'), false);
    assert.equal(summary.includes('idempotency_key'), false);
    const sportsUi = ui.slice(ui.indexOf('function PlayerSportsInvestigation'));
    assert.equal(sportsUi.includes('idempotency'), false);
  });

  it('REQUEST FINGERPRINT EXPOSED: NO', () => {
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    const summary = extractFn(sql050, 'private.security_player_sports_summary');
    assert.equal(betJson.includes('request_fingerprint'), false);
    assert.equal(summary.includes('request_fingerprint'), false);
    assert.equal(ui.includes('request_fingerprint'), false);
  });

  it('SETTLEMENT FINGERPRINT EXPOSED: NO', () => {
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    const legJson = extractFn(sql050, 'private.security_sports_leg_json');
    assert.equal(betJson.includes('settlement_fingerprint'), false);
    assert.equal(betJson.includes('last_settlement_fingerprint'), false);
    assert.equal(legJson.includes('settlement_fingerprint'), false);
  });

  it('AUTOMATIC ARBITRAGE RESTRICTION: NO', () => {
    const summary = extractFn(sql050, 'private.security_player_sports_summary');
    assert.match(summary, /'automatic_restriction', false/);
    assert.equal(sql050.includes('set_player_security_restriction'), false);
    assert.equal(sql050.includes('owner_set_player_security_restriction'), false);
    assert.equal(sql050.includes('owner_set_player_blocked'), false);
    assert.match(ui, /автоматическое ограничение не применяется/i);
    assert.match(sql049, /CREATE OR REPLACE FUNCTION public\.owner_set_player_security_restriction/);
  });

  it('FAKE CLOSING PRICE DATA: NO', () => {
    const summary = extractFn(sql050, 'private.security_player_sports_summary');
    const betJson = extractFn(sql050, 'private.security_sports_bet_json');
    assert.match(summary, /'closing_price_available', false/);
    assert.equal(betJson.includes('closing_price'), false);
    assert.equal(betJson.includes('closing_odds'), false);
    assert.equal(summary.includes('closing_odds'), false);
    assert.equal(summary.includes('clv'), false);
    assert.match(ui, /Закрывающие коэффициенты недоступны до интеграции BetB2B/);
    assert.equal(sql050.includes('betb2b_closing'), false);
  });

  it('denies manager, cashier, and player at the SQL security gate', () => {
    const ctx = extractFn(sql050, 'private.get_current_security_context');
    assert.match(ctx, /RAISE EXCEPTION 'SECURITY_REQUIRED'/);
    assert.match(ctx, /v_row\.role IS DISTINCT FROM 'security'/);
    assert.equal(mapOwnerRpcError({ message: 'SECURITY_REQUIRED' }).httpStatus, 403);
    assert.match(rpc, /SECURITY_REQUIRED/);
    const ownerList = extractFn(sql050, 'public.owner_player_sports_bets(');
    assert.match(ownerList, /get_current_owner_context/);
    assert.equal(ownerList.includes('get_current_manager_context'), false);
    assert.equal(ownerList.includes('get_current_cashier_context'), false);
  });

  it('keeps sports investigation read-only in Owner HTTP and dossier UI', () => {
    assert.match(http, /kind: 'playerSportsBets'/);
    assert.match(http, /kind: 'playerSportsSummary'/);
    assert.match(http, /kind: 'playerSportsBet'/);
    assert.equal(http.includes('owner_set_player_blocked'), true);
    const sportsRun = http.slice(http.indexOf("case 'playerSportsBets'"), http.indexOf("case 'securityOverview'"));
    assert.equal(sportsRun.includes('owner_set_player_blocked'), false);
    assert.equal(sportsRun.includes('sports_apply_settlement'), false);
    assert.equal(sportsRun.includes('apply_wallet_entry'), false);
    assert.match(dashboard, /PlayerSportsInvestigation/);
    assert.equal(dashboard.includes('setOwnerPlayerBlocked'), false);
    for (const key of SECRET_KEYS) {
      assert.equal(ui.includes(key), false, key);
    }
  });
});
