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
    authorize: async (_headers: unknown) => { events.push('gate'); return undefined; },
    provider: {
      list: async () => { events.push('catalog'); return { games: [], providers: [], categories: [], total: 0, nextPage: null }; },
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
  assert.deepEqual(events, ['gate', 'launch']);
  assert.equal((await casinoDemoRequest({ ...req, headers: { ...req.headers, origin: 'https://nextpari.net' } })).status, 401);
  assert.equal((await casinoDemoRequest({ method: 'GET', headers: {} }, deps)).status, 200);
});

test('standard catalog includes authorized games without demo support and requires USD before launch', async () => {
  const methods: string[] = [];
  const standard = createSoftAggregator({
    SOFTAGGREGATOR_REAL_CATALOG_ENABLED: '1', SOFTAGGREGATOR_REAL_LOGIN: 'standard-login',
    SOFTAGGREGATOR_REAL_PASSWORD: 'standard-password',
    SOFTAGGREGATOR_REAL_LAUNCH_ORIGINS: 'https://launch.example.test',
  }, async (_url, request) => {
    const body = JSON.parse(String(request?.body));
    methods.push(body.method);
    assert.equal(body.api_login, 'standard-login');
    if (body.method === 'getGameList') return Response.json({ error: 0, response: [
      { ...demo, play_for_fun_supported: false },
      { ...demo, id_hash: 'sports', game_type: 'sportsbook' },
    ] });
    if (body.method === 'getCurrencies') return Response.json({ error: 0, response: { currencies: ['USD'] } });
    assert.equal(body.user_username, 'isolated-player');
    assert.equal(body.currency, 'USD');
    if (body.method === 'createPlayer') return Response.json({ error: 0 });
    assert.equal(body.method, 'getGame');
    assert.equal(body.gameid, demo.id_hash);
    assert.equal(body.country, 'GB');
    assert.equal(body.play_for_fun, undefined);
    return Response.json({ error: 0, response: 'https://launch.example.test/session' });
  }, Date.now, 'standard');
  const catalog = await standard.list(new URLSearchParams());
  assert.equal(catalog.games.length, 1);
  assert.equal(catalog.games[0].demo, false);
  const entry = await standard.standardGame(catalog.games[0].id);
  await standard.launchStandard(entry, { username: 'isolated-player', password: 'isolated-password', country: 'GB' },
    'mobile', 'https://nextpari.net');
  assert.deepEqual(methods, ['getGameList', 'getCurrencies', 'createPlayer', 'getGame']);
});

test('casino branch Preview can browse existing provider metadata but cannot launch games', async () => {
  const methods: string[] = [];
  const settings = {
    ...env, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'work/casino-demo-softaggregator-w001',
    SOFTAGGREGATOR_TEST_CATALOG_PREVIEW: '1',
  };
  const fetcher: typeof fetch = async (_url, request) => {
    const body = JSON.parse(String(request?.body));
    methods.push(body.method);
    assert.equal(body.api_login, env.SOFTAGGREGATOR_DEMO_LOGIN);
    return Response.json({ error: 0, response: [
      { ...demo, play_for_fun_supported: false },
      { ...demo, game_type: 'live', id_hash: 'another/Live', provider: 'another' },
    ] });
  };
  const preview = createSoftAggregator(settings, fetcher, Date.now, 'preview-catalog');
  const data = await preview.list(new URLSearchParams('category=slots'));
  assert.equal(data.total, 1);
  assert.equal(data.games[0].demo, false);
  assert.deepEqual(data.providers.map(({ id }) => id), [demo.provider]);
  await assert.rejects(preview.standardGame(data.games[0].id), /CASINO_STANDARD_DISABLED/);
  await assert.rejects(preview.launch(data.games[0].id, 'mobile', 'https://nextpari.net'), /CASINO_STANDARD_DISABLED/);
  await assert.rejects(createSoftAggregator({ ...settings, VERCEL_ENV: 'production' }, fetcher, Date.now, 'preview-catalog')
    .list(new URLSearchParams()), /CASINO_DEMO_DISABLED/);
  await assert.rejects(createSoftAggregator({ ...settings, VERCEL_GIT_COMMIT_REF: 'main' }, fetcher, Date.now, 'preview-catalog')
    .list(new URLSearchParams()), /CASINO_DEMO_DISABLED/);
  assert.deepEqual(methods, ['getGameList']);
});

test('production catalog-only mode limits provider calls to metadata even with launch flags set', async () => {
  const settings = {
    ...env, VERCEL_ENV: 'production', SOFTAGGREGATOR_CATALOG_ONLY: '1',
    SOFTAGGREGATOR_REAL_CATALOG_ENABLED: '1',
    SOFTAGGREGATOR_REAL_LOGIN: 'test-login', SOFTAGGREGATOR_REAL_PASSWORD: 'test-password',
  };
  const methods: string[] = [];
  const fetcher: typeof fetch = async (_url, request) => {
    methods.push(JSON.parse(String(request?.body)).method);
    return Response.json({ error: 0, response: [{ ...demo, play_for_fun_supported: false }] });
  };
  const metadata = createSoftAggregator(settings, fetcher, Date.now, 'preview-catalog');
  assert.equal((await metadata.list(new URLSearchParams('category=slots'))).total, 1);
  await assert.rejects(metadata.standardGame('unused'), /CASINO_STANDARD_DISABLED/);
  await assert.rejects(createSoftAggregator(settings, fetcher, Date.now, 'standard').list(new URLSearchParams()), /CASINO_DEMO_DISABLED/);
  await assert.rejects(createSoftAggregator(settings, fetcher).list(new URLSearchParams()), /CASINO_DEMO_DISABLED/);
  assert.deepEqual(methods, ['getGameList']);
});
