import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isCanonicalSportsBetEnabled } from './enabled.js';
import {
  accumulatorPayout,
  planCumulativeSettlement,
  planSettlementTransition,
} from './payout.js';
import { SPORTS_SETTLEMENT } from './settlement.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = '20260921230000_sports_settlement_correction_069.sql';
const sql = readFileSync(join(root, 'supabase/migrations', migrationName), 'utf8');
const sql038 = readFileSync(
  join(root, 'supabase/migrations/20260909_038_provider_aware_sports_settlement.sql'),
  'utf8',
);

const WON = SPORTS_SETTLEMENT.Won;
const HALF = SPORTS_SETTLEMENT.HalfWon;
const LOST = SPORTS_SETTLEMENT.Lost;
const REFUND = SPORTS_SETTLEMENT.Refund;
const CANCEL = SPORTS_SETTLEMENT.Cancelled;

interface BetState {
  payout: number;
  code: number | null;
  unsettled: boolean;
  legs: Array<{ odds: number; settlement: number | null }>;
}

function expressTarget(stake: number, legs: BetState['legs']): number {
  const result = accumulatorPayout(stake, legs.map((leg) => ({
    acceptedOdds: leg.odds,
    settlement: leg.settlement,
  })));
  assert.equal(result.pending, false);
  assert.equal(result.unknown, false);
  return result.payout ?? 0;
}

function applyTarget(
  state: BetState,
  target: number,
  code: number,
  available?: number,
): { credit: number; debit: number; failed: boolean } {
  const step = planCumulativeSettlement({
    previousPayout: state.payout,
    targetPayout: target,
    unsettled: state.unsettled,
    incomingCode: code,
    previousCode: state.code,
    availableBalance: available,
  });
  if (step.failedClosed) {
    return { credit: 0, debit: 0, failed: true };
  }
  state.payout = step.nextEconomicPayout;
  state.code = step.nextCode;
  state.unsettled = false;
  return { credit: step.creditPayout, debit: step.debitLastPayout, failed: false };
}

