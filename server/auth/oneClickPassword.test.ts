import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateInternalAuthEmail, generateOneClickPassword, isInternalAuthEmail, publicAuthEmail } from './oneClickPassword.js';

const here = dirname(fileURLToPath(import.meta.url));
const ALPHANUMERIC = /^[A-Za-z0-9]+$/;

describe('one-click password helpers', () => {
  it('generates strong distinct secrets', () => {
    const secrets = Array.from({ length: 32 }, () => generateOneClickPassword());
    assert.equal(new Set(secrets).size, secrets.length);
    for (const secret of secrets) {
      assert.equal(secret.length, 9);
      assert.match(secret, ALPHANUMERIC);
    }
  });

  it('never uses Math.random or stores the generated password', () => {
    const source = readFileSync(join(here, 'oneClickPassword.ts'), 'utf8');
    assert.equal(source.includes('Math.random'), false);
    assert.match(source, /from 'node:crypto'/);
    assert.match(source, /randomInt/);
    assert.equal(source.includes('writeFile'), false);
    assert.equal(source.includes('localStorage'), false);
  });

  it('hides the internal auth mailbox from public snapshots', () => {
    const email = generateInternalAuthEmail();
    assert.equal(isInternalAuthEmail(email), true);
    assert.equal(publicAuthEmail(email), '');
    assert.equal(publicAuthEmail('player@nextpari.test'), 'player@nextpari.test');
    assert.match(email, /@auth\.nextpari\.invalid$/);
  });
});
