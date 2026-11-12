import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { SportsCatalog } from './catalog.js';
import { ownerFootballLogo } from './ownerFootballMedia.js';
import { BETSAPI_EVENTS_LOGO_SOURCE, STARTER_LOGO_CATALOG } from './starterLogos.js';

test('published badges match reviewed provider IDs and have owned assets', () => {
  const catalog = new SportsCatalog(STARTER_LOGO_CATALOG.definition);
  for (const [kind, externalId] of [['competition', '94'], ['participant', '17230'], ['participant', '708']] as const) {
    const exact = catalog.resolve(kind, { source: BETSAPI_EVENTS_LOGO_SOURCE, externalId });
    const logo = ownerFootballLogo(kind, externalId);
    assert.ok(exact.ok && logo);
    assert.equal(logo.canonicalId, exact.value.id);
    assert.ok(existsSync(new URL(`../../../public${logo.path}`, import.meta.url)));
  }
  for (const unknown of ['Arsenal', 'Arsenal U21', '7080', '94', '__proto__', null]) {
    assert.equal(ownerFootballLogo('participant', unknown), null);
  }
});
