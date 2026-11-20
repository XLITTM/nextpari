import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ownerFootballLogo } from '../../server/sports/catalog/ownerFootballMedia.js';
import { approvedFootballLogo, sportsRegion } from './sportsRegion.js';

describe('approved football media', () => {
  it('publishes only the three reviewed provider ids', () => {
    assert.equal(ownerFootballLogo('competition', '94')?.canonicalId, 'football:eng:premier-league');
    assert.equal(ownerFootballLogo('participant', '17230')?.path, '/images/sports/football/arsenal.png');
    assert.equal(ownerFootballLogo('participant', '708')?.path, '/images/sports/football/manchester-city.png');
    assert.equal(ownerFootballLogo('competition', null), null);
    assert.equal(ownerFootballLogo('participant', '17230')?.canonicalId === ownerFootballLogo('participant', '708')?.canonicalId, false);
  });

  it('does not assign a badge from a similar name or the other Bundesliga', () => {
    assert.equal(ownerFootballLogo('competition', 'Austria Bundesliga'), null);
    assert.equal(ownerFootballLogo('competition', 'Germany Bundesliga'), null);
    assert.equal(approvedFootballLogo('/crest1.webp'), null);
    assert.equal(approvedFootballLogo('https://football-logos.cc/badge.png'), null);
    assert.equal(approvedFootballLogo('/images/sports/football/arsenal.png'), '/images/sports/football/arsenal.png');
  });

  it('shows home-nation flags and leaves international codes blank', () => {
    assert.match(sportsRegion('at'), /Австрия/);
    assert.match(sportsRegion('de'), /Германия/);
    assert.notEqual(sportsRegion('at'), sportsRegion('de'));
    assert.match(sportsRegion('eng'), /Англия/);
    assert.match(sportsRegion('sco'), /Шотландия/);
    assert.match(sportsRegion('wal'), /Уэльс/);
    assert.match(sportsRegion('nir'), /Северная Ирландия/);
    assert.equal(sportsRegion('eu'), '');
    assert.equal(sportsRegion(''), '');
    assert.equal(sportsRegion('unknown'), '');
  });
});
