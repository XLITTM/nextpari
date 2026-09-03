import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LsportsInPlayStore } from '../lsports/state/store.js';
import { decideSportsQuote } from './quote.js';
import {
  accumulatorPayout,
  planSettlementTransition,
  settlementPayout,
} from './payout.js';
import { lookupCanonicalQuote } from './lsportsQuote.js';
import { evaluateSportsRisk } from './risk.js';
import { isCanonicalSportsBetEnabled } from './enabled.js';
import { settlementSecretsEqual } from './settlementDispatch.js';
import type { SportsQuote } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 19981248;
const HOME_BET = '117469638719981250';

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function openQuote(overrides: Partial<SportsQuote> = {}): SportsQuote {
  return {
    provider: 'lsports',
    feedType: 'inplay',
    fixtureId: String(FIXTURE),
    marketId: '1',
    marketKey: `${FIXTURE}:1:`,
    line: '',
    outcomeId: HOME_BET,
    outcomeName: '1',
    price: 1.85,
    status: 'open',
    marketStatus: '1',
    betStatus: '1',
    betStatusId: '1',
    selectable: true,
    updatedAt: '2026-09-02T00:00:00Z',
    health: 'HEALTHY',
    heartbeatAgeMs: 200,
    ...overrides,
  };
}

function seedOpen1x2(store: LsportsInPlayStore) {
  store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1 } }, Date.now());
  store.ingestFixturesSnapshot({
    Header: { Type: 1, ServerTimestamp: 1 },
    Body: [{
      FixtureId: FIXTURE,
      Fixture: {
        Sport: { Id: 6046, Name: 'Football' },
        Location: { Name: 'England' },
        League: { Name: 'Premier League' },
        Participants: [
          { Name: 'Home FC', Position: '1' },
          { Name: 'Away FC', Position: '2' },
        ],
      },
    }],
  });
  store.ingestMarketDelta({
    Header: { Type: 3, ServerTimestamp: 2 },
    Body: {
      Events: [{
        FixtureId: FIXTURE,
        Markets: [{
          Id: 1,
          Name: '1X2',
          Status: 1,
          Bets: [
            { Id: HOME_BET, Name: '1', Status: 1, Price: 1.85 },
            { Id: '2', Name: 'X', Status: 1, Price: 3.4 },
            { Id: '3', Name: '2', Status: 1, Price: 4.2 },
          ],
        }],
      }],
    },
  });
}

describe('canonical sports betting switch', () => {
  it('is off unless CANONICAL_SPORTS_BET_ENABLED=1 and is not a VITE flag', () => {
    assert.equal(isCanonicalSportsBetEnabled({}), false);
    assert.equal(isCanonicalSportsBetEnabled({ CANONICAL_SPORTS_BET_ENABLED: '0' }), false);
    assert.equal(isCanonicalSportsBetEnabled({ CANONICAL_SPORTS_BET_ENABLED: '1' }), true);
    const gate = read('src/lib/playerMoneyGate.ts');
    assert.equal(gate.includes('VITE_CANONICAL_SPORTS_BET_ENABLED'), false);
  });
});

