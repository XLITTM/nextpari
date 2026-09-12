import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateInternalAuthEmail, generateOneClickPassword, isInternalAuthEmail, publicAuthEmail } from './oneClickPassword.js';

describe('one-click password helpers', () => {
  it('generates strong distinct secrets', () => {
    const secrets = new Set(Array.from({ length: 8 }, () => generateOneClickPassword()));
    assert.equal(secrets.size, 8);
    for (const secret of secrets) {
      assert.ok(secret.length >= 16);
    }
  });

  it('hides the internal auth mailbox from public snapshots', () => {
    const email = generateInternalAuthEmail();
    assert.equal(isInternalAuthEmail(email), true);
    assert.equal(publicAuthEmail(email), '');
    assert.equal(publicAuthEmail('player@nextpari.test'), 'player@nextpari.test');
    assert.match(email, /@auth\.nextpari\.invalid$/);
  });
});
