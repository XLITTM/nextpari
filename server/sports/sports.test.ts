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
const ONE_X2_KEY = `${FIXTURE}:1:`;

function oneX2Request(overrides: Record<string, unknown> = {}) {
  return {
    fixtureId: String(FIXTURE),
    outcomeId: HOME_BET,
    marketId: '1',
    marketKey: ONE_X2_KEY,
    price: 1.85,
    ...overrides,
  };
}

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
      oneX2Request(),
      openQuote(),
      { bettingEnabled: true },
    );
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.quote.price, 1.85);
  });

  it('rejects when the global switch is off', () => {
    const decision = decideSportsQuote(
      oneX2Request(),
      openQuote(),
      { bettingEnabled: false },
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'SPORTS_BET_DISABLED');
  });

  it('rejects a browser fake price with ODDS_CHANGED and returns live price', () => {
    const decision = decideSportsQuote(
      oneX2Request({ price: 9.99 }),
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
        oneX2Request(),
        openQuote({ selectable: false, status: 'suspended' }),
      ).ok === false
        && (decideSportsQuote(
          oneX2Request(),
          openQuote({ selectable: false, status: 'suspended' }),
        ) as { reason: string }).reason,
      'MARKET_SUSPENDED',
    );
    assert.equal(
      (decideSportsQuote(
        oneX2Request(),
        openQuote({ status: 'missing', outcomeId: HOME_BET }),
      ) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );
    assert.equal(
      (decideSportsQuote(
        oneX2Request({ outcomeId: '' }),
        openQuote(),
      ) as { reason: string }).reason,
      'MISSING_BET_ID',
    );
    assert.equal(
      (decideSportsQuote(
        oneX2Request({ fixtureId: '' }),
        openQuote(),
      ) as { reason: string }).reason,
      'MISSING_FIXTURE',
    );
    assert.equal(
      (decideSportsQuote(
        oneX2Request(),
        openQuote({ health: 'STALE', heartbeatAgeMs: 20_000 }),
      ) as { reason: string }).reason,
      'FEED_STALE',
    );
    assert.equal(
      (decideSportsQuote(
        oneX2Request(),
        openQuote({ price: 1 }),
      ) as { reason: string }).reason,
      'INVALID_PRICE',
    );
  });

  it('looks up canonical store by exact FixtureId + Market.Id + marketKey + Bet.Id', () => {
    const store = new LsportsInPlayStore();
    seedOpen1x2(store);
    const quote = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      marketId: '1',
      marketKey: ONE_X2_KEY,
      outcomeId: HOME_BET,
      feedType: 'inplay',
    });
    assert.equal(quote.selectable, true);
    assert.equal(quote.price, 1.85);
    assert.equal(quote.outcomeId, HOME_BET);
    assert.equal(quote.fixtureId, String(FIXTURE));
    const byBetIdOnly = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      outcomeId: HOME_BET,
      feedType: 'inplay',
    });
    assert.equal(byBetIdOnly.status, 'missing');
    assert.equal(byBetIdOnly.selectable, false);
    const adapter = read('server/lsports/adapter/markets.ts');
    assert.match(adapter, /toDecimalPrice\(bet\.Price/);
    assert.equal(adapter.includes('ProviderMarkets'), false);
  });

  it('revalidates extra-market quotes by FixtureId + Market.Id + line + Bet.Id', () => {
    const store = new LsportsInPlayStore();
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1 } }, Date.now());
    store.ingestFixturesSnapshot({
      Header: { Type: 1, ServerTimestamp: 1 },
      Body: [{
        FixtureId: FIXTURE,
        Fixture: {
          Sport: { Id: 6046, Name: 'Football' },
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
          Markets: [
            {
              Id: 1,
              Name: '1X2',
              Status: 1,
              Bets: [{ Id: HOME_BET, Name: '1', Status: 1, Price: 1.85 }],
            },
            {
              Id: 2,
              Name: 'Under/Over',
              Status: 1,
              BaseLine: '2.5',
              Bets: [
                { Id: '2201', Name: 'Over', Line: '2.5', BaseLine: '2.5', Status: 1, Price: 1.9 },
                { Id: '2202', Name: 'Under', Line: '2.5', BaseLine: '2.5', Status: 1, Price: 1.95 },
              ],
            },
            {
              Id: 2,
              Name: 'Under/Over',
              Status: 1,
              BaseLine: '3.5',
              Bets: [
                { Id: '2301', Name: 'Over', Line: '3.5', BaseLine: '3.5', Status: 1, Price: 2.2 },
                { Id: '2302', Name: 'Under', Line: '3.5', BaseLine: '3.5', Status: 1, Price: 1.7 },
              ],
            },
          ],
        }],
      },
    });
    const over25 = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      marketId: '2',
      marketKey: `${FIXTURE}:2:2.5`,
      line: '2.5',
      outcomeId: '2201',
    });
    assert.equal(over25.selectable, true);
    assert.equal(over25.price, 1.9);
    assert.equal(over25.marketId, '2');
    assert.equal(over25.line, '2.5');
    assert.equal(over25.outcomeName, 'Over');
    const wrongLine = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      marketId: '2',
      marketKey: `${FIXTURE}:2:3.5`,
      line: '3.5',
      outcomeId: '2201',
    });
    assert.equal(wrongLine.selectable, false);
    assert.equal(wrongLine.status, 'missing');
    const changed = decideSportsQuote(
      {
        fixtureId: String(FIXTURE),
        marketId: '2',
        marketKey: `${FIXTURE}:2:2.5`,
        line: '2.5',
        outcomeId: '2201',
        price: 9.99,
      },
      over25,
    );
    assert.equal(changed.ok, false);
    if (!changed.ok) {
      assert.equal(changed.reason, 'ODDS_CHANGED');
      assert.equal(changed.currentPrice, 1.9);
    }
    const lineMismatch = decideSportsQuote(
      {
        fixtureId: String(FIXTURE),
        marketId: '2',
        marketKey: `${FIXTURE}:2:2.5`,
        line: '3.5',
        outcomeId: '2201',
        price: 1.9,
      },
      over25,
    );
    assert.equal(lineMismatch.ok, false);
    if (!lineMismatch.ok) assert.equal(lineMismatch.reason, 'EVENT_UNAVAILABLE');

    store.ingestMarketDelta({
      Header: { Type: 3, ServerTimestamp: 3 },
      Body: {
        Events: [{
          FixtureId: FIXTURE,
          Markets: [{
            Id: 2,
            Name: 'Under/Over',
            Status: 2,
            BaseLine: '2.5',
            Bets: [
              { Id: '2201', Name: 'Over', Line: '2.5', BaseLine: '2.5', Status: 2, Price: 1.9 },
            ],
          }],
        }],
      },
    });
    const suspended = lookupCanonicalQuote(store, {
      fixtureId: String(FIXTURE),
      marketId: '2',
      marketKey: `${FIXTURE}:2:2.5`,
      line: '2.5',
      outcomeId: '2201',
    });
    assert.equal(suspended.selectable, false);
    const afterSelect = decideSportsQuote(
      {
        fixtureId: String(FIXTURE),
        marketId: '2',
        marketKey: `${FIXTURE}:2:2.5`,
        line: '2.5',
        outcomeId: '2201',
        price: 1.9,
      },
      suspended,
    );
    assert.equal(afterSelect.ok, false);
    if (!afterSelect.ok) assert.equal(afterSelect.reason, 'MARKET_SUSPENDED');
  });
});

