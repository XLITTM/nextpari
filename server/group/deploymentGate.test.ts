import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { groupDeploymentDecision } from './deploymentGate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('group deployment boundary', () => {
  it('hides NextPari API routes only on the group deployment', () => {
    const blocked = ['/api/player/me', '/api/owner/dashboard', '/api/betconstruct/wallet/GetBalance', '/api/betsapi/live'];
    for (const path of blocked) {
      assert.equal(groupDeploymentDecision(path, '1'), 'deny');
      assert.equal(groupDeploymentDecision(path, undefined), 'allow');
    }
    assert.equal(groupDeploymentDecision('/api/group-owner/auth/login', '1'), 'allow');
    assert.equal(groupDeploymentDecision('/api/group-owner', '1'), 'allow');
    assert.equal(groupDeploymentDecision('/', '1'), 'allow');
    const middleware = readFileSync(join(root, 'middleware.ts'), 'utf8');
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    assert.match(middleware, /GROUP_OWNER_DEPLOYMENT/);
    assert.equal(vercel.includes('GROUP_OWNER_DEPLOYMENT'), false);
    assert.equal(vercel.includes('group-owner'), false);
  });
});
