import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryProviderAccountingStore,
  aggregateGgrByCurrency,
  derivedDiscrepancy,
  ingestProviderAccountingEvent,
  inUtcHalfOpen,
  periodKey,
  utcInclusiveDateRange,
  utcMonthBounds,
  type CanonicalProviderEvent,
} from './index.js';

function event(partial: CanonicalProviderEvent): CanonicalProviderEvent {
  return partial;
}

async function ingestAll(store: MemoryProviderAccountingStore, events: CanonicalProviderEvent[]) {
  const results = [];
  for (const item of events) {
    results.push(await ingestProviderAccountingEvent(item, store));
  }
  return results;
}

describe('provider accounting GGR engine', () => {
  it('sports stake without payout is positive GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestProviderAccountingEvent(event({
      providerKey: 'lsports',
      product: 'sports',
      externalTransactionId: 's-1',
      kind: 'stake',
      amount: 100,
      currency: 'TMTM',
      occurredAt: '2026-09-13T12:00:00.000Z',
    }), store);
    const [bucket] = aggregateGgrByCurrency([...store.rows.values()]);
    assert.equal(bucket.internalGgr, 100);
    assert.equal(bucket.stakeTotal, 100);
    assert.equal(bucket.payoutTotal, 0);
  });

  it('sports stake then payout can be negative GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 's-100',
        kind: 'stake',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'p-160',
        relatedTransactionId: 's-100',
        kind: 'payout',
        amount: 160,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:05:00.000Z',
      },
    ]);
    const [bucket] = aggregateGgrByCurrency([...store.rows.values()]);
    assert.equal(bucket.internalGgr, -60);
  });

  it('casino bet then win follows bet minus win', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'future-casino',
        product: 'casino',
        externalTransactionId: 'b-50',
        kind: 'bet',
        amount: 50,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'future-casino',
        product: 'casino',
        externalTransactionId: 'w-40',
        relatedTransactionId: 'b-50',
        kind: 'win',
        amount: 40,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:01:00.000Z',
      },
    ]);
    const [bucket] = aggregateGgrByCurrency([...store.rows.values()]);
    assert.equal(bucket.internalGgr, 10);
    assert.equal(bucket.stakeTotal, 50);
    assert.equal(bucket.payoutTotal, 40);
  });

  it('casino bet then larger win is negative GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'future-casino',
        product: 'casino',
        externalTransactionId: 'b-50b',
        kind: 'bet',
        amount: 50,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'future-casino',
        product: 'casino',
        externalTransactionId: 'w-80',
        kind: 'win',
        amount: 80,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:01:00.000Z',
      },
    ]);
    assert.equal(aggregateGgrByCurrency([...store.rows.values()])[0].internalGgr, -30);
  });

  it('refund of a stake neutralizes GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 's-ref',
        kind: 'stake',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'r-ref',
        relatedTransactionId: 's-ref',
        kind: 'refund',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:10:00.000Z',
      },
    ]);
    assert.equal(aggregateGgrByCurrency([...store.rows.values()])[0].internalGgr, 0);
  });

  it('void of a stake neutralizes GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 's-void',
        kind: 'stake',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'v-void',
        relatedTransactionId: 's-void',
        kind: 'void',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:10:00.000Z',
      },
    ]);
    assert.equal(aggregateGgrByCurrency([...store.rows.values()])[0].internalGgr, 0);
  });

  it('rollback of a payout restores the stake GGR', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 's-rb',
        kind: 'stake',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'p-rb',
        kind: 'payout',
        amount: 160,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:05:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'rb-1',
        relatedTransactionId: 'p-rb',
        kind: 'rollback',
        amount: 160,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:20:00.000Z',
      },
    ]);
    assert.equal(aggregateGgrByCurrency([...store.rows.values()])[0].internalGgr, 100);
  });

  it('replayed provider events do not double count', async () => {
    const store = new MemoryProviderAccountingStore();
    const first = await ingestProviderAccountingEvent({
      providerKey: 'lsports',
      product: 'sports',
      externalTransactionId: 'dup-1',
      kind: 'stake',
      amount: 25,
      currency: 'TMTM',
      occurredAt: '2026-09-13T12:00:00.000Z',
    }, store);
    const second = await ingestProviderAccountingEvent({
      providerKey: 'lsports',
      product: 'sports',
      externalTransactionId: 'dup-1',
      kind: 'stake',
      amount: 25,
      currency: 'TMTM',
      occurredAt: '2026-09-13T12:00:00.000Z',
    }, store);
    assert.equal(first.inserted, true);
    assert.equal(second.replayed, true);
    assert.equal(store.rows.size, 1);
    assert.equal(aggregateGgrByCurrency([...store.rows.values()])[0].internalGgr, 25);
  });

  it('different providers never merge even with the same external id', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'shared-id',
        kind: 'stake',
        amount: 10,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'betsapi',
        product: 'sports',
        externalTransactionId: 'shared-id',
        kind: 'stake',
        amount: 7,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
    ]);
    assert.equal(store.rows.size, 2);
    const lsports = [...store.rows.values()].filter((row) => row.providerKey === 'lsports');
    const betsapi = [...store.rows.values()].filter((row) => row.providerKey === 'betsapi');
    assert.equal(aggregateGgrByCurrency(lsports)[0].internalGgr, 10);
    assert.equal(aggregateGgrByCurrency(betsapi)[0].internalGgr, 7);
  });

  it('different currencies never merge into one GGR number', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'tmtm-1',
        kind: 'stake',
        amount: 100,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'usd-1',
        kind: 'stake',
        amount: 20,
        currency: 'USD',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
    ]);
    const buckets = aggregateGgrByCurrency([...store.rows.values()]);
    assert.equal(buckets.length, 2);
    assert.equal(buckets.find((row) => row.currency === 'TMTM')?.internalGgr, 100);
    assert.equal(buckets.find((row) => row.currency === 'USD')?.internalGgr, 20);
    const mixed = buckets.reduce((sum, row) => sum + row.internalGgr, 0);
    assert.notEqual(mixed, buckets[0].internalGgr);
  });

  it('sports and casino products stay separated', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'sp-1',
        kind: 'stake',
        amount: 30,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'casino',
        externalTransactionId: 'cs-1',
        kind: 'bet',
        amount: 12,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
    ]);
    const sports = [...store.rows.values()].filter((row) => row.product === 'sports');
    const casino = [...store.rows.values()].filter((row) => row.product === 'casino');
    assert.equal(aggregateGgrByCurrency(sports)[0].internalGgr, 30);
    assert.equal(aggregateGgrByCurrency(casino)[0].internalGgr, 12);
  });

  it('uses UTC half-open month boundaries', async () => {
    const store = new MemoryProviderAccountingStore();
    const endOfSep = new Date('2026-09-30T23:59:59.000Z');
    const startOfOct = new Date('2026-10-01T00:00:00.000Z');
    const sep = utcMonthBounds(endOfSep);
    const oct = utcMonthBounds(startOfOct);
    assert.equal(inUtcHalfOpen(endOfSep, sep.start, sep.end), true);
    assert.equal(inUtcHalfOpen(startOfOct, sep.start, sep.end), false);
    assert.equal(inUtcHalfOpen(startOfOct, oct.start, oct.end), true);
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'sep-1',
        kind: 'stake',
        amount: 8,
        currency: 'TMTM',
        occurredAt: endOfSep,
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'oct-1',
        kind: 'stake',
        amount: 9,
        currency: 'TMTM',
        occurredAt: startOfOct,
      },
    ]);
    const sepRows = await store.list({ from: sep.start, to: sep.end });
    const octRows = await store.list({ from: oct.start, to: oct.end });
    assert.equal(aggregateGgrByCurrency(sepRows)[0].internalGgr, 8);
    assert.equal(aggregateGgrByCurrency(octRows)[0].internalGgr, 9);
    const custom = utcInclusiveDateRange('2026-09-01', '2026-09-30');
    assert.equal(custom.end.toISOString(), '2026-10-01T00:00:00.000Z');
  });

  it('settlement periods are unique per provider/product/currency/range and keep commercial fields null', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestAll(store, [
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'per-1',
        kind: 'stake',
        amount: 15,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'per-2',
        kind: 'stake',
        amount: 5,
        currency: 'TMTM',
        occurredAt: '2026-09-14T12:00:00.000Z',
      },
    ]);
    const periods = await store.listPeriods();
    assert.equal(periods.length, 1);
    const period = periods[0];
    assert.equal(period.internalGgr, 20);
    assert.equal(period.providerReportedGgr, null);
    assert.equal(period.commissionFee, null);
    assert.equal(period.amountDue, null);
    assert.equal(period.commercialTerms, null);
    assert.equal(derivedDiscrepancy(period.internalGgr, period.providerReportedGgr), null);
    const again = periodKey(period);
    assert.equal(again, periodKey(periods[0]));
  });

  it('does not write wallet ledger or player balances', async () => {
    const store = new MemoryProviderAccountingStore();
    await ingestProviderAccountingEvent({
      providerKey: 'lsports',
      product: 'sports',
      externalTransactionId: 'no-wallet',
      kind: 'stake',
      amount: 1,
      currency: 'TMTM',
      occurredAt: '2026-09-13T12:00:00.000Z',
    }, store);
    const dumped = JSON.stringify({ rows: [...store.rows.values()], periods: await store.listPeriods() });
    assert.equal(dumped.includes('apply_wallet_entry'), false);
    assert.equal(dumped.includes('wallet_ledger'), false);
    assert.equal(dumped.includes('available_balance'), false);
  });
});
