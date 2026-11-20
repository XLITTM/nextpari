import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BetsApiReadOnlyClient } from '../../betsapi/client.js';
import { handleFootballFeedRequest } from '../../betsapi/footballFeedHttp.js';
import type { NormalizedEvent } from '../../betsapi/types.js';
import { footballAliasEntities } from './footballAliases.js';
import { observationsFromEvents, synchronizeFootballCatalog, type FootballProviderObservation } from './footballDiscovery.js';

const OBSERVED_AT = '2026-11-13T16:00:00.000Z';

function observation(overrides: Partial<FootballProviderObservation> & Pick<FootballProviderObservation, 'kind' | 'name'>): FootballProviderObservation {
  return {
    providerId: null,
    rawProviderId: null,
    countryCode: null,
    category: 'senior',
    competitionProviderId: null,
    competitionName: null,
    endpoint: 'sample',
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function event(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    eventId: '1',
    sportId: '1',
    sport: 'football',
    league: { id: '94', name: 'England Premier League', countryCode: 'GB' },
    home: { id: '708', name: 'Man City' },
    away: { id: '17230', name: 'Arsenal' },
    kickoff: OBSERVED_AT,
    status: 'finished',
    timeStatus: '3',
    score: null,
    marketsKnown: false,
    markets: [],
    updatedAt: null,
    ...overrides,
  };
}

describe('football identity discovery', () => {
  it('keeps the three verified provider ids and does not add another from a similar league', () => {
    const snapshot = synchronizeFootballCatalog({
      observedAt: OBSERVED_AT,
      source: 'test',
      observations: observationsFromEvents([
        event({}),
        event({
          eventId: '2',
          league: { id: '1', name: 'Premier League', countryCode: 'GB' },
          home: { id: '50', name: 'Liverpool' },
          away: { id: '51', name: 'Chelsea' },
        }),
      ], 'sample', OBSERVED_AT),
    });
    assert.deepEqual(snapshot.verifiedProviderIds, ['17230', '708', '94']);
    assert.deepEqual(snapshot.verifiedProviderIdsAdded, []);
    assert.equal(snapshot.canonicalEntities.find((entity) => entity.id === 'football:eng:liverpool')?.providerIds.length, 0);
    assert.equal(snapshot.provisional.some((record) => record.providerId === '1'), true);
    assert.equal(snapshot.review.some((item) => item.providerId === '1' && item.reason === 'unverified-provider-id'), true);
    assert.equal(snapshot.approvedLogos.length, 3);
  });

  it('separates Real Madrid from Atletico, youth, women, reserves, and esports', () => {
    const snapshot = synchronizeFootballCatalog({
      observedAt: OBSERVED_AT,
      source: 'test',
      observations: [
        observation({ kind: 'team', name: 'Real Madrid', countryCode: 'ES', providerId: '10', rawProviderId: '10' }),
        observation({ kind: 'team', name: 'Atletico Madrid', countryCode: 'ES', providerId: '11', rawProviderId: '11' }),
        observation({ kind: 'team', name: 'Arsenal U21', countryCode: 'GB', category: 'youth', providerId: '12', rawProviderId: '12', competitionName: 'Premier League U21' }),
        observation({ kind: 'team', name: 'Arsenal', countryCode: 'GB', category: 'women', providerId: '13', rawProviderId: '13', competitionName: 'Women Super League' }),
        observation({ kind: 'team', name: 'Arsenal Reserves', countryCode: 'GB', category: 'reserve', providerId: '14', rawProviderId: '14' }),
        observation({ kind: 'team', name: 'Arsenal (neo)', countryCode: null, category: 'esoccer', providerId: '15', rawProviderId: '15', competitionName: 'Esoccer Battle' }),
      ],
    });
    assert.equal(snapshot.review.find((item) => item.providerId === '10')?.candidateId, 'football:esp:real-madrid');
    assert.equal(snapshot.review.find((item) => item.providerId === '11')?.candidateId, 'football:esp:atletico-madrid');
    assert.equal(snapshot.canonicalEntities.find((entity) => entity.id === 'football:esp:real-madrid')?.providerIds.length, 0);
    assert.equal(snapshot.review.find((item) => item.providerId === '13')?.reason, 'category-separated');
    assert.equal(snapshot.review.find((item) => item.providerId === '12')?.candidateId, undefined);
    assert.equal(snapshot.review.find((item) => item.providerId === '14')?.candidateId, undefined);
    assert.deepEqual(snapshot.canonicalEntities.find((entity) => entity.id === 'football:eng:arsenal')?.providerIds, ['17230']);
    assert.equal(snapshot.esoccer.some((record) => record.providerId === '15'), true);
    assert.equal(snapshot.provisional.some((record) => record.providerId === '15'), false);
    assert.equal(snapshot.canonicalEntities.find((entity) => entity.id === 'football:esp:real-madrid')?.logo, null);
  });

  it('keeps the Austrian and German Bundesliga unresolved when the name is only Bundesliga', () => {
    const snapshot = synchronizeFootballCatalog({
      observedAt: OBSERVED_AT,
      source: 'test',
      observations: [
        observation({ kind: 'competition', name: 'Austrian Bundesliga', countryCode: 'AT' }),
        observation({ kind: 'competition', name: 'German Bundesliga', countryCode: 'DE' }),
        observation({ kind: 'competition', name: 'Bundesliga', countryCode: 'DE', providerId: '77', rawProviderId: '77' }),
      ],
    });
    const austria = snapshot.review.find((item) => item.name === 'Austrian Bundesliga');
    const germany = snapshot.review.find((item) => item.name === 'German Bundesliga');
    assert.equal(austria?.candidateId, 'football:at:bundesliga');
    assert.equal(germany?.candidateId, 'football:de:bundesliga');
    assert.equal(snapshot.review.find((item) => item.name === 'Bundesliga')?.candidateId, null);
    assert.equal(snapshot.canonicalEntities.find((entity) => entity.id === 'football:at:bundesliga')?.providerIds.length, 0);
    assert.equal(snapshot.canonicalEntities.find((entity) => entity.id === 'football:de:bundesliga')?.providerIds.length, 0);
  });

  it('rejects invalid provider data, duplicate ids, and a repeated synchronization', () => {
    const first = synchronizeFootballCatalog({
      observedAt: OBSERVED_AT,
      source: 'test',
      observations: [
        observation({ kind: 'team', name: 'Palmeiras', countryCode: 'BR', providerId: '80', rawProviderId: '80' }),
        observation({ kind: 'team', name: 'Santos', countryCode: 'BR', providerId: '80', rawProviderId: '80' }),
        observation({ kind: 'team', name: 'Broken', rawProviderId: 'nope' }),
      ],
    });
    const second = synchronizeFootballCatalog({
      previous: first,
      observedAt: OBSERVED_AT,
      source: 'test',
      observations: [
        observation({ kind: 'team', name: 'Palmeiras', countryCode: 'BR', providerId: '80', rawProviderId: '80' }),
        observation({ kind: 'team', name: 'Santos', countryCode: 'BR', providerId: '80', rawProviderId: '80' }),
        observation({ kind: 'team', name: 'Broken', rawProviderId: 'nope' }),
      ],
    });
    assert.equal(first.review.some((item) => item.reason === 'duplicate-provider-id'), true);
    assert.equal(first.review.some((item) => item.reason === 'invalid-provider-data'), true);
    assert.equal(first.provisional.filter((record) => record.providerId === '80').length, 1);
    assert.deepEqual(second.provisional, first.provisional);
    assert.deepEqual(second.review, first.review);
    assert.equal(second.revision, first.revision);
    assert.equal(footballAliasEntities().length, 60);
  });

  it('adds the catalog beside the existing feed without another provider request', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      return new Response(JSON.stringify({
        success: 1,
        pager: { page: 1, per_page: 50, total: 0 },
        results: [],
      }), { status: 200 });
    };
    const options = { env: { BETSAPI_TOKEN: 'unit-test-token' }, minGapMs: 0, fetchImpl };
    const plain = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, new BetsApiReadOnlyClient(options), new BetsApiReadOnlyClient(options));
    const plainCalls = calls.length;
    calls.length = 0;
    const withCatalog = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed?includeCatalog=1' }, new BetsApiReadOnlyClient(options), new BetsApiReadOnlyClient(options));
    assert.equal(calls.length, plainCalls);
    assert.equal(Object.hasOwn(plain.body, 'identityCatalog'), false);
    assert.equal(Object.hasOwn(withCatalog.body, 'identityCatalog'), true);
    assert.deepEqual(withCatalog.body.events, plain.body.events);
    const catalog = withCatalog.body.identityCatalog as { verifiedProviderIdsAdded: string[]; approvedLogos: string[] };
    assert.deepEqual(catalog.verifiedProviderIdsAdded, []);
    assert.equal(catalog.approvedLogos.length, 3);
  });
});
