import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CONTROLLED_GAME_CODES,
  DEFAULT_REPORT_TIMEZONE,
  THEORETICAL_CONTROLLED_GAME_RTP,
} from './registry.js';
import {
  calendarDateInZone,
  gameRtpReportingMeta,
  isWinningRound,
  rtpMetrics,
  zonedDayUtcRange,
} from './reportWindow.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const migration = read('supabase/migrations/20260901_030_game_rtp_daily_report.sql');
const rollback = read('supabase/tests/20260901_030_game_rtp_daily_report.rollback.sql');
const adapters = read('supabase/migrations/20260901_029_canonical_games_engine.sql');
const ui = read('src/owner/GameRtpReport.tsx');
const services = read('src/owner/services.ts');

const APPLES_LEVELS_JSON =
  '{"levels":[{"level":1,"multiplier":1.23,"good":4,"bad":1},{"level":2,"multiplier":1.54,"good":4,"bad":1},{"level":3,"multiplier":1.93,"good":4,"bad":1},{"level":4,"multiplier":2.41,"good":3,"bad":2},{"level":5,"multiplier":4.02,"good":3,"bad":2},{"level":6,"multiplier":6.71,"good":3,"bad":2},{"level":7,"multiplier":11.18,"good":2,"bad":3},{"level":8,"multiplier":27.92,"good":2,"bad":3},{"level":9,"multiplier":69.80,"good":1,"bad":4},{"level":10,"multiplier":349.00,"good":1,"bad":4}]}';

describe('timezone-aware daily RTP window', () => {
  it('splits the same UTC instant across Ashgabat midnight', () => {
    const before = new Date('2026-09-01T18:59:59.000Z');
    const after = new Date('2026-09-01T19:00:00.000Z');
    assert.equal(calendarDateInZone(before, 'UTC'), '2026-09-01');
    assert.equal(calendarDateInZone(after, 'UTC'), '2026-09-01');
    assert.equal(calendarDateInZone(before, 'Asia/Ashgabat'), '2026-09-01');
    assert.equal(calendarDateInZone(after, 'Asia/Ashgabat'), '2026-09-02');
  });

  it('maps an Ashgabat calendar day back to exclusive UTC bounds', () => {
    const { start, end } = zonedDayUtcRange('2026-09-02', 'Asia/Ashgabat');
    assert.equal(start.toISOString(), '2026-09-01T19:00:00.000Z');
    assert.equal(end.toISOString(), '2026-09-02T19:00:00.000Z');
    assert.equal(calendarDateInZone(start, DEFAULT_REPORT_TIMEZONE), '2026-09-02');
    assert.equal(calendarDateInZone(new Date(end.getTime() - 1), DEFAULT_REPORT_TIMEZONE), '2026-09-02');
    assert.equal(calendarDateInZone(end, DEFAULT_REPORT_TIMEZONE), '2026-09-03');
  });

  it('computes GGR, realized RTP, and hold without inventing a forced daily target', () => {
    const row = rtpMetrics(140, 80, 2, 1);
    assert.equal(row.ggr, 60);
    assert.equal(row.realizedRtp, Number((80 / 140).toFixed(6)));
    assert.equal(row.realizedHold, Number((60 / 140).toFixed(6)));
    const empty = rtpMetrics(0, 0, 0, 0);
    assert.equal(empty.realizedRtp, null);
    assert.equal(empty.realizedHold, null);
    assert.equal(THEORETICAL_CONTROLLED_GAME_RTP, 0.875);
  });
});

describe('winningRounds semantics', () => {
  it('does not treat a dice draw as a win even when payout returns the stake', () => {
    assert.equal(isWinningRound({ outcome: 'draw' }), false);
    assert.match(rollback, /Dice draw: payout > 0 and winningRounds does not increase/);
    assert.match(migration, /private\.game_report_is_win/);
    assert.match(migration, /public_result->>'outcome'/);
    assert.match(migration, /public_result->>'result'/);
    assert.equal(migration.includes('COUNT(*) FILTER (WHERE r.payout > 0)'), false);
  });

  it('does not treat a blackjack push as a win even when payout returns the stake', () => {
    assert.equal(isWinningRound({ result: 'push' }), false);
    assert.match(rollback, /Blackjack push: payout > 0 and winningRounds does not increase/);
  });

  it('counts actual winning outcomes including golden and blackjack', () => {
    assert.equal(isWinningRound({ outcome: 'win' }), true);
    assert.equal(isWinningRound({ result: 'golden' }), true);
    assert.equal(isWinningRound({ result: 'blackjack' }), true);
    assert.equal(isWinningRound({ outcome: 'lose' }), false);
    assert.equal(isWinningRound({ outcome: 'cancelled' }), false);
    assert.equal(isWinningRound({ outcome: 'refund' }), false);
    assert.match(rollback, /real win: winningRounds increases by 1/);
    assert.match(migration, /IN \('win', 'golden', 'blackjack'\)/);
  });
});

