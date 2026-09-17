import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dicePayoutForVersion, DICE_V2_MATH_VERSION, DICE_V3_MATH_VERSION, DICE_V4_MATH_VERSION } from '../games/dicePayout.js';
import { blackjackPayoutForVersion } from '../games/blackjackPayout.js';
import {
  BLACKJACK_GOLDEN_PAYOUT,
  BLACKJACK_MATH_VERSION,
  BLACKJACK_PUSH_PAYOUT,
  BLACKJACK_V2_MATH_VERSION,
  BLACKJACK_V3_MATH_VERSION,
  BLACKJACK_V4_MATH_VERSION,
  BLACKJACK_V5_EXACT_RTP,
  BLACKJACK_WIN_PAYOUT,
  evaluateBlackjackExactVisibleDealer,
} from '../games/rtp/blackjackMath.js';
import {
  DICE_DRAW_COUNT,
  DICE_LOSS_COUNT,
  DICE_MATH_VERSION,
  DICE_OUTCOME_TOTAL,
  DICE_V4_EXACT_RTP,
  DICE_V4_RTP_DENOMINATOR,
  DICE_V4_RTP_NUMERATOR,
  DICE_WIN_COUNT,
  DICE_WIN_PAYOUT,
  diceExactRtp,
} from '../games/rtp/diceMath.js';
import { mapPlayerGameRpcError } from '../player/playerGameRpc.js';
import { mapOwnerRpcError } from './ownerRpc.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationsDir = join(root, 'supabase/migrations');

function migrationNamed(suffix: string): string {
  const name = readdirSync(migrationsDir).find((file) => file.endsWith(suffix));
  assert.ok(name, `missing migration ${suffix}`);
  return readFileSync(join(migrationsDir, name), 'utf8');
}

function functionSql(sql: string, signature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  assert.equal(start >= 0, true, `missing ${signature}`);
  const end = sql.indexOf('$fn$;', start);
  assert.equal(end > start, true, `missing body ${signature}`);
  return sql.slice(start, end + 5);
}

const sql059 = migrationNamed('currency_limits_multicurrency_gameplay_059.sql');
const sql060 = migrationNamed('owned_games_math_hardening_060.sql');

describe('phase 060 dice math', () => {
  it('keeps the exact 2d6 vs 2d6 distribution and pays v4 1.96', () => {
    assert.equal(DICE_OUTCOME_TOTAL, 1296);
    assert.equal(DICE_WIN_COUNT, 575);
    assert.equal(DICE_DRAW_COUNT, 146);
    assert.equal(DICE_LOSS_COUNT, 575);
    assert.equal(DICE_WIN_COUNT + DICE_DRAW_COUNT + DICE_LOSS_COUNT, 1296);
    const row = diceExactRtp(DICE_WIN_PAYOUT);
    assert.equal(DICE_MATH_VERSION, 'dice-v4-house-edge');
    assert.equal(DICE_WIN_PAYOUT, 1.96);
    assert.equal(row.numerator / 100, DICE_V4_RTP_NUMERATOR);
    assert.equal(row.denominator / 100, DICE_V4_RTP_DENOMINATOR);
    assert.equal(row.rtp, 1273 / 1296);
    assert.equal(row.rtp, DICE_V4_EXACT_RTP);
    assert.ok(row.rtp < 1);
    assert.ok(row.houseEdge > 0);
    assert.equal(dicePayoutForVersion(100, 'win', DICE_V4_MATH_VERSION), 196);
    assert.equal(dicePayoutForVersion(100, 'draw', DICE_V4_MATH_VERSION), 100);
    assert.equal(dicePayoutForVersion(100, 'win', DICE_V3_MATH_VERSION), 200);
    assert.equal(dicePayoutForVersion(100, 'win', DICE_V2_MATH_VERSION), 172);
    const helper = functionSql(sql060, 'private.game_dice_win_multiplier_for_version(');
    assert.match(helper, /dice-v2-rtp875/);
    assert.match(helper, /dice-v3-win2/);
    assert.match(helper, /dice-v4-house-edge/);
    assert.match(helper, /RETURN 1\.96/);
    assert.equal(helper.includes('player_id'), false);
    assert.equal(helper.includes('currency'), false);
    assert.match(sql060, /1273::NUMERIC \/ 1296/);
  });
});

