import assert from 'node:assert/strict';
import { test } from 'node:test';
import { competitionBucket, competitionRank, countryPresentation, isTopCompetition, takeDiverse } from './competitionCatalog.js';

test('keeps the English Premier League ahead of another Premier League and the lower English divisions', () => {
  assert.ok(competitionRank('football', 'Premier League', 'England') < competitionRank('football', 'Premier League', 'Lebanon'));
  assert.equal(isTopCompetition('football', 'Premier League', 'Lebanon'), false);
  assert.equal(isTopCompetition('football', 'League Two', 'England'), false);
  assert.equal(competitionBucket('football', 'UEFA Champions League', 'Europe'), 'top');
  assert.equal(competitionBucket('football', 'Championship', 'England'), 'country');
  assert.equal(competitionBucket('tennis', 'Billie Jean King Cup', 'Billie Jean King Cup'), 'international');
  assert.equal(countryPresentation('England').name, 'Англия');
  assert.equal(countryPresentation('Turkiye').name, 'Турция');
});

test('spreads listed fixtures across competitions instead of taking the earliest obscure kickoff', () => {
  const fixtures = [
    { id: 'a', league: 'League Two', start: 1 },
    { id: 'b', league: 'League Two', start: 2 },
    { id: 'c', league: 'Premier League', start: 9 },
  ];
  const picked = takeDiverse(fixtures, 2, (fixture) => fixture.league, (fixture) => fixture.league === 'Premier League' ? 1 : 100, (fixture) => fixture.start);
  assert.deepEqual(picked.map((fixture) => fixture.id), ['c', 'a']);
});
