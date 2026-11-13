import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSoftAggregator, normalizeCatalog } from './softAggregator.js';
import { casinoDemoRequest } from './http.js';

const demo = {
  provider: 'verified-studio', provider_name: 'Verified Studio',
  id_hash: 'verified/Case Sensitive', name: 'Fixture title', game_type: 'slots',
  image: 'https://art.example.test/game.webp', play_for_fun_supported: true,
};
const env = {
  SOFTAGGREGATOR_DEMO_ENABLED: '1',
  SOFTAGGREGATOR_DEMO_LOGIN: 'fixture-login',
  SOFTAGGREGATOR_DEMO_PASSWORD: 'fixture-password',
  SOFTAGGREGATOR_ARTWORK_ORIGINS: 'https://art.example.test',
  SOFTAGGREGATOR_LAUNCH_ORIGINS: 'https://launch.example.test',
};

test('uses exact entitled identities, filters and coalesces concurrent reads', async () => {
  const calls: string[] = [];
  const client = createSoftAggregator(env, async (url, request) => {
    assert.equal(url, 'https://api.softaggregator.com/api/v1');
    assert.equal(request?.redirect, 'error');
    const body = JSON.parse(String(request?.body));
    calls.push(body.method);
    assert.equal(body.api_login, env.SOFTAGGREGATOR_DEMO_LOGIN);
    assert.equal(body.api_password, env.SOFTAGGREGATOR_DEMO_PASSWORD);
    if (body.method === 'getGameList') {
      return Response.json({ error: 0, response: [
        demo, demo, { ...demo, id_hash: 'no-demo', play_for_fun_supported: false },
        { ...demo, id_hash: 'sports', game_type: 'sportsbook' },
      ] });
    }
    assert.equal(body.method, 'getGameDemo');
    assert.equal(body.gameid, demo.id_hash);
    assert.equal(body.device, 'mobile');
    assert.equal(body.homeurl, 'https://nextpari.net/casino/demo');
    assert.equal(body.play_for_fun, true);
    assert.equal(body.user_username, undefined);
    assert.equal(body.currency, undefined);
    assert.equal(body.balance, undefined);
    return Response.json({ error: 0, response: 'https://launch.example.test/demo/temporary' });
  });
  const [first, empty] = await Promise.all([
    client.list(new URLSearchParams('category=slots&q=fixture')),
    client.list(new URLSearchParams('provider=other')),
  ]);
  assert.deepEqual(calls, ['getGameList']);
  assert.equal(first.games.length, 1);
  assert.deepEqual(empty.games, []);
  assert.equal(first.games[0].image, demo.image);
  assert.equal(first.games[0].mobile, null);
  assert.equal(JSON.stringify(first).includes(demo.id_hash), false);
  await assert.rejects(client.launch('sa-' + '0'.repeat(32), 'mobile', 'https://nextpari.net'));
  assert.equal((await client.launch(first.games[0].id, 'mobile', 'https://nextpari.net')).title, demo.name);
  assert.deepEqual(calls, ['getGameList', 'getGameDemo']);
});

test('omits ambiguous identities, unauthorized artwork and launch origins', async () => {
  const artwork = new Set(['https://art.example.test']);
  assert.equal(normalizeCatalog([demo, { ...demo, name: 'Another title' }], artwork).length, 0);
  assert.equal(normalizeCatalog([{ ...demo, image: 'https://other.test/game.png' }], artwork)[0].game.image, null);
  const client = createSoftAggregator(env, async (_, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({ error: 0, response: body.method === 'getGameList' ? [demo] : 'https://other.test/game' });
  });
  const { games } = await client.list(new URLSearchParams());
  await assert.rejects(client.launch(games[0].id, 'desktop', 'https://nextpari.net'), /CASINO_DEMO_LAUNCH_INVALID/);
});

test('stops upstream reads during provider rate-limit cooldown', async () => {
  let time = 100;
  let calls = 0;
  const client = createSoftAggregator(env, async () => {
    calls += 1;
    return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
      : Response.json({ error: 0, response: [] });
  }, () => time);
  await assert.rejects(client.list(new URLSearchParams()), /CASINO_DEMO_RATE_LIMITED/);
  await assert.rejects(client.list(new URLSearchParams()), /CASINO_DEMO_RATE_LIMITED/);
  assert.equal(calls, 1);
  time += 3001;
  assert.deepEqual((await client.list(new URLSearchParams())).games, []);
  assert.equal(calls, 2);
});

test('blocks cross-origin launches before session or provider calls and checks casino restriction gate', async () => {
  const events: string[] = [];
  const deps = {
    authorize: async (_headers: unknown, gate: boolean) => { events.push('gate:' + gate); return undefined; },
    provider: {
      list: async () => { events.push('catalog'); return { games: [], providers: [], categories: [], nextPage: null }; },
      launch: async () => { events.push('launch'); return { title: 'Fixture', url: 'https://launch.example.test/demo' }; },
    },
  };
  const req = { method: 'POST', headers: { host: 'nextpari.net', 'content-type': 'application/json' },
    body: { id: 'sa-' + 'a'.repeat(32), device: 'desktop' } };
  assert.equal((await casinoDemoRequest({ ...req, headers: { ...req.headers, origin: 'https://other.test' } }, deps)).status, 403);
  assert.deepEqual(events, []);
  const ok = await casinoDemoRequest({ ...req, headers: { ...req.headers, origin: 'https://nextpari.net' } }, deps);
  assert.equal(ok.status, 200);
  assert.match(ok.headers?.['Cache-Control'] ?? '', /no-store/);
  assert.deepEqual(events, ['gate:true', 'launch']);
  assert.equal((await casinoDemoRequest({ method: 'GET', headers: {} })).status, 401);
});