describe('quote revalidation', () => {
  it('accepts an unchanged open LSports price when betting is enabled', () => {
    const decision = decideSportsQuote(
      { fixtureId: String(FIXTURE), outcomeId: HOME_BET, marketId: '1', price: 1.85 },
      openQuote(),
      { bettingEnabled: true },
    );
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.quote.price, 1.85);
  });

  it('rejects when the global switch is off', () => {
    const decision = decideSportsQuote(
      { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
      openQuote(),
      { bettingEnabled: false },
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'SPORTS_BET_DISABLED');
  });

  it('rejects a browser fake price with ODDS_CHANGED and returns live price', () => {
    const decision = decideSportsQuote(
      { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 9.99 },
      openQuote({ price: 1.85 }),
      { bettingEnabled: true },
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, 'ODDS_CHANGED');
      assert.equal(decision.currentPrice, 1.85);
    }
  });

  it('rejects suspended, missing fixture, missing Bet.Id, stale heartbeat, and invalid price', () => {
    assert.equal(
      decideSportsQuote(
        { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
        openQuote({ selectable: false, status: 'suspended' }),
      ).ok === false
        && (decideSportsQuote(
          { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
          openQuote({ selectable: false, status: 'suspended' }),
        ) as { reason: string }).reason,
      'MARKET_SUSPENDED',
    );
    assert.equal(
      (decideSportsQuote(
        { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
        openQuote({ status: 'missing', outcomeId: HOME_BET }),
      ) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );
    assert.equal(
      (decideSportsQuote(
        { fixtureId: String(FIXTURE), outcomeId: '', price: 1.85 },
        openQuote(),
      ) as { reason: string }).reason,
      'MISSING_BET_ID',
    );
    assert.equal(
      (decideSportsQuote(
        { fixtureId: '', outcomeId: HOME_BET, price: 1.85 },
        openQuote(),
      ) as { reason: string }).reason,
      'MISSING_FIXTURE',
    );
    assert.equal(
      (decideSportsQuote(
        { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
        openQuote({ health: 'STALE', heartbeatAgeMs: 20_000 }),
      ) as { reason: string }).reason,
      'FEED_STALE',
    );
    assert.equal(
      (decideSportsQuote(
        { fixtureId: String(FIXTURE), outcomeId: HOME_BET, price: 1.85 },
        openQuote({ price: 1 }),
      ) as { reason: string }).reason,
      'INVALID_PRICE',
    );
  });

  it('looks up canonical store by FixtureId + Bet.Id and never uses ProviderMarkets', () => {
    const store = new LsportsInPlayStore();
    seedOpen1x2(store);
    const quote = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      marketId: '1',
      outcomeId: HOME_BET,
      feedType: 'inplay',
    });
    assert.equal(quote.selectable, true);
    assert.equal(quote.price, 1.85);
    assert.equal(quote.outcomeId, HOME_BET);
    assert.equal(quote.fixtureId, String(FIXTURE));
    const adapter = read('server/lsports/adapter/markets.ts');
    assert.match(adapter, /toDecimalPrice\(bet\.Price/);
    assert.equal(adapter.includes('ProviderMarkets'), false);
  });
});

describe('Type35 settlement math', () => {
  it('pays Winner/Loser/Refund/HalfLost/HalfWon from accepted odds and ignores NotSettled/unknown', () => {
    assert.equal(settlementPayout(10, 1.85, 2), 18.5);
    assert.equal(settlementPayout(10, 1.85, 1), 0);
    assert.equal(settlementPayout(10, 1.85, 3), 10);
    assert.equal(settlementPayout(10, 1.85, 4), 5);
    assert.equal(settlementPayout(10, 1.85, 5), 14.25);
    assert.equal(settlementPayout(10, 1.85, 0), null);
    assert.equal(settlementPayout(10, 1.85, 99), null);
  });

  it('does not move money on duplicate fingerprints and reverses then corrects after -1', () => {
    const dup = planSettlementTransition({
      previousCode: 2,
      previousPayout: 18.5,
      incoming: 2,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: true,
    });
    assert.equal(dup.action, 'duplicate');
    assert.equal(dup.creditPayout, 0);

    const reverse = planSettlementTransition({
      previousCode: 2,
      previousPayout: 18.5,
      incoming: -1,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: false,
    });
    assert.equal(reverse.action, 'reverse');
    assert.equal(reverse.debitLastPayout, 18.5);
    assert.equal(reverse.nextState, 'cancelled');

    const corrected = planSettlementTransition({
      previousCode: -1,
      previousPayout: 0,
      incoming: 3,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: false,
    });
    assert.equal(corrected.action, 'payout');
    assert.equal(corrected.creditPayout, 10);

    const unknown = planSettlementTransition({
      previousCode: null,
      previousPayout: 0,
      incoming: 9,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: false,
    });
    assert.equal(unknown.action, 'unknown');
    assert.equal(unknown.creditPayout, 0);
  });

  it('keeps express pending until every leg has a terminal code', () => {
    const pending = accumulatorPayout(10, [
      { acceptedOdds: 1.5, settlement: 2 },
      { acceptedOdds: 2, settlement: 0 },
    ]);
    assert.equal(pending.pending, true);
    const done = accumulatorPayout(10, [
      { acceptedOdds: 1.5, settlement: 2 },
      { acceptedOdds: 2, settlement: 2 },
    ]);
    assert.equal(done.pending, false);
    assert.equal(done.payout, 30);
  });
});

describe('risk hook and settlement auth', () => {
  it('exposes a no-op risk hook before acceptance', () => {
    assert.equal(evaluateSportsRisk({ stake: 10, mode: 'single', quotes: [openQuote()] }).ok, true);
    assert.match(read('server/sports/risk.ts'), /evaluateSportsRisk/);
  });

  it('rejects settlement webhooks when the secret length differs', () => {
    assert.equal(settlementSecretsEqual('abc', 'abcd'), false);
    assert.equal(settlementSecretsEqual('secret', 'secret'), true);
  });
});

describe('035 SQL reuses Wallet Core', () => {
  it('does not rewrite apply_wallet_entry or public.wallets', () => {
    const sql = read('supabase/migrations/20260902_035_sports_betting_engine.sql');
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.match(sql, /private\.apply_wallet_entry\(/);
    assert.match(sql, /CASINO_BET/);
    assert.match(sql, /CASINO_WIN/);
    assert.match(sql, /CASINO_REFUND/);
    assert.match(sql, /player_user_id, idempotency_key/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sports_apply_settlement\(JSONB\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.sports_apply_settlement\(JSONB\) FROM anon, authenticated/);
    assert.match(sql, /result = 'unmatched'/);
    assert.match(sql, /last_applied_settlement_code IS NOT DISTINCT FROM v_code/);
    assert.equal(evaluateSportsRisk({ stake: 1, mode: 'single', quotes: [] }).ok, true);
  });
});

describe('036 server-only sports place', () => {
  it('closes the authenticated money RPC and does not reapply 035', () => {
    const sql = read('supabase/migrations/20260903_036_server_only_sports_place.sql');
    assert.match(sql, /Do not reapply 035/);
    assert.match(sql, /RAISE EXCEPTION 'SPORTS_PLACE_SERVER_ONLY'/);
    assert.match(sql, /public\.sports_place_for_player/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sports_place_for_player\(UUID, TEXT, NUMERIC, TEXT, JSONB\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_sports_place\(TEXT, NUMERIC, TEXT, JSONB\) FROM anon, authenticated, service_role/);
    assert.equal(sql.includes('auth.uid()'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
  });
});
