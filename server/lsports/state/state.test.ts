import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LsportsRecoveryCoordinator } from './coordinator.js';
import { canonicalMarketKey, expandMarketLineGroups, marketLineKey } from './keys.js';
import { buildPlannedSnapshotBody, planSnapshotRequests } from './plan.js';
import { LsportsSnapshotRateLimiter, type LsportsSnapshotPlanItem } from './rateLimit.js';
import { LsportsRecoveryBuffer } from './recovery.js';
import { readHeader } from './parse.js';
import { LsportsInPlayStore, betById } from './store.js';
import { LSPORTS_HEARTBEAT_STALE_MS } from './types.js';

const FIXTURE_ID = 19981248;

function snapshotFixtures() {
  return {
    Header: { Type: 36, ServerTimestamp: 1000 },
    Body: [{
      FixtureId: FIXTURE_ID,
      Fixture: {
        Sport: { Id: 6046, Name: 'Football' },
        Location: { Id: 248, Name: 'International' },
        League: { Id: 1, Name: 'Test League' },
        StartDate: '2026-09-01T22:00:00',
        Subscription: { Type: 1, Status: 3 },
        Status: 2,
        LastUpdate: '2026-09-01T22:00:00Z',
        Participants: [
          { Id: 1, Name: 'Home', Position: '1' },
          { Id: 2, Name: 'Away', Position: '2' },
        ],
      },
      Livescore: null,
      Markets: null,
    }],
  };
}

function type2NullMeta(scoreHome: string, scoreAway: string, serverTimestamp = 2000) {
  return {
    Header: { Type: 2, ServerTimestamp: serverTimestamp },
    Body: {
      Events: [{
        FixtureId: FIXTURE_ID,
        Fixture: {
          Subscription: null,
          Sport: { Id: 6046, Name: 'Football' },
          Location: null,
          League: null,
          LastUpdate: '2026-09-01T22:51:04Z',
          Participants: [
            { Id: 1, Name: 'Home', Position: '1' },
            { Id: 2, Name: 'Away', Position: '2' },
          ],
        },
        Livescore: {
          Scoreboard: {
            Status: 2,
            CurrentPeriod: 20,
            Time: '3120',
            Results: [
              { Position: '1', Value: scoreHome },
              { Position: '2', Value: scoreAway },
            ],
            Clock: { Seconds: 3120 },
          },
        },
        Markets: null,
      }],
    },
  };
}

function type3Market(input: {
  priceHome: string;
  lastUpdate: string;
  extraMarket?: boolean;
}) {
  const markets: unknown[] = [{
    Id: 1,
    Name: '1X2',
    Status: 1,
    Bets: [
      { Id: 117469638719981250, Name: '1', Price: input.priceHome, Status: 1, BetStatusId: 1, LastUpdate: input.lastUpdate },
      { Id: 212242794219981250, Name: 'X', Price: '1.02', Status: 1, BetStatusId: 1, LastUpdate: input.lastUpdate },
      { Id: 155418696819981250, Name: '2', Price: '21.5', Status: 1, BetStatusId: 1, LastUpdate: input.lastUpdate },
    ],
  }];
  if (input.extraMarket) {
    markets.push({
      Id: 59,
      Name: 'Next Goal',
      Status: 1,
      Bets: [
        { Id: 46928646919981250, Name: '1', Line: '3.0', BaseLine: '3.0', Price: '18.25', Status: 1, LastUpdate: input.lastUpdate },
      ],
    });
  }
  return {
    Header: { Type: 3, ServerTimestamp: 3000 },
    Body: { Events: [{ FixtureId: FIXTURE_ID, Livescore: null, Markets: markets }] },
  };
}