describe('sports settlement cumulative corrections', () => {
  it('A/B. 400 -> 300 -> 225 moves -100 then -75 even when the code stays HalfWon', () => {
    const state: BetState = {
      payout: 0,
      code: null,
      unsettled: true,
      legs: [
        { odds: 2, settlement: null },
        { odds: 2, settlement: null },
      ],
    };
    state.legs[0]!.settlement = WON;
    state.legs[1]!.settlement = WON;
    const first = applyTarget(state, expressTarget(100, state.legs), WON);
    assert.equal(expressTarget(100, state.legs), 400);
    assert.equal(first.credit, 400);
    assert.equal(first.debit, 0);
    assert.equal(state.payout, 400);

    state.legs[0]!.settlement = HALF;
    const secondTarget = expressTarget(100, state.legs);
    assert.equal(secondTarget, 300);
    const second = applyTarget(state, secondTarget, HALF);
    assert.equal(second.debit, 100);
    assert.equal(second.credit, 0);
    assert.equal(state.payout, 300);

    state.legs[1]!.settlement = HALF;
    const thirdTarget = expressTarget(100, state.legs);
    assert.equal(thirdTarget, 225);
    const third = applyTarget(state, thirdTarget, HALF);
    assert.equal(third.debit, 75);
    assert.equal(third.credit, 0);
    assert.notEqual(third.credit, 225);
    assert.equal(state.payout, 225);
    assert.equal(400 - 100 - 75, 225);
  });

  it('C. correction increase 225 -> 300 credits only +75', () => {
    const step = planCumulativeSettlement({
      previousPayout: 225,
      targetPayout: 300,
      unsettled: false,
      incomingCode: WON,
    });
    assert.equal(step.action, 'corrected');
    assert.equal(step.creditPayout, 75);
    assert.equal(step.debitLastPayout, 0);
    assert.equal(step.nextEconomicPayout, 300);
  });

  it('D/E. exact fingerprint replay and same target move nothing', () => {
    const replay = planSettlementTransition({
      previousCode: WON,
      previousPayout: 400,
      incoming: WON,
      stake: 100,
      acceptedOdds: 2,
      sameFingerprint: true,
    });
    assert.equal(replay.action, 'duplicate');
    assert.equal(replay.creditPayout, 0);
    assert.equal(replay.debitLastPayout, 0);

    const sameTarget = planCumulativeSettlement({
      previousPayout: 225,
      targetPayout: 225,
      unsettled: false,
      incomingCode: HALF,
      previousCode: HALF,
    });
    assert.equal(sameTarget.action, 'duplicate');
    assert.equal(sameTarget.creditPayout, 0);
    assert.equal(sameTarget.debitLastPayout, 0);
    assert.equal(sameTarget.nextEconomicPayout, 225);
    assert.equal(sameTarget.nextCode, HALF);

    const unknownCode = planCumulativeSettlement({
      previousPayout: 225,
      targetPayout: 225,
      unsettled: false,
      incomingCode: HALF,
    });
    assert.equal(unknownCode.action, 'corrected');
    assert.equal(unknownCode.creditPayout, 0);
    assert.equal(unknownCode.debitLastPayout, 0);
  });

  it('same target with a new code persists state and moves no money', () => {
    const sameCode = planSettlementTransition({
      previousCode: WON,
      previousPayout: 200,
      incoming: WON,
      stake: 100,
      acceptedOdds: 2,
      sameFingerprint: false,
    });
    assert.equal(sameCode.action, 'duplicate');
    assert.equal(sameCode.creditPayout, 0);
    assert.equal(sameCode.debitLastPayout, 0);
    assert.equal(sameCode.nextCode, WON);

    const bet: {
      code: number;
      payout: number;
      fingerprint: string;
      state: 'unsettled' | 'settled' | 'cancelled';
    } = {
      code: WON,
      payout: 100,
      fingerprint: 'fp-won',
      state: 'settled',
    };
    const leg: { settlement: number; fingerprint: string } = { settlement: WON, fingerprint: 'fp-won' };
    leg.settlement = REFUND;
    leg.fingerprint = 'fp-refund';
    const changed = planSettlementTransition({
      previousCode: bet.code,
      previousPayout: bet.payout,
      incoming: REFUND,
      stake: 100,
      acceptedOdds: 1,
      sameFingerprint: false,
    });
    assert.equal(changed.action, 'corrected');
    assert.notEqual(changed.action, 'duplicate');
    assert.equal(changed.creditPayout, 0);
    assert.equal(changed.debitLastPayout, 0);
    assert.equal(changed.nextEconomicPayout, 100);
    bet.code = changed.nextCode ?? bet.code;
    bet.payout = changed.nextEconomicPayout;
    bet.state = changed.nextState;
    bet.fingerprint = leg.fingerprint;
    assert.equal(bet.code, REFUND);
    assert.equal(bet.code, leg.settlement);
    assert.equal(bet.state, 'settled');
    assert.equal(bet.fingerprint, 'fp-refund');
    assert.equal(bet.payout, 100);

    const cancelToRefund = planSettlementTransition({
      previousCode: CANCEL,
      previousPayout: 100,
      incoming: REFUND,
      stake: 100,
      acceptedOdds: 2,
      sameFingerprint: false,
    });
    assert.equal(cancelToRefund.action, 'corrected');
    assert.equal(cancelToRefund.creditPayout, 0);
    assert.equal(cancelToRefund.debitLastPayout, 0);
    assert.equal(cancelToRefund.nextEconomicPayout, 100);
    assert.equal(cancelToRefund.nextCode, REFUND);
    assert.equal(cancelToRefund.nextState, 'settled');

    const guard = sql.indexOf('last_applied_settlement_code IS NOT DISTINCT FROM v_code');
    const duplicateContinue = sql.indexOf('CONTINUE;', guard);
    const betUpdate = sql.indexOf('last_settlement_fingerprint = v_fp', duplicateContinue);
    assert.ok(guard > 0);
    assert.ok(duplicateContinue > guard);
    assert.ok(betUpdate > duplicateContinue);
    assert.match(sql, /delta = 0 writes no Wallet Ledger entry/);
    assert.equal(
      sql.includes("settlement_state IS DISTINCT FROM 'unsettled' AND v_delta = 0 THEN"),
      false,
    );
  });

  it('F/G/H. cancel refund is stored, then win adds only the difference, and loss removes the refund', () => {
    const refund = planSettlementTransition({
      previousCode: null,
      previousPayout: 0,
      incoming: CANCEL,
      stake: 100,
      acceptedOdds: 2,
      sameFingerprint: false,
    });
    assert.equal(refund.action, 'payout');
    assert.equal(refund.creditPayout, 100);
    assert.equal(refund.nextEconomicPayout, 100);

    const laterWin = planCumulativeSettlement({
      previousPayout: refund.nextEconomicPayout,
      targetPayout: 200,
      unsettled: false,
      incomingCode: WON,
    });
    assert.equal(laterWin.creditPayout, 100);
    assert.equal(laterWin.debitLastPayout, 0);
    assert.equal(laterWin.nextEconomicPayout, 200);
    assert.notEqual(laterWin.creditPayout, 200);

    const laterLoss = planCumulativeSettlement({
      previousPayout: 100,
      targetPayout: 0,
      unsettled: false,
      incomingCode: LOST,
    });
    assert.equal(laterLoss.debitLastPayout, 100);
    assert.equal(laterLoss.creditPayout, 0);
    assert.equal(laterLoss.nextEconomicPayout, 0);
  });

  it('I/J. correction to zero and a single-bet correction move only the delta', () => {
    const toZero = planCumulativeSettlement({
      previousPayout: 225,
      targetPayout: 0,
      unsettled: false,
      incomingCode: LOST,
    });
    assert.equal(toZero.debitLastPayout, 225);
    assert.equal(toZero.creditPayout, 0);
    assert.equal(toZero.nextEconomicPayout, 0);

    const single = planSettlementTransition({
      previousCode: WON,
      previousPayout: 200,
      incoming: HALF,
      stake: 100,
      acceptedOdds: 2,
      sameFingerprint: false,
    });
    assert.equal(single.nextEconomicPayout, 150);
    assert.equal(single.debitLastPayout, 50);
    assert.equal(single.creditPayout, 0);
    assert.equal(single.action, 'corrected');
  });

  it('K. insufficient funds during a negative correction does not adopt the new payout', () => {
    const state: BetState = { payout: 300, code: HALF, unsettled: false, legs: [] };
    const failed = applyTarget(state, 225, HALF, 50);
    assert.equal(failed.failed, true);
    assert.equal(failed.debit, 0);
    assert.equal(failed.credit, 0);
    assert.equal(state.payout, 300);
    assert.equal(state.code, HALF);
  });

  it('L/M/N. 069 uses wallet helpers, stays service_role, and still matches provider', () => {
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.match(sql, /private\.sports_credit\(/);
    assert.match(sql, /private\.sports_debit\(/);
    assert.match(sql, /Does NOT rewrite private\.apply_wallet_entry/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\.sports_apply_one\(JSONB\) FROM anon, authenticated/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.sports_apply_one'), false);
    assert.match(sql, /WHERE l\.provider = v_provider/);
    assert.match(sql, /ON CONFLICT \(provider, fingerprint\) DO NOTHING/);
    assert.equal(sql.includes('last_applied_settlement_code IS DISTINCT FROM v_code'), false);
    assert.match(sql, /v_delta := private\.game_money\(COALESCE\(v_target, 0\) - v_previous\)/);
    assert.match(sql, /last_payout_amount = COALESCE\(v_target, 0\)/);
    assert.equal(sql038.includes('CREATE OR REPLACE FUNCTION private.sports_apply_one'), true);
    assert.match(sql038, /last_applied_settlement_code IS DISTINCT FROM v_code/);
  });

  it('O. different-fingerprint ordering is explicitly not solved', () => {
    assert.match(sql, /REMAINING LIVE-GATE BLOCKER/);
    assert.match(sql, /NOT solved here/);
    assert.equal(sql.includes('settlement_version'), false);
    assert.equal(sql.includes('monotonic'), true);
    const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('_069.sql'));
    assert.deepEqual(files, [migrationName]);
  });

  it('does not enable the canonical sports bet gate', () => {
    assert.equal(sql.includes('CANONICAL_SPORTS_BET_ENABLED'), false);
    assert.equal(isCanonicalSportsBetEnabled({}), false);
    assert.equal(isCanonicalSportsBetEnabled({ CANONICAL_SPORTS_BET_ENABLED: '0' }), false);
  });
});
