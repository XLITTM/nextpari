import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isRetiredSportsProvider, SPORTS_PROVIDER_RETIRED } from './retiredProviders.js';
import { resolveSportsQuoteProvider, SportsProviderUnsupportedError } from './quoteProvider.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('legacy sports runtime retirement — placement', () => {
  it('H. retired providers cannot quote or resolve through the live registry', () => {
    for (const id of ['lsports', 'LSports', 'betsapi', 'b365api', 'b365']) {
      assert.equal(isRetiredSportsProvider(id), true, id);
      assert.throws(
        () => resolveSportsQuoteProvider(id),
        (error: unknown) => error instanceof SportsProviderUnsupportedError,
      );
    }
    assert.equal(SPORTS_PROVIDER_RETIRED, 'SPORTS_PROVIDER_RETIRED');
    const place = read('server/player/sportsPlaceService.ts');
    assert.match(place, /isRetiredSportsProvider/);
    assert.match(place, /SPORTS_PROVIDER_RETIRED/);
    const quote = read('server/sports/quoteProvider.ts');
    assert.equal(quote.includes('createLsportsHttpQuoteProvider'), false);
  });
});