function type35Settlement() {
  return {
    Header: { Type: 35, ServerTimestamp: 4000 },
    Body: {
      Events: [{
        FixtureId: FIXTURE_ID,
        Livescore: null,
        Markets: [{
          Id: 1,
          Name: '1X2',
          Status: 3,
          Bets: [
            { Id: 117469638719981250, Name: '1', Status: 3, BetStatusId: 3, Settlement: 1, LastUpdate: '2026-09-01T22:53:45Z' },
            { Id: 212242794219981250, Name: 'X', Status: 3, BetStatusId: 3, Settlement: 2, LastUpdate: '2026-09-01T22:53:45Z' },
            { Id: 155418696819981250, Name: '2', Status: 3, BetStatusId: 3, Settlement: 3, LastUpdate: '2026-09-01T22:53:45Z' },
          ],
        }],
      }],
    },
  };
}

describe('lsports inplay state engine', () => {
  it('parses numeric string Header.Type values for Type 3 markets', () => {
    const store = new LsportsInPlayStore();
    assert.equal(readHeader({ Header: { Type: '3', ServerTimestamp: '3000' } }).type, 3);
    store.ingestRmq({
      Header: { Type: '3', ServerTimestamp: '3000' },
      Body: {
        Events: [{
          FixtureId: FIXTURE_ID,
          Markets: [{
            Id: 1,
            Name: '1X2',
            Status: 1,
            Bets: [
              { Id: 117469638719981250, Name: '1', Price: '1.85', Status: 1, BetStatusId: 1, LastUpdate: '2026-09-01T22:51:11Z' },
              { Id: 212242794219981250, Name: 'X', Price: '3.40', Status: 1, BetStatusId: 1, LastUpdate: '2026-09-01T22:51:11Z' },
              { Id: 155418696819981250, Name: '2', Price: '4.20', Status: 1, BetStatusId: 1, LastUpdate: '2026-09-01T22:51:11Z' },
            ],
          }],
        }],
      },
    });
    assert.equal(store.getIngestCounters().type3Messages, 1);
    assert.equal(store.getIngestCounters().market1AppliedFromType3, 1);
    assert.equal(store.getMarket(FIXTURE_ID, { Id: 1 })?.payload.Status, 1);
  });

  it('does not erase snapshot fixture metadata when Type 2 sends null Location/League/Subscription', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2NullMeta('1', '1'));
    const fixture = store.getFixture(FIXTURE_ID)?.fixture;
    assert.deepEqual(fixture?.Location, { Id: 248, Name: 'International' });
    assert.deepEqual(fixture?.League, { Id: 1, Name: 'Test League' });
    assert.deepEqual(fixture?.Subscription, { Type: 1, Status: 3 });
    assert.equal((fixture?.Sport as { Name?: string })?.Name, 'Football');
    const scoreboard = store.getFixture(FIXTURE_ID)?.livescore?.Scoreboard as { Results?: Array<{ Value: string }> };
    assert.equal(scoreboard?.Results?.[0]?.Value, '1');
    assert.equal(store.getFixture(FIXTURE_ID)?.livescoreSource.serverTimestamp, 2000);
    assert.equal(store.getFixture(FIXTURE_ID)?.livescoreSource.lastUpdate, null);
  });

  it('replaces one Type 3 market, keeps stable Bet.Id, and leaves unrelated markets', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '19.2', lastUpdate: '2026-09-01T22:51:06Z', extraMarket: true }));
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    const oneX2 = store.getMarket(FIXTURE_ID, { Id: 1 });
    const nextGoal = store.getMarket(FIXTURE_ID, { Id: 59, Bets: [{ Line: '3.0', BaseLine: '3.0' }] });
    assert.equal(canonicalMarketKey(FIXTURE_ID, { Id: 1 }), '19981248:1:');
    assert.equal(store.getFixture(FIXTURE_ID)?.markets.size, 2);
    assert.equal(betById(oneX2, 117469638719981250)?.Price, '20');
    assert.equal(betById(oneX2, 117469638719981250)?.Name, '1');
    assert.equal(nextGoal?.payload.Name, 'Next Goal');
    assert.equal(betById(nextGoal, 46928646919981250)?.Price, '18.25');
  });

  it('expands packed live totals/handicap by Bet.BaseLine and does not collapse to an empty line', () => {
    const totals = {
      Id: 2,
      Name: 'Under/Over',
      Status: 1,
      MainLine: '2.5',
      BaseLine: null,
      Line: null,
      Bets: [
        { Id: 'a', Name: 'Over', Line: '2.5', BaseLine: '2.5' },
        { Id: 'b', Name: 'Under', Line: '2.5', BaseLine: '2.5' },
        { Id: 'c', Name: 'Over', Line: '3.5', BaseLine: '3.5' },
      ],
    };
    const handicap = {
      Id: 1439,
      Name: 'Asian Handicap - Full Time',
      Status: 1,
      MainLine: '-1.0',
      BaseLine: null,
      Line: null,
      Bets: [
        { Id: 'h', Name: '1', Line: '-1.0', BaseLine: '-1.0' },
        { Id: 'a', Name: '2', Line: '1.0', BaseLine: '-1.0' },
      ],
    };
    assert.equal(marketLineKey(totals), '2.5');
    assert.equal(marketLineKey(handicap), '-1.0');
    assert.deepEqual(
      expandMarketLineGroups(totals).map((group) => group.line).sort(),
      ['2.5', '3.5'],
    );
    const ahGroups = expandMarketLineGroups(handicap);
    assert.deepEqual(ahGroups.map((group) => group.line), ['-1.0']);
    assert.equal(Array.isArray(ahGroups[0]?.payload.Bets) ? ahGroups[0].payload.Bets.length : 0, 2);
    assert.equal(canonicalMarketKey(FIXTURE_ID, totals, '3.5'), '19981248:2:3.5');
    assert.equal(canonicalMarketKey(FIXTURE_ID, handicap, '-1.0'), '19981248:1439:-1.0');
    assert.notEqual(canonicalMarketKey(FIXTURE_ID, totals, '2.5'), `${FIXTURE_ID}:2:`);
  });

  it('prunes exploded Market.Id siblings omitted from a later Type 3 replacement', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq({
      Header: { Type: 3, ServerTimestamp: 3000 },
      Body: {
        Events: [{
          FixtureId: FIXTURE_ID,
          Markets: [{
            Id: 2,
            Name: 'Under/Over',
            Status: 1,
            MainLine: '2.5',
            Bets: [
              { Id: '25', Name: 'Over', Line: '2.5', BaseLine: '2.5', Status: 1, Price: '1.90', LastUpdate: '2026-09-03T12:00:00Z' },
              { Id: '35', Name: 'Over', Line: '3.5', BaseLine: '3.5', Status: 1, Price: '2.20', LastUpdate: '2026-09-03T12:00:00Z' },
              { Id: '45', Name: 'Over', Line: '4.5', BaseLine: '4.5', Status: 1, Price: '3.10', LastUpdate: '2026-09-03T12:00:00Z' },
            ],
          }, {
            Id: 17,
            Name: 'Both Teams To Score',
            Status: 1,
            Bets: [{ Id: 'yes', Name: 'Yes', Status: 1, Price: '1.80', LastUpdate: '2026-09-03T12:00:00Z' }],
          }],
        }],
      },
    });
    store.ingestRmq({
      Header: { Type: 3, ServerTimestamp: 3100 },
      Body: {
        Events: [{
          FixtureId: FIXTURE_ID,
          Markets: [{
            Id: 2,
            Name: 'Under/Over',
            Status: 1,
            MainLine: '2.5',
            Bets: [
              { Id: '25', Name: 'Over', Line: '2.5', BaseLine: '2.5', Status: 1, Price: '1.72', LastUpdate: '2026-09-03T12:05:00Z' },
              { Id: '35', Name: 'Over', Line: '3.5', BaseLine: '3.5', Status: 1, Price: '2.20', LastUpdate: '2026-09-03T12:05:00Z' },
            ],
          }],
        }],
      },
    });
    const fixture = store.getFixture(FIXTURE_ID);
    assert.equal(fixture?.markets.has('19981248:2:2.5'), true);
    assert.equal(fixture?.markets.has('19981248:2:3.5'), true);
    assert.equal(fixture?.markets.has('19981248:2:4.5'), false);
    assert.equal(fixture?.markets.has('19981248:17:'), true);
    assert.equal(betById(fixture?.markets.get('19981248:2:2.5'), '25')?.Price, '1.72');
  });

  it('applies Type 35 Settlement codes without payout logic', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    store.ingestRmq(type35Settlement());
    const source = JSON.stringify(store);
    assert.equal(source.includes('payout'), false);
    assert.equal(source.includes('wallet'), false);
    const market = store.getMarket(FIXTURE_ID, { Id: 1 });
    assert.equal(betById(market, 117469638719981250)?.Settlement, 1);
    assert.equal(betById(market, 212242794219981250)?.Settlement, 2);
    assert.equal(betById(market, 155418696819981250)?.Settlement, 3);
    assert.equal(betById(market, 117469638719981250)?.Status, 3);
    assert.equal(betById(market, 117469638719981250)?.Price, '20');
  });

  it('reports Type 31 KeepAlive discrepancies without deleting fixtures', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type2NullMeta('1', '0'));
    store.ingestKeepAlive({
      Header: { Type: 31, ServerTimestamp: 5000 },
      Body: { KeepAlive: { ActiveEvents: [20000088, 19633027], ExtraData: null } },
    });
    const report = store.keepAliveDiscrepancies();
    assert.deepEqual(report.activeInLsportsAbsentLocal, [20000088, 19633027]);
    assert.deepEqual(report.localActiveAbsentFromKeepAlive, [FIXTURE_ID]);
    assert.ok(store.getFixture(FIXTURE_ID));
    assert.equal(store.getFixture(FIXTURE_ID)?.active, true);
  });

  it('marks heartbeat STALE after more than 12 seconds', () => {
    let now = 1_000;
    const store = new LsportsInPlayStore(() => now);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1788303141964 } }, 1_000);
    assert.equal(store.feedHealth(1_000 + LSPORTS_HEARTBEAT_STALE_MS), 'HEALTHY');
    now = 1_000 + LSPORTS_HEARTBEAT_STALE_MS + 1;
    assert.equal(store.feedHealth(), 'STALE');
    assert.equal(store.metrics().lastHeartbeatTimestamp, 1788303141964);
  });

  it('does not clear an already-active RMQ buffer on a second beginBuffering', () => {
    const store = new LsportsInPlayStore();
    const buffer = new LsportsRecoveryBuffer(store);
    buffer.beginBuffering();
    buffer.append(type2NullMeta('1', '0', 1000), 1_000);
    buffer.beginBuffering();
    buffer.append(type2NullMeta('1', '1', 1100), 1_100);
    assert.equal(store.metrics().bufferDepth, 2);
  });

  it('does not lose a newer buffered Type 3 market during snapshot replay', () => {
    const store = new LsportsInPlayStore();
    const buffer = new LsportsRecoveryBuffer(store, () => 10_000);
    buffer.beginBuffering();
    buffer.append(
      type3Market({ priceHome: '21.5', lastUpdate: '2026-09-01T22:51:11Z' }),
      9_500,
    );
    buffer.applySnapshot({
      snapshotRequestedAt: 9_000,
      markets: {
        Header: { Type: 36, ServerTimestamp: 9000 },
        Body: [{
          FixtureId: FIXTURE_ID,
          Livescore: null,
          Markets: [{
            Id: 1,
            Name: '1X2',
            Status: 1,
            Bets: [
              { Id: 117469638719981250, Name: '1', Price: '19.2', Status: 1, LastUpdate: '2026-09-01T22:51:06Z' },
            ],
          }],
        }],
      },
    });
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), 117469638719981250)?.Price, '19.2');
    buffer.replayBuffered();
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), 117469638719981250)?.Price, '21.5');
    buffer.endBuffering();
    assert.equal(store.metrics().bufferDepth, 0);
  });

  it('uses buffered Type 2 after snapshot request as the latest livescore', () => {
    const store = new LsportsInPlayStore();
    const buffer = new LsportsRecoveryBuffer(store);
    buffer.beginBuffering();
    buffer.append(type2NullMeta('4', '0', 8000), 8_000);
    buffer.append(type2NullMeta('4', '1', 11000), 11_000);
    buffer.applySnapshot({
      snapshotRequestedAt: 10_000,
      scores: {
        Header: { Type: 36, ServerTimestamp: 10000 },
        Body: [{
          FixtureId: FIXTURE_ID,
          Livescore: {
            Scoreboard: {
              Status: 2,
              Results: [
                { Position: '1', Value: '2' },
                { Position: '2', Value: '2' },
              ],
            },
          },
        }],
      },
    });
    assert.equal(
      ((store.getFixture(FIXTURE_ID)?.livescore?.Scoreboard as { Results?: Array<{ Value: string }> })?.Results?.[0]?.Value),
      '2',
    );
    buffer.replayBuffered();
    const results = (store.getFixture(FIXTURE_ID)?.livescore?.Scoreboard as { Results?: Array<{ Value: string }> })?.Results;
    assert.equal(results?.[0]?.Value, '4');
    assert.equal(results?.[1]?.Value, '1');
    buffer.endBuffering();
  });

  it('exposes sanitized metrics only', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z', extraMarket: true }));
    const metrics = store.metrics();
    assert.equal(metrics.fixtureCount, 1);
    assert.equal(metrics.activeFixtureCount, 1);
    assert.equal(metrics.marketCount, 2);
    assert.equal(metrics.outcomeCount, 4);
    assert.equal(JSON.stringify(metrics).includes('shared-secret'), false);
    assert.equal(JSON.stringify(metrics).includes('Price'), false);
  });
});

