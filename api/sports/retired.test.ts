import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import sportsHandler from './index.js';
import inplayHandler from './inplay.js';
import betsapiHandler from '../betsapi/[...path].js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function mockRes() {
  const headers: Record<string, string> = {};
  let status = 200;
  let body = '';
  return {
    status(code: number) {
      status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    send(value: string) {
      body = value;
    },
    json(value: unknown) {
      body = JSON.stringify(value);
    },
    snapshot() {
      return { status, headers, body: body ? JSON.parse(body) as Record<string, unknown> : null };
    },
  };
}

const originalFetch = globalThis.fetch;
let fetchCalls = 0;

function forbidNetwork() {
  fetchCalls = 0;
  globalThis.fetch = (async (..._args: unknown[]) => {
    fetchCalls += 1;
    throw new Error('NETWORK_FORBIDDEN');
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchCalls = 0;
});

describe('legacy sports public API retirement', () => {
  it('D. /api/sports returns empty disabled JSON without network', async () => {
    forbidNetwork();
    const res = mockRes();
    await sportsHandler({ query: { type: 'inplay' }, url: '/api/sports?type=inplay' }, res);
    const out = res.snapshot();
    assert.equal(out.status, 200);
    assert.equal(out.headers['Cache-Control'], 'no-store');
    assert.deepEqual(out.body, {
      success: 1,
      results: [],
      source: 'disabled',
      reason: 'LEGACY_SPORTS_FEED_DISABLED',
    });
    assert.equal(fetchCalls, 0);
    const src = read('api/sports/index.js');
    assert.equal(src.includes('catalog-cache'), false);
    assert.equal(src.includes('b365api'), false);
    assert.equal(src.includes('betsapi.com'), false);
  });

  it('E. /api/sports/inplay returns empty disabled JSON without network', async () => {
    forbidNetwork();
    const res = mockRes();
    await inplayHandler({}, res);
    const out = res.snapshot();
    assert.equal(out.status, 200);
    assert.equal(out.headers['Cache-Control'], 'no-store');
    assert.deepEqual(out.body, {
      success: 1,
      results: [],
      source: 'disabled',
      reason: 'LEGACY_SPORTS_FEED_DISABLED',
    });
    assert.equal(fetchCalls, 0);
    const src = read('api/sports/inplay.js');
    assert.equal(src.includes('inplay-cache'), false);
    assert.equal(src.includes('b365api'), false);
    assert.equal(src.includes('betsapi.com'), false);
  });

  it('F. /api/betsapi returns 410 without network', async () => {
    forbidNetwork();
    const res = mockRes();
    await betsapiHandler({ query: { path: ['v3', 'events', 'inplay'] } }, res);
    const out = res.snapshot();
    assert.equal(out.status, 410);
    assert.equal(out.headers['Cache-Control'], 'no-store');
    assert.deepEqual(out.body, {
      success: 0,
      error: 'LEGACY_SPORTS_FEED_DISABLED',
    });
    assert.equal(fetchCalls, 0);
    const src = read('api/betsapi/[...path].js');
    assert.equal(src.includes('gateway.js'), false);
    assert.equal(src.includes('fetchBetsApi'), false);
  });

  it('G. fake 2.10/3.25/2.80 odds are not reachable from active sports APIs', async () => {
    forbidNetwork();
    const sports = mockRes();
    await sportsHandler({}, sports);
    const inplay = mockRes();
    await inplayHandler({}, inplay);
    const json = JSON.stringify([sports.snapshot().body, inplay.snapshot().body]);
    assert.equal(json.includes('2.10'), false);
    assert.equal(json.includes('3.25'), false);
    assert.equal(json.includes('2.80'), false);
    const sportsSrc = read('api/sports/index.js');
    const inplaySrc = read('api/sports/inplay.js');
    assert.equal(sportsSrc.includes('odds-fallback'), false);
    assert.equal(inplaySrc.includes('odds-fallback'), false);
    assert.equal(sportsSrc.includes('2.10'), false);
    assert.equal(inplaySrc.includes('3.25'), false);
  });
});
