import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OddsHydrationQueue, type HydrationMatch } from './oddsHydration.js';

function row(id: string, live: boolean): HydrationMatch {
  return { id, isLive: live, priceState: 'unpriced', hasPrices: false };
}

test('does not mark a fixture finished before a successful quote arrives', () => {
  const queue = new OddsHydrationQueue();
  const matches = [row('a', true), row('b', false)];
  queue.syncCatalog(matches);
  queue.markInFlight(['a']);
  assert.equal(queue.states.get('a')?.status, 'in_flight');
  queue.markFailed(['a'], 1_000, 5_000);
  assert.equal(queue.states.get('a')?.status, 'retryable');
  assert.equal(queue.takeBatch(matches, 10, 1_000).includes('a'), false);
  assert.deepEqual(queue.takeBatch(matches, 10, 6_000), ['a', 'b']);
});

test('catalog refresh keeps priced and unavailable progress', () => {
  const queue = new OddsHydrationQueue();
  queue.syncCatalog([row('priced', true), row('missing', false), row('next', true)]);
  queue.applyQuote('priced', { hasPrices: true, priceState: 'open' });
  queue.applyQuote('missing', { hasPrices: false, priceState: 'unavailable' });
  queue.syncCatalog([
    { id: 'priced', isLive: true, priceState: 'unpriced', hasPrices: false },
    { id: 'missing', isLive: false, priceState: 'unpriced', hasPrices: false },
    { id: 'next', isLive: true, priceState: 'unpriced', hasPrices: false },
  ]);
  assert.equal(queue.states.get('priced')?.status, 'priced');
  assert.equal(queue.states.get('missing')?.status, 'unavailable');
  assert.deepEqual(queue.takeBatch([
    { id: 'priced', isLive: true, priceState: 'unpriced', hasPrices: false },
    { id: 'missing', isLive: false, priceState: 'unpriced', hasPrices: false },
    { id: 'next', isLive: true, priceState: 'unpriced', hasPrices: false },
  ], 10), ['next']);
});

test('interleaves live and prematch so live cannot starve the line', () => {
  const queue = new OddsHydrationQueue();
  const matches = [
    ...Array.from({ length: 30 }, (_, index) => row(`live-${index}`, true)),
    ...Array.from({ length: 30 }, (_, index) => row(`line-${index}`, false)),
  ];
  queue.syncCatalog(matches);
  const batch = queue.takeBatch(matches, 8);
  assert.equal(batch.filter((id) => id.startsWith('live-')).length, 4);
  assert.equal(batch.filter((id) => id.startsWith('line-')).length, 4);
});

test('visible fixtures jump the queue ahead of the rest of the catalog', () => {
  const queue = new OddsHydrationQueue();
  const matches = [row('live-a', true), row('line-hidden', false), row('line-visible', false)];
  queue.syncCatalog(matches);
  queue.markVisible(['line-visible']);
  assert.equal(queue.takeBatch(matches, 2)[0], 'line-visible');
});

test('in-flight work survives a catalog refresh until the quote lands', () => {
  const queue = new OddsHydrationQueue();
  const matches = [row('a', true), row('b', false)];
  queue.syncCatalog(matches);
  queue.markInFlight(['a']);
  queue.syncCatalog(matches);
  assert.equal(queue.states.get('a')?.status, 'in_flight');
  assert.deepEqual(queue.takeBatch(matches, 10), ['b']);
});
