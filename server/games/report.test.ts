import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REPORT_TIMEZONE, THEORETICAL_CONTROLLED_GAME_RTP } from './registry.js';
import { calendarDateInZone, rtpMetrics, zonedDayUtcRange } from './reportWindow.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const migration = read('supabase/migrations/20260901_030_game_rtp_daily_report.sql');
const rollback = read('supabase/tests/20260901_030_game_rtp_daily_report.rollback.sql');
const adapters = read('supabase/migrations/20260901_029_canonical_games_engine.sql');

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
  });

  it('does not change game odds, RNG, or payouts to hit a daily profit', () => {
    assert.match(migration, /DO NOT use it to change odds/);
    assert.match(migration, /Outcomes are not adjusted/);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.game_adapter_'), false);
    assert.equal(migration.includes('private.apply_wallet_entry'), false);
    assert.equal(migration.includes('Math.random'), false);
    assert.equal(/UPDATE private\.game_rounds/.test(migration), false);
    assert.match(adapters, /private\.game_adapter_pharaoh_start/);
    assert.equal(rollback.includes('COMMIT;'), false);
    assert.match(rollback, /^ROLLBACK;/m);
  });
});
