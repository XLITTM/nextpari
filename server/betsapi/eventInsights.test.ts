import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readEventInsights } from './eventInsights.js';
import { normalizeFootballDetails } from './parse.js';

const observed = Date.parse('2026-11-12T16:00:00.000Z');

describe('football event insights', () => {
  it('reads provider stat pairs and timeline text without inventing head-to-head', () => {
    const payload = {
      results: [{
        id: '6626023',
        sport_id: '1',
        time_status: '3',
        time: '1645552800',
        league: { id: '94', name: 'England Premier League', cc: 'gb' },
        home: { id: '17230', name: 'Arsenal' },
        away: { id: '708', name: 'Manchester City' },
        ss: '1-0',
        scores: { '1': { home: '1', away: '0' }, '2': { home: '0', away: '0' } },
        stats: {
          attacks: ['145', '69'],
          on_target: ['5', '3'],
          corners: ['6', '6'],
          possession_rt: ['56', '44'],
          yellowcards: ['4', '1'],
        },
        events: [
          { id: '10', text: "12' - 1st Corner - Man City" },
          { id: '', text: 'ignored' },
        ],
      }],
    };
    const insights = readEventInsights(payload, observed);
    assert.equal(insights?.availability.statistics, 'available');
    assert.equal(insights?.availability.headToHead, 'absent');
    assert.equal(insights?.availability.previousMatches, 'absent');
    assert.equal(insights?.statistics.find((item) => item.key === 'attacks')?.home, 145);
    assert.equal(insights?.timeline.length, 1);
    const event = normalizeFootballDetails(payload, null, observed);
    assert.equal(event?.eventId, '6626023');
    assert.equal(event?.league.id, '94');
    assert.equal(event?.insights?.periodScores[0]?.home, 1);
    assert.equal(event?.marketsKnown, false);
  });

  it('reports absent statistics when the provider view has none', () => {
    const insights = readEventInsights({
      results: [{ id: '1', sport_id: '1', time_status: '0', time: '1645552800', league: { id: '1', name: 'Regional Cup' }, home: { name: 'Home' }, away: { name: 'Away' } }],
    }, observed);
    assert.equal(insights?.availability.statistics, 'absent');
    assert.equal(insights?.availability.timeline, 'absent');
    assert.deepEqual(insights?.statistics, []);
  });
});