describe('Apples theoretical RTP reporting exception', () => {
  it('marks Apples as progressive with a null theoretical target', () => {
    assert.deepEqual(gameRtpReportingMeta('apples'), {
      theoreticalRtpTarget: null,
      rtpModel: 'progressive',
    });
    assert.match(migration, /rtpModel', 'progressive'/);
    assert.match(migration, /theoreticalRtpTarget', NULL/);
    assert.match(migration, /controlledGameTargetRtp/);
    assert.equal(migration.includes("'theoreticalRtp'"), false);
    assert.match(rollback, /Apples is progressive with null target/);
    assert.match(services, /rtpModel: GameRtpModel/);
    assert.match(ui, /Прогрессивный/);
    assert.match(ui, /Не настроен/);
    assert.match(ui, /Целевой RTP Pharaoh \/ Crystal \/ Aviator/);
    assert.match(ui, /Apple of Fortune использует отдельную прогрессивную модель/);
  });

  it('keeps Pharaoh Crystal Aviator on 0.875 and uses exact Dice/Blackjack models', () => {
    assert.deepEqual([...CONTROLLED_GAME_CODES], [
      'pharaoh',
      'dice',
      'blackjack',
      'crystal',
      'aviator',
    ]);
    for (const code of ['pharaoh', 'crystal', 'aviator'] as const) {
      assert.deepEqual(gameRtpReportingMeta(code), {
        theoreticalRtpTarget: 0.875,
        rtpModel: 'fixed-target',
      });
    }
    assert.deepEqual(gameRtpReportingMeta('dice'), {
      theoreticalRtpTarget: 1,
      rtpModel: 'fixed-target',
    });
    assert.equal(gameRtpReportingMeta('blackjack').rtpModel, 'fixed-target');
    assert.ok((gameRtpReportingMeta('blackjack').theoreticalRtpTarget ?? 0) > 1);
    assert.match(rollback, /five controlled games target 0\.875/);
    assert.match(migration, /p_game_code IN \('pharaoh', 'dice', 'blackjack', 'crystal', 'aviator'\)/);
    const sql034 = read('supabase/migrations/20260902_034_dice_blackjack_win2.sql');
    assert.match(sql034, /theoreticalRtpTarget', 1\.000000000000000000/);
    assert.match(sql034, /theoreticalRtpTarget', 1\.0136234940440312/);
    assert.match(sql034, /p_game_code IN \('pharaoh', 'crystal', 'aviator'\)/);
  });

  it('does not assign 0.875 to an unconfigured future game', () => {
    assert.deepEqual(gameRtpReportingMeta('game7_test'), {
      theoreticalRtpTarget: null,
      rtpModel: 'unconfigured',
    });
    assert.match(migration, /rtpModel', 'unconfigured'/);
    assert.match(rollback, /future game7_test is unconfigured with a null theoretical target/);
    assert.match(ui, /Не настроен/);
    assert.match(services, /unconfigured/);
  });
});

describe('030 daily RTP reporting SQL contract', () => {
  it('stores UTC timestamps and reports in a configurable timezone', () => {
    assert.match(migration, /private\.game_report_settings/);
    assert.match(migration, /DEFAULT 'Asia\/Ashgabat'/);
    assert.match(migration, /theoretical_rtp NUMERIC\(8,6\) NOT NULL DEFAULT 0\.875000/);
    assert.match(migration, /private\.game_report_day/);
    assert.match(migration, /AT TIME ZONE v_tz/);
    assert.match(migration, /p_timezone TEXT DEFAULT NULL/);
    assert.match(migration, /TIMEZONE_INVALID/);
    assert.match(rollback, /19:00 UTC is 2 Sep in Ashgabat/);
    assert.match(rollback, /UTC 1 Sep includes both rounds/);
  });

  it('aggregates per game and all games for today, 7d, 30d, and custom', () => {
    assert.match(migration, /p_period TEXT DEFAULT 'today'/);
    assert.match(migration, /v_period = '7d'/);
    assert.match(migration, /v_period = '30d'/);
    assert.match(migration, /v_period = 'custom'/);
    assert.match(migration, /primaryWindow', 'today'/);
    assert.match(migration, /owner_game_rtp_report/);
    assert.match(migration, /totalWagered/);
    assert.match(migration, /winningRounds/);
    assert.match(migration, /realizedRtp/);
    assert.match(migration, /realizedHold/);
    assert.match(rollback, /GGR \/ realized RTP \/ hold formulas/);
    assert.match(rollback, /primary business window is one calendar day/);
    assert.match(rollback, /payout-based RTP\/GGR still include draw\/push returned stake/);
  });

  it('does not change game odds, RNG, or payouts to hit a daily profit', () => {
    assert.match(migration, /DO NOT use reporting metadata to change odds/);
    assert.match(migration, /Outcomes are not adjusted/);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.game_adapter_'), false);
    assert.equal(migration.includes('private.apply_wallet_entry'), false);
    assert.equal(migration.includes('Math.random'), false);
    assert.equal(/UPDATE private\.game_rounds/.test(migration), false);
    assert.match(adapters, /private\.game_adapter_pharaoh_start/);
    assert.equal(rollback.includes('COMMIT;'), false);
    assert.equal(/\bCOMMIT\s*;/i.test(rollback), false);
    assert.match(rollback, /^ROLLBACK;/m);
  });

  it('leaves Apples game math in migration 029 untouched', () => {
    assert.match(adapters, /CREATE OR REPLACE FUNCTION private\.game_adapter_apples_start/);
    assert.match(adapters, /CREATE OR REPLACE FUNCTION private\.game_adapter_apples_action/);
    assert.equal(adapters.includes(APPLES_LEVELS_JSON), true);
    assert.equal(migration.includes('game_adapter_apples'), false);
    assert.equal(migration.includes('"good":4,"bad":1'), false);
    assert.equal(migration.includes('multiplier":1.23'), false);
  });
});