const HOME_BET = 117469638719981250;
const DRAW_BET = 212242794219981250;
const AWAY_BET = 155418696819981250;

function type35Patch(input: {
  msgGuid: string;
  bets: Array<{ id: number; settlement: number; lastUpdate: string }>;
}) {
  return {
    Header: { Type: 35, MsgGuid: input.msgGuid, ServerTimestamp: 4000 },
    Body: {
      Events: [{
        FixtureId: FIXTURE_ID,
        Livescore: null,
        Markets: [{
          Id: 1,
          Name: '1X2',
          Status: 3,
          Bets: input.bets.map((bet) => ({
            Id: bet.id,
            Settlement: bet.settlement,
            Status: 3,
            BetStatusId: 3,
            LastUpdate: bet.lastUpdate,
          })),
        }],
      }],
    },
  };
}

function settlementOf(store: LsportsInPlayStore, betId: number) {
  return store.getMarket(FIXTURE_ID, { Id: 1 })?.settlements.get(String(betId));
}

describe('lsports type 35 settlement patches', () => {
  it('does not erase sibling bets when Type 35 includes only one bet', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    store.ingestRmq(type35Patch({
      msgGuid: 'one-bet',
      bets: [{ id: HOME_BET, settlement: 2, lastUpdate: '2026-09-01T22:53:45Z' }],
    }));
    const market = store.getMarket(FIXTURE_ID, { Id: 1 });
    assert.equal(betById(market, HOME_BET)?.Settlement, 2);
    assert.equal(betById(market, HOME_BET)?.Price, '20');
    assert.equal(betById(market, DRAW_BET)?.Price, '1.02');
    assert.equal(betById(market, DRAW_BET)?.Name, 'X');
    assert.equal(betById(market, DRAW_BET)?.Settlement, undefined);
    assert.equal(betById(market, AWAY_BET)?.Price, '21.5');
    assert.equal(betById(market, AWAY_BET)?.Name, '2');
    assert.equal(market?.settlements.has(String(DRAW_BET)), false);
    assert.equal(market?.payload.Name, '1X2');
    assert.equal(market?.payload.Status, 1);
  });

  it('reverts settlement state when 2 is followed by -1', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    store.ingestRmq(type35Patch({
      msgGuid: 'winner',
      bets: [{ id: HOME_BET, settlement: 2, lastUpdate: '2026-09-01T22:53:45Z' }],
    }));
    store.ingestRmq(type35Patch({
      msgGuid: 'cancel',
      bets: [{ id: HOME_BET, settlement: -1, lastUpdate: '2026-09-01T22:54:00Z' }],
    }));
    const state = settlementOf(store, HOME_BET);
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), HOME_BET)?.Settlement, -1);
    assert.equal(state?.received, -1);
    assert.equal(state?.effective, 0);
    assert.equal(state?.previousEffective, 2);
    assert.equal(state?.phase, 'cancelled');
  });

  it('applies a corrected result after 2 -> -1 -> 1', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    store.ingestRmq(type35Patch({
      msgGuid: 'winner',
      bets: [{ id: HOME_BET, settlement: 2, lastUpdate: '2026-09-01T22:53:45Z' }],
    }));
    store.ingestRmq(type35Patch({
      msgGuid: 'cancel',
      bets: [{ id: HOME_BET, settlement: -1, lastUpdate: '2026-09-01T22:54:00Z' }],
    }));
    store.ingestRmq(type35Patch({
      msgGuid: 'loser',
      bets: [{ id: HOME_BET, settlement: 1, lastUpdate: '2026-09-01T22:55:00Z' }],
    }));
    const state = settlementOf(store, HOME_BET);
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), HOME_BET)?.Settlement, 1);
    assert.equal(state?.received, 1);
    assert.equal(state?.effective, 1);
    assert.equal(state?.phase, 'corrected');
    assert.equal(state?.previousEffective, 0);
  });

  it('treats a duplicate Type 35 as idempotent', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    const message = type35Patch({
      msgGuid: 'dup',
      bets: [{ id: HOME_BET, settlement: 2, lastUpdate: '2026-09-01T22:53:45Z' }],
    });
    store.ingestRmq(message);
    const first = { ...settlementOf(store, HOME_BET) };
    store.ingestRmq(message);
    const second = settlementOf(store, HOME_BET);
    assert.deepEqual(second, first);
    assert.equal(second?.phase, 'settled');
    assert.equal(second?.received, 2);
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), DRAW_BET)?.Price, '1.02');
  });

  it('lets a later open Type 3 clear sticky Type 35 settlements on 1X2 bets', () => {
    const store = new LsportsInPlayStore();
    store.ingestRmq(type3Market({ priceHome: '20', lastUpdate: '2026-09-01T22:51:11Z' }));
    store.ingestRmq(type35Settlement());
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), HOME_BET)?.Settlement, 1);
    store.ingestRmq(type3Market({ priceHome: '1.91', lastUpdate: '2026-09-01T22:56:00Z' }));
    const market = store.getMarket(FIXTURE_ID, { Id: 1 });
    assert.equal(market?.payload.Status, 1);
    assert.equal(betById(market, HOME_BET)?.Price, '1.91');
    assert.equal(betById(market, HOME_BET)?.Status, 1);
    assert.equal(betById(market, HOME_BET)?.Settlement, undefined);
    assert.equal(market?.settlements.has(String(HOME_BET)), false);
    assert.equal(store.getIngestCounters().type3Messages, 2);
    assert.equal(store.getIngestCounters().type35Messages, 1);
    assert.equal(store.getIngestCounters().type32Messages, 0);
    assert.equal(store.getIngestCounters().market1AppliedFromType3, 2);
    const inventory = store.marketInventory();
    assert.equal(inventory.market1.count, 1);
    assert.equal(inventory.market1.openMarketCount, 1);
    assert.ok(inventory.market1.validPriceCount >= 3);
  });
});

