import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LSPORTS_SETTLEMENT } from '../lsports/state/settlement.js';
import { mapLsportsType35ToCanonical, toCanonicalSettlementNotice } from '../lsports/settlementAdapter.js';
import {
  accumulatorPayout,
  planSettlementTransition,
  settlementPayout,
} from './payout.js';
import { handleSportsSettleRequest, INTERNAL_SPORTS_SETTLE_PATH } from './settleHttp.js';
import {
  parseSportsSettlementNotice,
  SPORTS_SETTLEMENT,
} from './settlement.js';
import { dispatchSettlementNotices } from './settlementDispatch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('provider-neutral sports settlement', () => {
  it('pays canonical Lost/Won/Refund/HalfLost/HalfWon and leaves Pending unmoved', () => {
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.Lost), 0);
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.Won), 18.5);
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.Refund), 10);
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.HalfLost), 5);
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.HalfWon), 14.25);
    assert.equal(settlementPayout(10, 1.85, SPORTS_SETTLEMENT.Pending), null);
  });

  it('preserves cancelled correction and duplicate fingerprint semantics', () => {
    const reverse = planSettlementTransition({
      previousCode: SPORTS_SETTLEMENT.Won,
      previousPayout: 18.5,
      incoming: SPORTS_SETTLEMENT.Cancelled,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: false,
    });
    assert.equal(reverse.action, 'reverse');
    assert.equal(reverse.debitLastPayout, 18.5);
    assert.equal(reverse.nextCode, SPORTS_SETTLEMENT.Cancelled);

    const refundUnsettled = planSettlementTransition({
      previousCode: null,
      previousPayout: 0,
      incoming: SPORTS_SETTLEMENT.Cancelled,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: false,
    });
    assert.equal(refundUnsettled.action, 'payout');
    assert.equal(refundUnsettled.creditPayout, 10);

    const dup = planSettlementTransition({
      previousCode: SPORTS_SETTLEMENT.Won,
      previousPayout: 18.5,
      incoming: SPORTS_SETTLEMENT.Won,
      stake: 10,
      acceptedOdds: 1.85,
      sameFingerprint: true,
    });
    assert.equal(dup.action, 'duplicate');
    assert.equal(dup.creditPayout, 0);
    assert.equal(accumulatorPayout(10, [
      { acceptedOdds: 1.5, settlement: SPORTS_SETTLEMENT.Won },
      { acceptedOdds: 2, settlement: SPORTS_SETTLEMENT.Pending },
    ]).pending, true);
  });

  it('keeps generic payout and dispatch free of LSports imports and hardcoded lsports source', () => {
    for (const rel of ['server/sports/payout.ts', 'server/sports/settlementDispatch.ts', 'server/sports/settleHttp.ts', 'server/sports/settlement.ts']) {
      const source = read(rel);
      assert.equal(source.includes('../lsports/'), false);
      assert.equal(source.includes('server/lsports'), false);
    }
    assert.equal(read('server/sports/settlementDispatch.ts').includes("source: 'lsports'"), false);
  });

  it('maps every LSports Type 35 code through an explicit adapter', () => {
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.Cancelled), SPORTS_SETTLEMENT.Cancelled);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.NotSettled), SPORTS_SETTLEMENT.Pending);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.Loser), SPORTS_SETTLEMENT.Lost);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.Winner), SPORTS_SETTLEMENT.Won);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.Refund), SPORTS_SETTLEMENT.Refund);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.HalfLost), SPORTS_SETTLEMENT.HalfLost);
    assert.equal(mapLsportsType35ToCanonical(LSPORTS_SETTLEMENT.HalfWon), SPORTS_SETTLEMENT.HalfWon);
    assert.equal(mapLsportsType35ToCanonical(99), null);
  });

  it('preserves canonical provider identity on notices and does not convert unknown ids', () => {
    const lsports = toCanonicalSettlementNotice({
      fixtureId: 19981248,
      marketId: '1',
      marketKey: '19981248:1:',
      betId: '117469638719981250',
      settlement: LSPORTS_SETTLEMENT.Winner,
      fingerprint: 'fp-1',
      lastUpdate: null,
    });
    assert.equal(lsports?.provider, 'lsports');
    assert.equal(lsports?.outcomeId, '117469638719981250');
    assert.equal(lsports?.settlement, SPORTS_SETTLEMENT.Won);

    const a = parseSportsSettlementNotice({
      provider: 'provider-a',
      fixtureId: 'fx-1',
      marketId: 'm-1',
      marketKey: 'm-1',
      outcomeId: 'out-1',
      settlement: SPORTS_SETTLEMENT.Lost,
      fingerprint: 'fp-a',
    });
    const b = parseSportsSettlementNotice({
      provider: 'provider-b',
      fixtureId: 'fx-2',
      marketId: 'm-2',
      marketKey: 'm-2',
      outcomeId: 'out-2',
      settlement: SPORTS_SETTLEMENT.Won,
      fingerprint: 'fp-b',
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok) assert.equal(a.notice.provider, 'provider-a');
    if (b.ok) assert.equal(b.notice.provider, 'provider-b');
    assert.equal(parseSportsSettlementNotice({
      fixtureId: 'fx-1',
      outcomeId: 'out-1',
      settlement: 2,
      fingerprint: 'fp-missing',
    }).ok, false);
  });

  it('fails closed on missing settlement provider at the HTTP boundary', async () => {
    const missing = await handleSportsSettleRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SPORTS_SETTLE_PATH,
        authorization: 'Bearer expected-secret',
        body: { items: [{ fingerprint: 'a', fixtureId: '1', outcomeId: '2', settlement: 2 }] },
      },
      { LSPORTS_SETTLEMENT_SECRET: 'expected-secret' },
      { error() {} },
    );
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'SETTLEMENT_PROVIDER_REQUIRED');
  });

  it('dispatches provider from the canonical notice and does not hardcode lsports', async () => {
    const bodies: unknown[] = [];
    await dispatchSettlementNotices(
      [{
        provider: 'provider-a',
        fixtureId: 'fx-1',
        marketId: 'm-1',
        marketKey: 'm-1',
        outcomeId: 'out-1',
        settlement: SPORTS_SETTLEMENT.Won,
        fingerprint: 'fp-a',
        lastUpdate: null,
      }],
      {
        NEXTPARI_SPORTS_SETTLE_URL: 'https://settle.test/api/internal/sports/settle',
        NEXTPARI_SPORTS_SETTLEMENT_SECRET: 'secret',
      },
      {
        fetch: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body ?? '{}')));
          return { status: 200 } as Response;
        },
      },
    );
    assert.equal(bodies.length, 1);
    const payload = bodies[0] as { source?: string; items: Array<{ provider: string }> };
    assert.equal(payload.source, 'provider-a');
    assert.equal(payload.items[0]?.provider, 'provider-a');
    assert.equal(JSON.stringify(payload).includes('"lsports"'), false);
  });

  it('rejects mixed-provider settlement batches without rewriting providers', async () => {
    let rpcCalls = 0;
    const mixedHttp = await handleSportsSettleRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SPORTS_SETTLE_PATH,
        authorization: 'Bearer expected-secret',
        body: {
          provider: 'lsports',
          items: [
            {
              provider: 'lsports',
              fingerprint: 'fp-1',
              fixtureId: '1',
              outcomeId: 'a',
              settlement: SPORTS_SETTLEMENT.Won,
            },
            {
              provider: 'lsports',
              fingerprint: 'fp-2',
              fixtureId: '2',
              outcomeId: 'b',
              settlement: SPORTS_SETTLEMENT.Lost,
            },
            {
              provider: 'provider-b',
              fingerprint: 'fp-3',
              fixtureId: '3',
              outcomeId: 'c',
              settlement: SPORTS_SETTLEMENT.Won,
            },
          ],
        },
      },
      { LSPORTS_SETTLEMENT_SECRET: 'expected-secret' },
      { error() {} },
      async () => {
        rpcCalls += 1;
        return { ok: true };
      },
    );
    assert.equal(mixedHttp.status, 400);
    assert.equal(mixedHttp.body.error, 'SETTLEMENT_PROVIDER_MISMATCH');
    assert.equal(rpcCalls, 0);

    const fetched: unknown[] = [];
    await dispatchSettlementNotices(
      [
        {
          provider: 'lsports',
          fixtureId: 'fx-1',
          marketId: 'm-1',
          marketKey: 'm-1',
          outcomeId: 'out-1',
          settlement: SPORTS_SETTLEMENT.Won,
          fingerprint: 'fp-a',
          lastUpdate: null,
        },
        {
          provider: 'provider-b',
          fixtureId: 'fx-2',
          marketId: 'm-2',
          marketKey: 'm-2',
          outcomeId: 'out-2',
          settlement: SPORTS_SETTLEMENT.Lost,
          fingerprint: 'fp-b',
          lastUpdate: null,
        },
      ],
      {
        NEXTPARI_SPORTS_SETTLE_URL: 'https://settle.test/api/internal/sports/settle',
        NEXTPARI_SPORTS_SETTLEMENT_SECRET: 'secret',
      },
      {
        fetch: async (_url, init) => {
          fetched.push(JSON.parse(String(init?.body ?? '{}')));
          return { status: 200 } as Response;
        },
      },
    );
    assert.equal(fetched.length, 0);
  });
});
