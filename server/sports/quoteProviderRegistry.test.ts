import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createSportsQuoteProviderRegistry,
  normalizeSportsProviderId,
  SportsProviderRegistrationError,
  SportsProviderUnsupportedError,
} from './quoteProviderRegistry.js';
import type { SportsQuote, SportsQuoteProvider, SportsQuoteRequest } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function fakeProvider(id: string): SportsQuoteProvider {
  return {
    id,
    async getQuote(request: SportsQuoteRequest): Promise<SportsQuote> {
      return {
        provider: id,
        feedType: 'inplay',
        fixtureId: String(request.fixtureId),
        marketId: String(request.marketId ?? ''),
        marketKey: String(request.marketKey ?? ''),
        line: String(request.line ?? ''),
        outcomeId: String(request.outcomeId),
        outcomeName: 'Home',
        price: Number(request.price ?? 1.85),
        status: 'open',
        selectable: true,
        updatedAt: null,
        health: 'HEALTHY',
        heartbeatAgeMs: 10,
      };
    },
  };
}

describe('sports quote provider registry', () => {
  it('resolves a custom provider-a factory without rewriting the id', () => {
    const registry = createSportsQuoteProviderRegistry([
      { id: 'provider-a', create: () => fakeProvider('provider-a') },
    ]);
    const provider = registry.resolve('provider-a');
    assert.equal(provider.id, 'provider-a');
    assert.equal(registry.has('provider-a'), true);
    assert.equal(registry.has('provider-b'), false);
  });

  it('canonicalizes mixed-case registration and lookup to the same provider', () => {
    const registry = createSportsQuoteProviderRegistry([
      { id: 'Provider-A', create: () => fakeProvider('provider-a') },
    ]);
    assert.deepEqual(registry.ids(), ['provider-a']);
    assert.equal(registry.resolve('PROVIDER-A').id, 'provider-a');
    assert.equal(registry.has('Provider-A'), true);
    assert.equal(normalizeSportsProviderId(' Provider-A '), 'provider-a');
  });

  it('resolves provider-a and provider-b independently', () => {
    const seen: string[] = [];
    const registry = createSportsQuoteProviderRegistry([
      {
        id: 'provider-a',
        create: () => {
          seen.push('provider-a');
          return fakeProvider('provider-a');
        },
      },
      {
        id: 'provider-b',
        create: () => {
          seen.push('provider-b');
          return fakeProvider('provider-b');
        },
      },
    ]);
    assert.equal(registry.resolve('provider-a').id, 'provider-a');
    assert.equal(registry.resolve('provider-b').id, 'provider-b');
    assert.deepEqual(seen, ['provider-a', 'provider-b']);
    assert.deepEqual(registry.ids(), ['provider-a', 'provider-b']);
  });

  it('rejects duplicate normalized registrations', () => {
    assert.throws(
      () => createSportsQuoteProviderRegistry([
        { id: 'provider-a', create: () => fakeProvider('provider-a') },
        { id: 'PROVIDER-A', create: () => fakeProvider('provider-a') },
      ]),
      (error: unknown) => error instanceof SportsProviderRegistrationError
        && error.message.includes('SPORTS_PROVIDER_REGISTRATION_DUPLICATE'),
    );
  });

  it('rejects a blank registration id', () => {
    assert.throws(
      () => createSportsQuoteProviderRegistry([
        { id: '   ', create: () => fakeProvider('provider-a') },
      ]),
      (error: unknown) => error instanceof SportsProviderRegistrationError
        && error.message === 'SPORTS_PROVIDER_REGISTRATION_ID_REQUIRED',
    );
  });

  it('rejects a factory whose provider id does not match the registration', () => {
    const registry = createSportsQuoteProviderRegistry([
      { id: 'provider-a', create: () => fakeProvider('provider-b') },
    ]);
    assert.throws(
      () => registry.resolve('provider-a'),
      (error: unknown) => error instanceof SportsProviderRegistrationError
        && error.message.includes('SPORTS_PROVIDER_REGISTRATION_ID_MISMATCH')
        && error.message.includes('provider-a')
        && error.message.includes('provider-b'),
    );
  });

  it('fails closed on missing and unknown ids without creating factories', () => {
    let created = 0;
    const registry = createSportsQuoteProviderRegistry([
      {
        id: 'provider-a',
        create: () => {
          created += 1;
          return fakeProvider('provider-a');
        },
      },
    ]);
    for (const providerId of [undefined, '', '   ', 'provider-not-registered'] as const) {
      assert.throws(
        () => registry.resolve(providerId),
        (error: unknown) => error instanceof SportsProviderUnsupportedError
          && error.code === 'SPORTS_PROVIDER_UNSUPPORTED',
      );
    }
    assert.equal(created, 0);
    assert.equal(registry.has(undefined), false);
    assert.equal(registry.has(''), false);
  });

  it('does not mention specific sports providers in the generic registry source', () => {
    const source = readFileSync(join(root, 'server/sports/quoteProviderRegistry.ts'), 'utf8');
    const lower = source.toLowerCase();
    assert.equal(lower.includes('lsports'), false);
    assert.equal(lower.includes('betb2b'), false);
    assert.equal(source.includes('createLsportsHttpQuoteProvider'), false);
  });
});
