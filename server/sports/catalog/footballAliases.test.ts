import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFootballAlias, resolveFootballProviderId, reviewArchiveAsset } from './footballAliases.js';

describe('canonical football aliases', () => {
  it('resolves every Manchester City spelling to one identity', () => {
    const names = ['Manchester City', 'Manchester City FC', 'Man City', 'Манчестер Сити', 'Ман Сити'];
    const ids = names.map((name) => resolveFootballAlias(name));
    assert.equal(ids.every((item) => item.status === 'resolved' && item.entity.id === 'football:eng:manchester-city'), true);
    const provider = resolveFootballProviderId('708');
    assert.equal(provider.status === 'resolved' && provider.entity.id, 'football:eng:manchester-city');
  });

  it('keeps the Austrian and German Bundesliga separate and unresolved when the name is only Bundesliga', () => {
    const austria = resolveFootballAlias('Austrian Bundesliga');
    const germany = resolveFootballAlias('Germany Bundesliga');
    assert.equal(austria.status === 'resolved' && austria.entity.id, 'football:at:bundesliga');
    assert.equal(germany.status === 'resolved' && germany.entity.id, 'football:de:bundesliga');
    assert.notEqual(austria.status === 'resolved' && austria.entity.country, germany.status === 'resolved' && germany.entity.country);
    assert.equal(resolveFootballAlias('Bundesliga').status, 'unresolved');
    assert.equal(austria.status === 'resolved' && austria.entity.providerIds.length, 0);
    assert.equal(austria.status === 'resolved' && austria.entity.logo, null);
  });

  it('uses only verified provider ids and holds unapproved archive files', () => {
    const premier = resolveFootballProviderId('94');
    assert.equal(premier.status === 'resolved' && premier.entity.logo, '/images/sports/football/premier-league.png');
    assert.equal(resolveFootballProviderId('17230').status, 'resolved');
    assert.equal(resolveFootballProviderId('999').status, 'unresolved');
    assert.equal(reviewArchiveAsset({ canonicalId: 'football:eng:arsenal', file: 'arsenal.png', approved: true }), 'published');
    assert.equal(reviewArchiveAsset({ canonicalId: 'football:at:bundesliga', file: 'austria.png', approved: true }), 'awaiting-publication');
    assert.equal(reviewArchiveAsset({ canonicalId: 'football:at:bundesliga', file: 'austria.png', approved: false }), 'rejected');
  });
});
