import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decideSportsQuote, readSportsQuote } from './quote.js';
import {
  resolveSportsQuoteProvider,
  SportsProviderUnsupportedError,
} from './quoteProvider.js';
import { SPORTS_PROVIDER_LSPORTS, type SportsQuote, type SportsQuoteRequest } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROVIDERS = ['provider-a', 'provider-b'] as const;

function requestFor(provider: string, overrides: Partial<SportsQuoteRequest> = {}): SportsQuoteRequest {
  return {
    provider,
    fixtureId: 'fx-1',
    marketId: 'm-1',
    marketKey: 'm-1',
    line: '',
    outcomeId: 'out-1',
    price: 1.85,
    ...overrides,
  };
}

function quoteFor(provider: string, overrides: Partial<SportsQuote> = {}): SportsQuote {
  return {
    provider,
    feedType: 'inplay',
    fixtureId: 'fx-1',
    marketId: 'm-1',
    marketKey: 'm-1',
    line: '',
    outcomeId: 'out-1',
    outcomeName: 'Home',
    price: 1.85,
    status: 'open',
    selectable: true,
    updatedAt: null,
    health: 'HEALTHY',
    heartbeatAgeMs: 40,
    ...overrides,
  };
}

describe('provider-neutral quote decision', () => {
  it('does not import LSports parsing or heartbeat constants', () => {
    const source = readFileSync(join(root, 'server/sports/quote.ts'), 'utf8');
    assert.equal(source.includes('server/lsports'), false);
    assert.equal(source.includes('../lsports/'), false);
    assert.equal(source.includes('parseCanonicalMarketKey'), false);
    assert.equal(source.includes('LSPORTS_HEARTBEAT_STALE_MS'), false);
    assert.equal(source.includes('isLsports'), false);
    assert.equal(source.includes('BetStatusId'), false);
  });

  for (const provider of PROVIDERS) {
    describe(provider, () => {
      it('accepts a healthy exact quote', () => {
        const decision = decideSportsQuote(requestFor(provider), quoteFor(provider));
        assert.equal(decision.ok, true);
        if (decision.ok) assert.equal(decision.quote.provider, provider);
      });

      it('rejects a fixture mismatch as EVENT_UNAVAILABLE', () => {
        const decision = decideSportsQuote(
          requestFor(provider, { fixtureId: 'fx-other' }),
          quoteFor(provider),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'EVENT_UNAVAILABLE');
      });

      it('rejects a market mismatch as EVENT_UNAVAILABLE', () => {
        const decision = decideSportsQuote(
          requestFor(provider, { marketId: 'm-other', marketKey: 'm-other' }),
          quoteFor(provider),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'EVENT_UNAVAILABLE');
      });

      it('rejects an outcome mismatch as MISSING_BET_ID', () => {
        const decision = decideSportsQuote(
          requestFor(provider, { outcomeId: 'out-other' }),
          quoteFor(provider),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'MISSING_BET_ID');
      });

      it('rejects a suspended market', () => {
        const decision = decideSportsQuote(
          requestFor(provider),
          quoteFor(provider, { status: 'suspended', selectable: false }),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'MARKET_SUSPENDED');
      });

      it('rejects a stale adapter health flag', () => {
        const decision = decideSportsQuote(
          requestFor(provider),
          quoteFor(provider, { health: 'STALE', heartbeatAgeMs: 50 }),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'FEED_STALE');
      });

      it('rejects a changed price', () => {
        const decision = decideSportsQuote(
          requestFor(provider, { price: 9.99 }),
          quoteFor(provider, { price: 1.85 }),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) {
          assert.equal(decision.reason, 'ODDS_CHANGED');
          assert.equal(decision.currentPrice, 1.85);
        }
      });

      it('rejects an invalid price', () => {
        const decision = decideSportsQuote(
          requestFor(provider),
          quoteFor(provider, { price: 1 }),
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'INVALID_PRICE');
      });

      it('rejects when betting is disabled', () => {
        const decision = decideSportsQuote(
          requestFor(provider),
          quoteFor(provider),
          { bettingEnabled: false },
        );
        assert.equal(decision.ok, false);
        if (!decision.ok) assert.equal(decision.reason, 'SPORTS_BET_DISABLED');
      });
    });
  }

  it('rejects an explicit provider identity mismatch', () => {
    const decision = decideSportsQuote(requestFor('provider-a'), quoteFor('provider-b'));
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'EVENT_UNAVAILABLE');
  });

  it('accepts matching explicit provider identity', () => {
    const decision = decideSportsQuote(requestFor('provider-a'), quoteFor('provider-a'));
    assert.equal(decision.ok, true);
  });

  it('defaults omitted and blank providers to LSports without calling other adapters', () => {
    assert.equal(resolveSportsQuoteProvider().id, SPORTS_PROVIDER_LSPORTS);
    assert.equal(resolveSportsQuoteProvider('').id, SPORTS_PROVIDER_LSPORTS);
    assert.equal(resolveSportsQuoteProvider('   ').id, SPORTS_PROVIDER_LSPORTS);
  });

  it('resolves explicit lsports to the LSports adapter', () => {
    assert.equal(resolveSportsQuoteProvider('lsports').id, SPORTS_PROVIDER_LSPORTS);
    assert.equal(resolveSportsQuoteProvider('LSports').id, SPORTS_PROVIDER_LSPORTS);
  });

  it('fails closed on explicit unknown providers without using LSports', () => {
    for (const provider of ['provider-a', 'provider-b', 'betsapi', 'betb2b', 'softgaming', 'random-provider']) {
      assert.throws(
        () => resolveSportsQuoteProvider(provider),
        (error: unknown) => error instanceof SportsProviderUnsupportedError
          && error.code === 'SPORTS_PROVIDER_UNSUPPORTED'
          && error.message === 'SPORTS_PROVIDER_UNSUPPORTED',
      );
    }
  });

  it('does not coerce an arbitrary canonical provider to lsports when parsing quotes', () => {
    const quote = readSportsQuote({
      provider: 'betb2b',
      feedType: 'inplay',
      fixtureId: 'fx-1',
      marketId: 'm-1',
      marketKey: 'm-1',
      line: '',
      outcomeId: 'out-1',
      price: 1.85,
      status: 'open',
      selectable: true,
      health: 'HEALTHY',
      heartbeatAgeMs: 10,
    });
    assert.equal(quote.provider, 'betb2b');
    const missing = readSportsQuote({
      fixtureId: 'fx-1',
      outcomeId: 'out-1',
      status: 'open',
      selectable: true,
      health: 'HEALTHY',
      price: 1.85,
    });
    assert.equal(missing.provider, '');
  });

  it('applies a generic heartbeat cap without LSports constants', () => {
    const decision = decideSportsQuote(
      requestFor('provider-a'),
      quoteFor('provider-a', { health: 'HEALTHY', heartbeatAgeMs: 500 }),
      { bettingEnabled: true, maxHeartbeatAgeMs: 100 },
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'FEED_STALE');
  });
});