describe('LSports exact canonical identity', () => {
  const REAL_FIXTURE = 20024076;
  const OVER_25 = '136472347120024080';
  const UNDER_25 = '172546680120024060';
  const OVER_35 = '136472343820024080';
  const AH_HOME = '67812785420024080';
  const AH_AWAY = '138540931820024080';
  const CORNER_UNDER = '183049533419994140';
  const CORNER_OVER = '183049540019994140';

  function seedRealPackedLines(store: LsportsInPlayStore) {
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1 } }, Date.now());
    store.ingestFixturesSnapshot({
      Header: { Type: 1, ServerTimestamp: 1 },
      Body: [{
        FixtureId: REAL_FIXTURE,
        Fixture: {
          Sport: { Id: 6046, Name: 'Football' },
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
          FixtureId: REAL_FIXTURE,
          Markets: [
            {
              Id: 1,
              Name: '1X2',
              Status: 1,
              Bets: [{ Id: HOME_BET, Name: '1', Status: 1, Price: 1.85 }],
            },
            {
              Id: 2,
              Name: 'Under/Over',
              Status: 1,
              MainLine: '2.5',
              BaseLine: null,
              Line: null,
              Bets: [
                {
                  Id: OVER_25,
                  Name: 'Over',
                  Status: 1,
                  Line: '2.5',
                  BaseLine: '2.5',
                  Handicap: null,
                  Total: null,
                  Price: '2.14',
                },
                {
                  Id: UNDER_25,
                  Name: 'Under',
                  Status: 1,
                  Line: '2.5',
                  BaseLine: '2.5',
                  Handicap: null,
                  Total: null,
                  Price: '1.675',
                },
                {
                  Id: OVER_35,
                  Name: 'Over',
                  Status: 1,
                  Line: '3.5',
                  BaseLine: '3.5',
                  Handicap: null,
                  Total: null,
                  Price: '4.08',
                },
              ],
            },
            {
              Id: 1439,
              Name: 'Asian Handicap - Full Time',
              Status: 1,
              MainLine: '-1.0',
              BaseLine: null,
              Line: null,
              Bets: [
                {
                  Id: AH_HOME,
                  Name: '1',
                  Status: 1,
                  Line: '-1.0',
                  BaseLine: '-1.0',
                  Handicap: null,
                  Total: null,
                  Price: '1.97',
                },
                {
                  Id: AH_AWAY,
                  Name: '2',
                  Status: 1,
                  Line: '1.0',
                  BaseLine: '-1.0',
                  Handicap: null,
                  Total: null,
                  Price: '1.795',
                },
              ],
            },
            {
              Id: 11,
              Name: 'Total Corners',
              Status: 1,
              MainLine: '12.0',
              BaseLine: null,
              Line: null,
              Bets: [
                {
                  Id: CORNER_UNDER,
                  Name: 'Under',
                  Status: 1,
                  Line: '12.0',
                  BaseLine: '12.0',
                  Handicap: null,
                  Total: null,
                  Price: '1.85',
                },
                {
                  Id: CORNER_OVER,
                  Name: 'Over',
                  Status: 1,
                  Line: '12.0',
                  BaseLine: '12.0',
                  Handicap: null,
                  Total: null,
                  Price: '1.95',
                },
              ],
            },
          ],
        }],
      },
    });
  }

  it('rejects LSports quotes that omit or mismatch Market.Id / canonical marketKey / line', () => {
    const store = new LsportsInPlayStore();
    seedRealPackedLines(store);
    const exact = {
      fixtureId: String(REAL_FIXTURE),
      marketId: '2',
      marketKey: `${REAL_FIXTURE}:2:2.5`,
      line: '2.5',
      outcomeId: OVER_25,
      price: 2.14,
    };
    const accepted = lookupCanonicalQuote(store, exact);
    assert.equal(accepted.status, 'open');
    assert.equal(accepted.price, 2.14);
    assert.equal(accepted.marketKey, `${REAL_FIXTURE}:2:2.5`);

    const missingMarketId = lookupCanonicalQuote(store, { ...exact, marketId: '' });
    assert.equal(missingMarketId.status, 'missing');
    assert.equal(
      (decideSportsQuote({ ...exact, marketId: '' }, accepted) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const wrongMarketId = lookupCanonicalQuote(store, { ...exact, marketId: '1439' });
    assert.equal(wrongMarketId.status, 'missing');
    assert.equal(
      (decideSportsQuote({ ...exact, marketId: '1439' }, accepted) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const missingKey = lookupCanonicalQuote(store, { ...exact, marketKey: '' });
    assert.equal(missingKey.status, 'missing');
    assert.equal(
      (decideSportsQuote({ ...exact, marketKey: '' }, accepted) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const wrongKey = lookupCanonicalQuote(store, { ...exact, marketKey: `${REAL_FIXTURE}:2:3.5` });
    assert.equal(wrongKey.status, 'missing');
    assert.equal(
      (decideSportsQuote({ ...exact, marketKey: `${REAL_FIXTURE}:1:` }, accepted) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const totalsWrongLine = lookupCanonicalQuote(store, {
      ...exact,
      marketKey: `${REAL_FIXTURE}:2:3.5`,
      line: '3.5',
    });
    assert.equal(totalsWrongLine.status, 'missing');
    assert.equal(
      (decideSportsQuote({
        ...exact,
        marketKey: `${REAL_FIXTURE}:2:3.5`,
        line: '3.5',
      }, accepted) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const ahExact = lookupCanonicalQuote(store, {
      fixtureId: String(REAL_FIXTURE),
      marketId: '1439',
      marketKey: `${REAL_FIXTURE}:1439:-1.0`,
      line: '-1.0',
      outcomeId: AH_HOME,
    });
    assert.equal(ahExact.status, 'open');
    assert.equal(ahExact.price, 1.97);
    const ahWrongLine = lookupCanonicalQuote(store, {
      fixtureId: String(REAL_FIXTURE),
      marketId: '1439',
      marketKey: `${REAL_FIXTURE}:1439:-1.0`,
      line: '1.0',
      outcomeId: AH_HOME,
    });
    assert.equal(ahWrongLine.status, 'missing');
    assert.equal(
      (decideSportsQuote({
        fixtureId: String(REAL_FIXTURE),
        marketId: '1439',
        marketKey: `${REAL_FIXTURE}:1439:-1.0`,
        line: '1.0',
        outcomeId: AH_HOME,
        price: 1.97,
      }, ahExact) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );

    const decision = decideSportsQuote(exact, accepted);
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.quote.outcomeId, OVER_25);
  });

  it('splits a packed live Type 3 market by Bet.BaseLine so opposite handicap lines stay one selection', () => {
    const store = new LsportsInPlayStore();
    seedRealPackedLines(store);
    const fixture = store.getFixture(REAL_FIXTURE);
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:2:2.5`), true);
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:2:3.5`), true);
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:2:`), false);
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:1439:-1.0`), true);
    assert.equal(fixture?.markets.get(`${REAL_FIXTURE}:1439:-1.0`)?.line, '-1.0');
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:1439:1.0`), false);
    assert.equal(fixture?.markets.has(`${REAL_FIXTURE}:11:12.0`), true);
    const away = lookupCanonicalQuote(store, {
      fixtureId: String(REAL_FIXTURE),
      marketId: '1439',
      marketKey: `${REAL_FIXTURE}:1439:-1.0`,
      line: '-1.0',
      outcomeId: AH_AWAY,
    });
    assert.equal(away.status, 'open');
    assert.equal(away.line, '-1.0');
    assert.equal(away.price, 1.795);
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

  it('settles an extra-market Bet.Id and reverses on Type 35 code -1 without paying unknown codes', () => {
    const store = new LsportsInPlayStore();
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1 } }, Date.now());
    store.ingestMarketDelta({
      Header: { Type: 3, ServerTimestamp: 2 },
      Body: {
        Events: [{
          FixtureId: FIXTURE,
          Markets: [{
            Id: 2,
            Name: 'Under/Over',
            Status: 1,
            BaseLine: '2.5',
            Bets: [
              { Id: '2201', Name: 'Over', Line: '2.5', BaseLine: '2.5', Status: 1, Price: 1.9 },
            ],
          }],
        }],
      },
    });
    store.ingestRmq({
      Header: { Type: 35, ServerTimestamp: 4, MsgGuid: 'totals-win' },
      Body: {
        Events: [{
          FixtureId: FIXTURE,
          Markets: [{
            Id: 2,
            Name: 'Under/Over',
            BaseLine: '2.5',
            Bets: [
              { Id: '2201', Name: 'Over', Line: '2.5', Settlement: 2, LastUpdate: '2026-09-03T12:10:00Z' },
            ],
          }],
        }],
      },
    });
    const notices = store.takeSettlementNotices();
    assert.equal(notices[0]?.betId, '2201');
    assert.equal(notices[0]?.marketId, '2');
    assert.equal(notices[0]?.marketKey, `${FIXTURE}:2:2.5`);
    assert.equal(notices[0]?.settlement, 2);
    assert.equal(settlementPayout(10, 1.9, notices[0]!.settlement), 19);

    store.ingestRmq({
      Header: { Type: 35, ServerTimestamp: 5, MsgGuid: 'totals-revert' },
      Body: {
        Events: [{
          FixtureId: FIXTURE,
          Markets: [{
            Id: 2,
            BaseLine: '2.5',
            Bets: [
              { Id: '2201', Settlement: -1, LastUpdate: '2026-09-03T12:11:00Z' },
            ],
          }],
        }],
      },
    });
    const reverted = store.takeSettlementNotices();
    assert.equal(reverted[0]?.settlement, -1);
    const reverse = planSettlementTransition({
      previousCode: 2,
      previousPayout: 19,
      incoming: -1,
      stake: 10,
      acceptedOdds: 1.9,
      sameFingerprint: false,
    });
    assert.equal(reverse.action, 'reverse');
    assert.equal(reverse.debitLastPayout, 19);
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