describe('phase 060 blackjack math', () => {
  it('verifies v5 1.94 optimal RTP inside 0.980-0.990 without changing rules', () => {
    const exact = evaluateBlackjackExactVisibleDealer(1.94);
    assert.equal(BLACKJACK_MATH_VERSION, 'blackjack-v5-visible-dealer-house-edge');
    assert.equal(BLACKJACK_WIN_PAYOUT, 1.94);
    assert.equal(BLACKJACK_GOLDEN_PAYOUT, 2);
    assert.equal(BLACKJACK_PUSH_PAYOUT, 1);
    assert.ok(exact.rtp >= 0.98);
    assert.ok(exact.rtp <= 0.99);
    assert.ok(exact.rtp < 1);
    assert.ok(Math.abs(exact.rtp - BLACKJACK_V5_EXACT_RTP) < 1e-12);
    assert.equal(blackjackPayoutForVersion(100, 'win', BLACKJACK_MATH_VERSION), 194);
    assert.equal(blackjackPayoutForVersion(100, 'golden', BLACKJACK_MATH_VERSION), 200);
    assert.equal(blackjackPayoutForVersion(100, 'win', BLACKJACK_V4_MATH_VERSION), 200);
    assert.equal(blackjackPayoutForVersion(100, 'win', BLACKJACK_V3_MATH_VERSION), 170);
    assert.equal(blackjackPayoutForVersion(100, 'win', BLACKJACK_V2_MATH_VERSION), 184);
    const helper = functionSql(sql060, 'private.game_bj_payout_for_version(');
    assert.match(helper, /blackjack-v2-rtp875/);
    assert.match(helper, /blackjack-v3-visible-dealer-rtp875/);
    assert.match(helper, /blackjack-v4-visible-dealer-win2/);
    assert.match(helper, /blackjack-v5-visible-dealer-house-edge/);
    assert.match(helper, /v_win := 1\.94/);
    assert.equal(helper.includes('player_id'), false);
    const diceUi = readFileSync(join(root, 'src/games/dice/DiceGame.tsx'), 'utf8');
    const bjUi = readFileSync(join(root, 'src/games/blackjack/BlackjackGame.tsx'), 'utf8');
    assert.match(diceUi, /DICE_WIN_MULTIPLIER = 1\.96/);
    assert.match(bjUi, /BLACKJACK_WIN_PAYOUT\.toFixed\(2\)/);
    assert.equal(bjUi.includes('×2.00 от ставки'), false);
  });
});

