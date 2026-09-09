import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = 'supabase/migrations/20260909_038_provider_aware_sports_settlement.sql';
const SQL_035 = 'supabase/migrations/20260902_035_sports_betting_engine.sql';
const SQL_037 = 'supabase/migrations/20260903_037_fix_sports_leg_alias.sql';

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('provider-aware sports settlement SQL', () => {
  const sql = read(MIGRATION);
  const sql035 = read(SQL_035);
  const sql037 = read(SQL_037);

  it('does not reapply 035/036/037 or rewrite wallet/place money paths', () => {
    assert.match(sql, /Do not reapply 035\/036\/037/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place_as'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.sports_place_for_player'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_outcome_payout'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_credit'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_debit'), false);
    assert.match(sql, /private\.sports_outcome_payout\(/);
    assert.match(sql, /private\.sports_credit\(/);
    assert.match(sql, /private\.sports_debit\(/);
    assert.match(sql, /CASINO_WIN/);
    assert.match(sql, /CASINO_REFUND/);
  });

  it('replaces the 035 leg unique constraint with provider-aware identity', () => {
    assert.match(sql035, /CONSTRAINT sports_bet_legs_identity UNIQUE \(bet_id, fixture_id, market_key, outcome_id\)/);
    assert.match(sql, /DROP CONSTRAINT sports_bet_legs_identity/);
    assert.match(
      sql,
      /ADD CONSTRAINT sports_bet_legs_identity\s+UNIQUE \(bet_id, provider, fixture_id, market_key, outcome_id\)/,
    );
  });

  it('scopes settlement fingerprints to provider instead of global uniqueness', () => {
    assert.match(sql035, /fingerprint TEXT NOT NULL UNIQUE/);
    assert.match(sql, /DROP CONSTRAINT sports_settlement_events_fingerprint_key/);
    assert.match(
      sql,
      /ADD CONSTRAINT sports_settlement_events_provider_fingerprint\s+UNIQUE \(provider, fingerprint\)/,
    );
    assert.match(sql, /ON CONFLICT \(provider, fingerprint\) DO NOTHING/);
    assert.equal(sql.includes('ON CONFLICT (fingerprint)'), false);
  });

  it('adds a NOT NULL event provider without a silent lsports default', () => {
    const eventsStart = sql035.indexOf('CREATE TABLE IF NOT EXISTS private.sports_settlement_events');
    const eventsEnd = sql035.indexOf('CREATE INDEX IF NOT EXISTS sports_bet_legs_match_idx');
    const eventsTable = sql035.slice(eventsStart, eventsEnd);
    assert.equal(eventsTable.includes('fingerprint TEXT NOT NULL UNIQUE'), true);
    assert.equal(/\n\s+provider TEXT/.test(eventsTable), false);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS provider TEXT/);
    assert.match(sql, /ALTER COLUMN provider SET NOT NULL/);
    assert.equal(sql.includes("provider TEXT NOT NULL DEFAULT 'lsports'"), false);
    assert.equal(/ALTER TABLE private\.sports_settlement_events[\s\S]*DEFAULT 'lsports'/.test(sql), false);
    assert.match(sql, /SPORTS_SETTLEMENT_PROVIDER_BACKFILL_INCOMPLETE/);
  });

  it('makes sports_apply_one require provider and match the same-provider leg only', () => {
    assert.match(sql035, /WHERE l\.fixture_id = v_fixture\s+AND l\.outcome_id = v_outcome/);
    assert.equal(sql035.includes('l.provider = v_provider'), false);
    assert.match(sql, /v_provider := NULLIF\(BTRIM\(COALESCE\(p_item->>'provider', ''\)\), ''\)/);
    assert.match(sql, /IF v_provider IS NULL THEN/);
    assert.match(sql, /'result', 'unknown'/);
    assert.equal(sql.includes("COALESCE(v_provider, 'lsports')"), false);
    assert.equal(sql.includes("p_item->>'source'"), false);
    assert.match(sql, /WHERE l\.provider = v_provider\s+AND l\.fixture_id = v_fixture\s+AND l\.outcome_id = v_outcome/);
    assert.match(
      sql,
      /v_market_key = ''\s+OR l\.market_key = v_market_key\s+OR \(v_market_id <> '' AND l\.market_id = v_market_id\)/,
    );
    assert.match(sql, /WHERE fingerprint = v_fp\s+AND provider = v_provider/);
  });

  it('keeps sports_apply_settlement service_role only and forwards whole items including provider', () => {
    assert.match(sql035, /v_one := private\.sports_apply_one\(v_item\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sports_apply_settlement\(JSONB\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.sports_apply_settlement\(JSONB\) FROM anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\.sports_apply_one\(JSONB\) FROM anon, authenticated/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.sports_apply_one'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.sports_apply_settlement(JSONB) TO authenticated'), false);
  });

  it('documents cross-provider collision and same-fingerprint idempotency in the new SQL', () => {
    assert.match(sql, /l\.provider = v_provider/);
    assert.match(sql, /UNIQUE \(provider, fingerprint\)/);
    assert.match(sql, /UNIQUE \(bet_id, provider, fixture_id, market_key, outcome_id\)/);
    assert.match(sql, /result', 'duplicate'/);
    assert.match(sql, /result', 'unmatched'/);
  });

  it('does not change place RPC lsports fallback used by existing LSports clients', () => {
    assert.match(sql037, /COALESCE\(v_provider, NULLIF\(BTRIM\(COALESCE\(v_leg_json->>'provider', ''\)\), ''\), 'lsports'\)/);
    assert.match(sql037, /COALESCE\(NULLIF\(BTRIM\(COALESCE\(t\.leg_json->>'provider', ''\)\), ''\), 'lsports'\)/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place_as'), false);
  });

  it('backfills event provider from payload then matching legs, never sports_bets.provider alone', () => {
    const payloadIdx = sql.indexOf("payload->>'provider'");
    const matchedLegIdx = sql.indexOf('l.bet_id = e2.matched_bet_id');
    const lsportsFallbackIdx = sql.indexOf("SET provider = 'lsports'");
    assert.equal(payloadIdx > 0, true);
    assert.equal(matchedLegIdx > payloadIdx, true);
    assert.equal(lsportsFallbackIdx > matchedLegIdx, true);
    assert.equal(sql.includes('SET provider = NULLIF(BTRIM(b.provider), \'\')'), false);
    assert.match(sql, /l\.bet_id = e2.matched_bet_id/);
    assert.match(sql, /e2\.matched_bet_id IS NOT NULL/);
    assert.match(sql, /HAVING COUNT\(DISTINCT l\.provider\) = 1/);
    assert.match(sql, /SPORTS_SETTLEMENT_PROVIDER_BACKFILL_INCOMPLETE/);

    const betId = 'bet-mixed';
    const legs = [
      { betId, provider: 'provider-a', fixtureId: 100, outcomeId: '10', marketKey: 'm-a', marketId: '1' },
      { betId, provider: 'provider-b', fixtureId: 100, outcomeId: '10', marketKey: 'm-b', marketId: '2' },
    ];
    const exactB = resolveBackfillProvider({
      payloadProvider: '',
      matchedBetId: betId,
      fixtureId: 100,
      outcomeId: '10',
      marketKey: 'm-b',
      marketId: '2',
      legs,
      bets: [{ id: betId, provider: 'provider-a' }],
    });
    assert.equal(exactB, 'provider-b');

    const ambiguous = resolveBackfillProvider({
      payloadProvider: '',
      matchedBetId: betId,
      fixtureId: 100,
      outcomeId: '10',
      marketKey: '',
      marketId: '',
      legs,
      bets: [{ id: betId, provider: 'provider-a' }],
    });
    assert.equal(ambiguous, null);

    const fromPayload = resolveBackfillProvider({
      payloadProvider: 'provider-b',
      matchedBetId: betId,
      fixtureId: 100,
      outcomeId: '10',
      marketKey: '',
      marketId: '',
      legs,
      bets: [{ id: betId, provider: 'provider-a' }],
    });
    assert.equal(fromPayload, 'provider-b');
  });

  it('scopes new wallet settlement keys by provider without rewriting historical ledger identity', () => {
    assert.match(sql035, /'sports-settle:' \|\| v_bet\.id::TEXT \|\| ':' \|\| v_fp/);
    assert.match(sql, /'sports-settle:' \|\| v_bet\.id::TEXT \|\| ':' \|\| v_provider \|\| ':' \|\| v_fp/);
    assert.match(sql, /'sports-reverse:' \|\| v_bet\.id::TEXT \|\| ':' \|\| v_provider \|\| ':' \|\| v_fp/);
    assert.match(sql, /'sports-void:' \|\| v_bet\.id::TEXT \|\| ':' \|\| v_provider \|\| ':' \|\| v_fp/);
    assert.equal(sql.includes("'sports-settle:' || v_bet.id::TEXT || ':' || v_fp,"), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);

    const betId = 'same-bet-id';
    const fingerprint = 'abc';
    const aSettle = walletOpKey('sports-settle', betId, 'provider-a', fingerprint);
    const bSettle = walletOpKey('sports-settle', betId, 'provider-b', fingerprint);
    const aReverse = walletOpKey('sports-reverse', betId, 'provider-a', fingerprint);
    const bReverse = walletOpKey('sports-reverse', betId, 'provider-b', fingerprint);
    const aVoid = walletOpKey('sports-void', betId, 'provider-a', fingerprint);
    const bVoid = walletOpKey('sports-void', betId, 'provider-b', fingerprint);
    assert.equal(aSettle, 'sports-settle:same-bet-id:provider-a:abc');
    assert.equal(bSettle, 'sports-settle:same-bet-id:provider-b:abc');
    assert.notEqual(aSettle, bSettle);
    assert.notEqual(aReverse, bReverse);
    assert.notEqual(aVoid, bVoid);
    assert.equal(aSettle.includes(fingerprint), true);
    assert.equal(aSettle.startsWith('sports-settle:same-bet-id:provider-a:'), true);
  });
});

interface BackfillLeg {
  betId: string;
  provider: string;
  fixtureId: number;
  outcomeId: string;
  marketKey: string;
  marketId: string;
}

function marketMatches(
  event: { marketKey: string; marketId: string },
  leg: BackfillLeg,
): boolean {
  return event.marketKey === ''
    || leg.marketKey === event.marketKey
    || (event.marketId !== '' && leg.marketId === event.marketId);
}

function uniqueProviders(legs: BackfillLeg[]): string[] {
  return [...new Set(legs.map((row) => row.provider).filter(Boolean))];
}

function resolveBackfillProvider(input: {
  payloadProvider: string;
  matchedBetId: string | null;
  fixtureId: number;
  outcomeId: string;
  marketKey: string;
  marketId: string;
  legs: BackfillLeg[];
  bets: Array<{ id: string; provider: string }>;
}): string | null {
  const payload = input.payloadProvider.trim();
  if (payload) return payload;
  const identity = (leg: BackfillLeg) => (
    leg.fixtureId === input.fixtureId
    && leg.outcomeId === input.outcomeId
    && marketMatches(input, leg)
  );
  if (input.matchedBetId) {
    const matched = uniqueProviders(input.legs.filter((leg) => leg.betId === input.matchedBetId && identity(leg)));
    if (matched.length === 1) return matched[0];
  }
  const global = uniqueProviders(input.legs.filter(identity));
  if (global.length === 1) return global[0];
  if (
    input.bets.every((row) => row.provider === 'lsports')
    && input.legs.every((row) => row.provider === 'lsports')
  ) {
    return 'lsports';
  }
  return null;
}

function walletOpKey(
  kind: 'sports-settle' | 'sports-reverse' | 'sports-void',
  betId: string,
  provider: string,
  fingerprint: string,
): string {
  return `${kind}:${betId}:${provider}:${fingerprint}`;
}
