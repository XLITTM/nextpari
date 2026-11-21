import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presentedFootballClock } from './footballClock.js';
import {
  applyFootballQuotes,
  applyLiveBoard,
  footballCardToMatch,
  mergeDetailScoreboard,
  mergeListedMatches,
} from './footballFeed.js';
import type { MatchEvent } from '../types.js';

const observed = '2026-11-21T21:10:00.000Z';
const later = '2026-11-21T21:11:00.000Z';

function event(score: { team1: number; team2: number }, clockAt = observed, extra: Partial<MatchEvent> = {}): MatchEvent {
  const card = footballCardToMatch({
    id: 'oddspapi-v5:id1000000872478722',
    provider: 'oddspapi-v5',
    league: 'LaLiga',
    country: 'Spain',
    home: 'Real Madrid',
    away: 'RC Celta de Vigo',
    kickoff: null,
    live: true,
    score: { home: score.team1, away: score.team2 },
    liveClock: { minute: 69, second: 35, running: true, observedAt: clockAt, stale: false },
    period: 'second_half',
    priceState: 'open',
    markets: [{
      key: '1x2',
      name: 'Исход',
      line: '',
      status: 'open',
      updatedAt: null,
      outcomes: [
        { key: 'home', name: '1', price: 1.8 },
        { key: 'draw', name: 'X', price: 3.4 },
        { key: 'away', name: '2', price: 4.2 },
      ],
    }],
  });
  return { ...card, ...extra, liveScore: extra.liveScore ?? card.liveScore, liveClock: extra.liveClock ?? card.liveClock };
}

test('a 0-1 to 1-1 goal update replaces the scoreboard on every live view', () => {
  const previous = event({ team1: 0, team2: 1 });
  const incoming = event({ team1: 1, team2: 1 }, later, { liveClock: { minute: 70, second: 5, running: true, observedAt: later, stale: false } });
  const listed = mergeListedMatches([previous], [incoming]);
  const board = applyLiveBoard([previous], [incoming]);
  const detail = mergeDetailScoreboard(previous, incoming);
  assert.deepEqual(listed[0]?.liveScore, { team1: 1, team2: 1 });
  assert.deepEqual(board[0]?.liveScore, { team1: 1, team2: 1 });
  assert.deepEqual(detail?.liveScore, { team1: 1, team2: 1 });
  assert.equal(listed[0]?.id, board[0]?.id);
});

test('an odds refresh cannot change the live score', () => {
  const match = event({ team1: 1, team2: 1 }, later);
  const [quoted] = applyFootballQuotes([match], [{
    id: match.id,
    priceState: 'open',
    markets: [{
      key: '1x2',
      name: 'Исход',
      line: '',
      status: 'open',
      updatedAt: null,
      outcomes: [
        { key: 'home', name: '1', price: 1.55 },
        { key: 'draw', name: 'X', price: 4.2 },
        { key: 'away', name: '2', price: 8.1 },
      ],
    }],
  }]);
  assert.equal(quoted.markets['1'], 1.55);
  assert.deepEqual(quoted.liveScore, { team1: 1, team2: 1 });
  assert.equal(quoted.liveClock?.minute, 69);
});

test('an older cached detail cannot override a newer listing score', () => {
  const listed = event({ team1: 1, team2: 1 }, later, { liveClock: { minute: 70, second: 5, running: true, observedAt: later, stale: false } });
  const detail = event({ team1: 0, team2: 1 }, observed);
  const merged = mergeDetailScoreboard(listed, detail);
  assert.deepEqual(merged?.liveScore, { team1: 1, team2: 1 });
  assert.equal(merged?.liveClock?.minute, 70);
});

test('a paused clock does not continue ticking', () => {
  const paused = presentedFootballClock({
    minute: 45,
    second: 0,
    running: false,
    observedAt: new Date(Date.now() - 8_000).toISOString(),
    stale: false,
  }, Date.now());
  assert.equal(paused?.running, false);
  assert.equal(paused?.minute, 45);
  assert.equal(paused?.second, 0);
});

test('a stale snapshot keeps the last verified score and hides the ticking minute', () => {
  const shown = presentedFootballClock({
    minute: 69,
    second: 35,
    running: true,
    observedAt: new Date(Date.now() - 120_000).toISOString(),
    stale: false,
  }, Date.now());
  assert.equal(shown?.stale, true);
  assert.equal(shown?.running, false);
  const kept = applyLiveBoard([event({ team1: 0, team2: 1 })], []);
  assert.deepEqual(kept[0]?.liveScore, { team1: 0, team2: 1 });
});
