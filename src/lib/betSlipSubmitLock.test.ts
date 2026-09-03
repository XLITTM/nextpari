import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBetSlipSubmitLock } from './betSlipSubmitLock';

describe('bet slip submit lock', () => {
  it('allows only one accept/revalidation at a time', () => {
    const lock = createBetSlipSubmitLock();
    assert.equal(lock.tryAcquire(), true);
    assert.equal(lock.pending, true);
    assert.equal(lock.tryAcquire(), false);
    assert.equal(lock.tryAcquire(), false);
    lock.release();
    assert.equal(lock.pending, false);
    assert.equal(lock.tryAcquire(), true);
  });
});