describe('lsports recovery coordinator', () => {
  it('omits timestamp from cold-start snapshot requests', () => {
    const plan = planSnapshotRequests({ mode: 'COLD_START' });
    assert.equal(plan.length, 3);
    for (const item of plan) {
      assert.equal(item.unfiltered, true);
      assert.equal(item.timestamp, undefined);
      const body = buildPlannedSnapshotBody(item, 4351, 'user', 'secret');
      assert.equal('timestamp' in body, false);
    }
  });

  it('includes last heartbeat timestamp on recovery snapshot requests', async () => {
    const plan = planSnapshotRequests({
      mode: 'RECOVERY_WITH_HEARTBEAT',
      lastHealthyHeartbeatServerTimestamp: 1788303130625,
    });
    assert.equal(plan.length, 3);
    for (const item of plan) {
      assert.equal(item.unfiltered, false);
      assert.equal(item.timestamp, 1788303130625);
      const body = buildPlannedSnapshotBody(item, 4351, 'user', 'secret');
      assert.equal(body.timestamp, 1788303130625);
    }
    let now = 0;
    const store = new LsportsInPlayStore(() => now);
    const requested: LsportsSnapshotPlanItem[] = [];
    const coordinator = new LsportsRecoveryCoordinator({
      store,
      buffer: new LsportsRecoveryBuffer(store, () => now),
      limiter: new LsportsSnapshotRateLimiter(() => now),
      now: () => now,
      lastHealthyHeartbeatServerTimestamp: 1788303130625,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async (item) => {
          requested.push(item);
          return { Header: { Type: 36 }, Body: [] };
        },
      },
    });
    assert.equal(coordinator.getMode(), 'RECOVERY_WITH_HEARTBEAT');
    await coordinator.runRecoveryWithHeartbeat();
    assert.equal(requested.length, 3);
    assert.ok(requested.every((item) => item.timestamp === 1788303130625 && item.unfiltered === false));
    assert.equal(coordinator.getMode(), 'LIVE');
  });

  it('keeps RMQ buffering active before cold-start snapshots', async () => {
    let now = 0;
    const store = new LsportsInPlayStore(() => now);
    const buffer = new LsportsRecoveryBuffer(store, () => now);
    const seen: boolean[] = [];
    const coordinator = new LsportsRecoveryCoordinator({
      store,
      buffer,
      limiter: new LsportsSnapshotRateLimiter(() => now),
      now: () => now,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async () => {
          seen.push(buffer.isBuffering());
          return { Header: { Type: 36 }, Body: [] };
        },
      },
    });
    buffer.beginBuffering();
    buffer.append({ Header: { Type: 32, ServerTimestamp: 9 } }, 1);
    await coordinator.runColdStart();
    assert.equal(seen.length, 3);
    assert.ok(seen.every((value) => value === true));
    assert.equal(coordinator.getMode(), 'LIVE');
    assert.equal(buffer.isBuffering(), false);
  });

  it('stores the first heartbeat after cold start as the recovery timestamp', async () => {
    let now = 0;
    const store = new LsportsInPlayStore(() => now);
    const buffer = new LsportsRecoveryBuffer(store, () => now);
    const limiter = new LsportsSnapshotRateLimiter(() => now);
    const requested: LsportsSnapshotPlanItem[] = [];
    const coordinator = new LsportsRecoveryCoordinator({
      store,
      buffer,
      limiter,
      now: () => now,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async (item) => {
          requested.push(item);
          assert.equal(item.timestamp, undefined);
          assert.equal(item.unfiltered, true);
          return { Header: { Type: 36 }, Body: [] };
        },
      },
    });
    assert.equal(coordinator.getMode(), 'COLD_START');
    await coordinator.runColdStart();
    assert.equal(coordinator.getMode(), 'LIVE');
    assert.equal(coordinator.getLastHealthyHeartbeatServerTimestamp(), null);
    assert.equal(requested.length, 3);
    coordinator.noteHeartbeat({ Header: { Type: 32, ServerTimestamp: 1788303141964 } });
    assert.equal(coordinator.getLastHealthyHeartbeatServerTimestamp(), 1788303141964);
    assert.equal(store.getLastHeartbeatServerTimestamp(), 1788303141964);
    const recoveryPlan = coordinator.planCurrentSnapshots();
    assert.deepEqual(recoveryPlan, []);
    const planned = planSnapshotRequests({
      mode: 'RECOVERY_WITH_HEARTBEAT',
      lastHealthyHeartbeatServerTimestamp: coordinator.getLastHealthyHeartbeatServerTimestamp(),
    });
    assert.equal(planned[0]?.timestamp, 1788303141964);
  });

  it('lets a newer buffered RMQ market win over a cold-start snapshot', async () => {
    let now = 10_000;
    const store = new LsportsInPlayStore(() => now);
    const buffer = new LsportsRecoveryBuffer(store, () => now);
    const limiter = new LsportsSnapshotRateLimiter(() => now);
    const coordinator = new LsportsRecoveryCoordinator({
      store,
      buffer,
      limiter,
      now: () => now,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async (item) => {
          if (item.endpoint === 'GetFixtureMarkets') {
            buffer.append(
              type3Market({ priceHome: '21.5', lastUpdate: '2026-09-01T22:51:11Z' }),
              now + 50,
            );
            return {
              Header: { Type: 36, ServerTimestamp: now },
              Body: [{
                FixtureId: FIXTURE_ID,
                Livescore: null,
                Markets: [{
                  Id: 1,
                  Name: '1X2',
                  Status: 1,
                  Bets: [
                    { Id: HOME_BET, Name: '1', Price: '19.2', Status: 1, LastUpdate: '2026-09-01T22:51:06Z' },
                    { Id: DRAW_BET, Name: 'X', Price: '1.02', Status: 1, LastUpdate: '2026-09-01T22:51:06Z' },
                    { Id: AWAY_BET, Name: '2', Price: '21.5', Status: 1, LastUpdate: '2026-09-01T22:51:06Z' },
                  ],
                }],
              }],
            };
          }
          return { Header: { Type: 36 }, Body: [] };
        },
      },
    });
    await coordinator.runColdStart();
    assert.equal(coordinator.getMode(), 'LIVE');
    assert.equal(betById(store.getMarket(FIXTURE_ID, { Id: 1 }), HOME_BET)?.Price, '21.5');
  });
});