describe('phase 060 multi-currency owned games SQL', () => {
  it('does not enable non-TMT owned games and does not rewrite money', () => {
    const preamble = sql060.slice(0, sql060.indexOf('CREATE OR REPLACE FUNCTION private.game_dice_win_multiplier_for_version'));
    assert.equal(preamble.includes("owned_games_enabled = TRUE"), false);
    assert.equal(preamble.includes("owned_games_enabled = true"), false);
    assert.match(sql060, /DROP CONSTRAINT IF EXISTS supported_currencies_non_tmt_owned_games_blocked/);
    assert.match(sql059, /owned_games_enabled IS DISTINCT FROM TRUE/);
    for (const table of [
      'wallet_accounts',
      'wallet_ledger',
      'operational_accounts',
      'operational_ledger',
      'sports_bets',
      'game_rounds',
      'player_withdrawal_requests',
      'crypto_deposit_quotes',
    ]) {
      assert.equal(preamble.includes(`UPDATE private.${table}`), false, table);
      assert.equal(preamble.includes(`INSERT INTO private.${table}`), false, table);
    }
    assert.equal(sql060.includes('FX'), false);
    assert.equal(sql060.includes('exchange_rate'), false);
  });

  it('marks only proven games ready and keeps crystal/apples/aviator blocked', () => {
    assert.match(sql060, /WHERE game_code = 'dice'/);
    assert.match(sql060, /multi_currency_ready = TRUE/);
    assert.match(sql060, /WHERE game_code = 'blackjack'/);
    assert.match(sql060, /WHERE game_code = 'pharaoh'/);
    assert.match(sql060, /WHERE game_code IN \('crystal', 'apples', 'aviator'\)/);
    assert.match(sql060, /multi_currency_ready = FALSE/);
  });

  it('enforces new-start scale, limits, and max liability before debit', () => {
    const start = functionSql(sql060, 'private.game_engine_start(');
    assert.ok(start.indexOf('start_idempotency_key = v_key') < start.indexOf('game_require_player_context'));
    assert.ok(start.indexOf('game_current_balance(v_existing.wallet_id)') < start.indexOf('require_owned_games_new_start_ready'));
    assert.ok(start.indexOf('require_currency_amount_scale(v_display, p_stake)') > start.indexOf('IF FOUND THEN'));
    assert.ok(start.indexOf('require_currency_amount_scale') < start.indexOf('INSERT INTO private.game_rounds'));
    assert.ok(start.indexOf('require_owned_game_multi_currency_ready') < start.indexOf('game_apply_bet'));
    assert.ok(start.indexOf('GAME_PAYOUT_ABOVE_CURRENCY_MAX') < start.indexOf('INSERT INTO private.game_rounds'));
    assert.ok(start.indexOf('GAME_PAYOUT_ABOVE_CURRENCY_MAX') < start.indexOf('game_apply_bet'));
    assert.equal(start.includes('CLIP'), false);
    const found = start.slice(start.indexOf('IF FOUND THEN'), start.indexOf('SELECT * INTO v_ctx FROM private.game_require_player_context()'));
    assert.equal(found.includes('game_apply_bet'), false);
    assert.equal(found.includes('require_currency_amount_scale'), false);
    assert.match(start, /'stake', v_stake/);
    assert.match(start, /v_stake := ROUND\(p_stake, 2\)/);
    assert.equal(sql060.includes('CREATE OR REPLACE FUNCTION private.game_engine_action('), false);
    const maxPayout = functionSql(sql060, 'private.game_max_possible_payout(');
    assert.match(maxPayout, /game_dice_win_multiplier_for_version/);
    assert.match(maxPayout, /10000/);
    assert.match(maxPayout, /349/);
    assert.match(maxPayout, /1000000/);
    assert.match(maxPayout, /RETURN NULL/);
  });

  it('lets Owner enable non-TMT only after limits and at least one ready game', () => {
    const owned = functionSql(sql060, 'public.owner_set_currency_owned_games_enabled(');
    assert.match(owned, /CURRENCY_LIMITS_UNCONFIGURED/);
    assert.match(owned, /GAME_MULTI_CURRENCY_NOT_READY/);
    assert.match(owned, /OWNED_GAMES_ENABLED_CHANGED/);
    assert.equal(owned.includes('OWNED_GAMES_CURRENCY_NOT_READY'), false);
    const startReady = functionSql(sql060, 'private.require_owned_games_new_start_ready(p_display TEXT)');
    assert.equal(startReady.includes('OWNED_GAMES_CURRENCY_NOT_READY'), false);
    assert.match(startReady, /CURRENCY_LIMITS_UNCONFIGURED/);
    assert.match(startReady, /OWNED_GAMES_CURRENCY_DISABLED/);
    assert.match(functionSql(sql060, 'private.require_owned_game_multi_currency_ready('), /GAME_MULTI_CURRENCY_NOT_READY/);
    assert.equal(mapPlayerGameRpcError({ message: 'GAME_MULTI_CURRENCY_NOT_READY' }).httpStatus, 409);
    assert.equal(mapPlayerGameRpcError({ message: 'GAME_PAYOUT_ABOVE_CURRENCY_MAX' }).httpStatus, 409);
    assert.equal(mapOwnerRpcError({ message: 'GAME_MULTI_CURRENCY_NOT_READY' }).httpStatus, 409);
  });
});
