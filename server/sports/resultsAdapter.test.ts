import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UnconfiguredResultsProvider,
  emptyResultsPage,
  liveResultsProvider,
  loadSportsResults,
  normalizeResultsWindow,
  type SportsResultsProvider,
} from './resultsAdapter.js';

describe('sports results adapter', () => {
  it('keeps the provider replaceable and stays empty until configured', async () => {
    assert.equal(normalizeResultsWindow('LIVE'), 'live');
    assert.equal(normalizeResultsWindow('nope'), 'today');
    const unconfigured = liveResultsProvider();
    assert.equal(unconfigured.providerId, 'unconfigured');
    const page = await loadSportsResults(unconfigured, { window: 'today', sport: 'football' });
    assert.equal(page.configured, false);
    assert.deepEqual(page.events, []);
    assert.match(page.notice, /не подключён/);
    assert.equal(emptyResultsPage({ window: 'archive' }, false).window, 'archive');

    const stub: SportsResultsProvider = {
      providerId: 'future-provider',
      async list() {
        return [{
          canonicalEventId: 'football:eng:event-1',
          provider: 'future-provider',
          sport: 'football',
          competition: 'Premier League',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          homeLogoUrl: null,
          awayLogoUrl: null,
          homeScore: 2,
          awayScore: 1,
          status: 'completed',
          kickoffAt: '2026-11-22T15:00:00.000Z',
          completedAt: '2026-11-22T16:55:00.000Z',
        }];
      },
    };
    const live = await loadSportsResults(stub, { window: 'yesterday' });
    assert.equal(live.configured, true);
    assert.equal(live.providerId, 'future-provider');
    assert.equal(live.events[0].canonicalEventId, 'football:eng:event-1');
    assert.equal(new UnconfiguredResultsProvider().providerId, 'unconfigured');
  });
});