describe('lsports snapshot rate limiter', () => {
  it('enforces a global 1100ms gap between any snapshot requests', () => {
    let now = 0;
    const limiter = new LsportsSnapshotRateLimiter(() => now);
    const first: LsportsSnapshotPlanItem = { endpoint: 'GetFixtures', unfiltered: false, timestamp: 1 };
    const second: LsportsSnapshotPlanItem = { endpoint: 'GetScores', unfiltered: false, timestamp: 1 };
    assert.equal(limiter.canDispatch(first), true);
    limiter.recordDispatch(first);
    now = 500;
    assert.equal(limiter.canDispatch(second), false);
    assert.equal(limiter.requiredDelayMs(second), 600);
    now = 1_100;
    assert.equal(limiter.canDispatch(second), true);
    assert.equal(limiter.requiredDelayMs(second), 0);
  });

  it('blocks a repeat unfiltered call to the same endpoint for 15 seconds', () => {
    let now = 0;
    const limiter = new LsportsSnapshotRateLimiter(() => now);
    const fixtures: LsportsSnapshotPlanItem = { endpoint: 'GetFixtures', unfiltered: true };
    const scores: LsportsSnapshotPlanItem = { endpoint: 'GetScores', unfiltered: true };
    limiter.recordDispatch(fixtures);
    now = 1_100;
    assert.equal(limiter.canDispatch(scores), true);
    assert.equal(limiter.requiredDelayMs(fixtures), 13_900);
    assert.equal(limiter.canDispatch(fixtures), false);
    limiter.recordDispatch(scores);
    now = 15_000;
    assert.equal(limiter.canDispatch(fixtures), true);
    assert.equal(limiter.requiredDelayMs({ endpoint: 'GetFixtures', unfiltered: false, timestamp: 9 }), 0);
  });

  it('spaces cold-start snapshot HTTP by at least 1100ms', async () => {
    let now = 0;
    const startedAt: number[] = [];
    const store = new LsportsInPlayStore(() => now);
    const coordinator = new LsportsRecoveryCoordinator({
      store,
      buffer: new LsportsRecoveryBuffer(store, () => now),
      limiter: new LsportsSnapshotRateLimiter(() => now),
      now: () => now,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async () => {
          startedAt.push(now);
          return { Header: { Type: 36 }, Body: [] };
        },
      },
    });
    await coordinator.runColdStart();
    assert.equal(startedAt.length, 3);
    assert.ok((startedAt[1] ?? 0) - (startedAt[0] ?? 0) >= 1_100);
    assert.ok((startedAt[2] ?? 0) - (startedAt[1] ?? 0) >= 1_100);
  });
});
