import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { operatorTestRequest } from './softAggregatorOperatorTest.js';
import { callbackIp, createTestWalletStore, handleTestWalletCallback, testBranch, testWalletKey, walletError } from './softAggregatorTestWallet.js';

const now = 1_800_000_000_000;
const config = { username: 'np_test_' + 'a'.repeat(24), currency: 'USD', salt: 'unit-test-only', writesApproved: true };
const apply = async () => ({ error: 0 as const, balance: 150 });

function signed(overrides: Record<string, string> = {}) {
  const fields = { username: config.username, currency: config.currency, action: 'debit',
    call_id: 'call-1', amount: '100', timestamp: String(now / 1000), round_id: 'round-1',
    game_id: 'studio/Game+Name', ...overrides };
  const key = createHash('md5').update(fields.timestamp + config.salt).digest('hex');
  const params = new URLSearchParams({ ...fields, key });
  const canonical = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => k + '=' + v).join('&');
  return { method: 'GET', sourceIp: callbackIp, url: '/test?' + params.toString(),
    signature: createHmac('sha256', config.salt).update(canonical).digest('hex') };
}

test('rejects unsigned, changed, stale, future and out-of-scope callbacks before accessing storage', async () => {
  const request = signed();
  const noWallet = async () => assert.fail('wallet invoked');
  assert.deepEqual(await handleTestWalletCallback(request, { ...config, writesApproved: false }, noWallet, () => now), walletError);
  for (const invalid of [
    { ...request, signature: undefined }, { ...request, sourceIp: '127.0.0.1' }, { ...request, method: 'POST' },
    { ...request, url: request.url.replace('amount=100', 'amount=900') },
    { ...request, url: request.url + '&amount=100' },
    signed({ currency: 'TMT' }), signed({ username: '000015' }), signed({ amount: '-100' }),
    signed({ timestamp: String(now / 1000 - 31) }), signed({ timestamp: String(now / 1000 + 31) }),
    signed({ call_id: '' }), signed({ game_id: 'studio/Foo&currency=USD' }),
  ]) {
    assert.deepEqual(await handleTestWalletCallback(invalid, config, noWallet, () => now), walletError);
  }
  assert.deepEqual(await handleTestWalletCallback(signed({ action: 'balance' }),
    { ...config, writesApproved: false }, apply, () => now), { error: 0, balance: 150 });
});

test('honors rollback direction, standalone credits and zero-charge free spins', async () => {
  const cases: { fields: Record<string, string>; action: string; amount: number; rollback: boolean }[] = [
    { fields: { action: 'balance' }, action: 'balance', amount: 0, rollback: false },
    { fields: { action: 'credit', type: 'future_kind' }, action: 'credit', amount: 100, rollback: false },
    { fields: { action: 'credit', rb: '1' }, action: 'credit', amount: 100, rollback: true },
    { fields: { action: 'debit', rb: '1', type: 'bonus_fs' }, action: 'debit', amount: 100, rollback: true },
    { fields: { action: 'debit', type: 'bonus_fs' }, action: 'debit', amount: 0, rollback: false },
  ];
  for (const { fields, action, amount, rollback } of cases) {
    assert.deepEqual(await handleTestWalletCallback(signed(fields), config, async (call) => {
      assert.equal(call.action, action);
      assert.equal(call.amount, amount);
      assert.equal(call.rollback, rollback);
      return apply();
    }, () => now), { error: 0, balance: 150 });
  }
});

test('keeps call_id stable across fresh signatures and fingerprints conflicting mutations', async () => {
  const keys: string[][] = [];
  for (const fields of [
    { amount: '100', timestamp: String(now / 1000) },
    { amount: '100', timestamp: String(now / 1000 + 5) },
    { amount: '101', timestamp: String(now) },
  ]) {
    await handleTestWalletCallback(signed(fields), config, async (call) => {
      keys.push([call.callHash, call.fingerprint]);
      return apply();
    }, () => now);
  }
  assert.equal(keys.length, 3);
  assert.deepEqual(keys[0], keys[1]);
  assert.equal(keys[0][0], keys[2][0]);
  assert.notEqual(keys[0][1], keys[2][1]);
});

test('uses a single atomic storage command with no raw provider data and returns insufficient balance', async () => {
  const store = createTestWalletStore('https://wallet-unit-test.upstash.io', 'unit-token', async (_url, init) => {
    const command = JSON.parse(String(init?.body)) as string[];
    assert.equal(command[0], 'EVAL');
    assert.equal(command[2], '1');
    assert.equal(command[3], testWalletKey(config.username, config.currency));
    assert.match(command[4], /^call:[a-f0-9]{64}$/);
    assert.deepEqual(command.slice(6, 9), ['debit', '100', '0']);
    assert.equal(init?.redirect, 'error');
    assert.doesNotMatch(String(init?.body), /unit-test-only|studio\/Game|call-1/);
    return Response.json({ result: [1, 20] });
  });
  assert.deepEqual(await handleTestWalletCallback(signed(), config, store, () => now), { error: 1, balance: 20 });
});

const env = {
  VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: testBranch, VERCEL_URL: 'preview.example',
  SOFTAGGREGATOR_TEST_OPERATOR_ENABLED: '1', SOFTAGGREGATOR_TEST_OPERATOR_TOKEN: 't'.repeat(32),
  SOFTAGGREGATOR_TEST_API_LOGIN: 'api-unit-login', SOFTAGGREGATOR_TEST_API_PASSWORD: 'api-unit-password',
  SOFTAGGREGATOR_TEST_USERNAME: config.username, SOFTAGGREGATOR_TEST_PLAYER_PASSWORD: 'p'.repeat(32),
  SOFTAGGREGATOR_TEST_CURRENCY: 'USD', SOFTAGGREGATOR_TEST_CALLBACK_ENABLED: '1',
  SOFTAGGREGATOR_TEST_CALLBACK_HOST: 'preview.example', SOFTAGGREGATOR_TEST_SALT: config.salt,
  SOFTAGGREGATOR_TEST_REDIS_URL: 'https://wallet-unit-test.upstash.io', SOFTAGGREGATOR_TEST_REDIS_TOKEN: 'unit-token',
  SOFTAGGREGATOR_TEST_LAUNCH_ORIGINS: 'https://approved.example', SOFTAGGREGATOR_TEST_GAME_ID: 'studio/Game',
  SOFTAGGREGATOR_TEST_COUNTRY: 'US',
};
const headers = { host: 'preview.example', origin: 'https://preview.example',
  authorization: 'Bearer ' + env.SOFTAGGREGATOR_TEST_OPERATOR_TOKEN };
const launch = { method: 'POST', headers, body: { action: 'launch', device: 'mobile' } };
const approved = { ...env, SOFTAGGREGATOR_TEST_STANDARD_LAUNCH_APPROVED: '1', SOFTAGGREGATOR_TEST_CALLBACK_VERIFIED: '1' };

test('closes the operator route outside Preview and requires callback configuration and launch approval', async () => {
  const noFetch = async () => assert.fail('provider invoked');
  assert.equal((await operatorTestRequest(launch, env, noFetch)).status, 403);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_TEST_CALLBACK_ENABLED: '0' }, noFetch)).status, 403);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_TEST_REDIS_URL: '' }, noFetch)).status, 403);
  assert.equal((await operatorTestRequest(launch, { ...approved, VERCEL_ENV: 'production' }, noFetch)).status, 404);
  assert.equal((await operatorTestRequest({ ...launch, headers: { ...headers, origin: 'https://different.example' } }, approved, noFetch)).status, 404);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_DEMO_LOGIN: env.SOFTAGGREGATOR_TEST_API_LOGIN }, noFetch)).status, 503);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_REAL_LOGIN: env.SOFTAGGREGATOR_TEST_API_LOGIN }, noFetch)).status, 503);
});

test('checks currency, uses separate player credentials and launches only the configured game', async () => {
  const methods: string[] = [];
  const provider = async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    if (body.method === 'getCurrencies') return Response.json({ error: 0, response: { currencies: ['USD'] } });
    if (body.method === 'getGameList') return Response.json({ error: 0, response: [
      { id_hash: 'studio/Game', game_type: 'slots', play_for_fun_supported: false },
    ] });
    assert.equal(body.user_username, config.username);
    assert.equal(body.user_password, env.SOFTAGGREGATOR_TEST_PLAYER_PASSWORD);
    assert.equal(body.currency, 'USD');
    if (body.method === 'createPlayer') return Response.json({ error: 0 });
    assert.equal(body.method, 'getGame');
    assert.equal(body.gameid, 'studio/Game');
    assert.equal(body.device, 'mobile');
    return Response.json({ error: 0, response: 'https://approved.example/test-session' });
  };
  assert.equal((await operatorTestRequest({ ...launch, body: { action: 'createPlayer' } }, env, provider)).status, 200);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_TEST_CALLBACK_VERIFIED: '0' }, provider)).status, 200);
  assert.deepEqual(methods, ['getCurrencies', 'createPlayer', 'getCurrencies', 'getGameList', 'createPlayer', 'getGame']);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_TEST_GAME_ID: 'absent' }, provider)).status, 404);
  assert.equal((await operatorTestRequest(launch, { ...approved, SOFTAGGREGATOR_TEST_LAUNCH_ORIGINS: 'https://another.example' }, provider)).status, 502);
});

test('returns a documented denial from the operator endpoint without forwarding upstream payloads', async () => {
  const provider = (message: string) => async (_url: unknown, init?: RequestInit) => {
    const { method } = JSON.parse(String(init?.body));
    if (method === 'getCurrencies') return Response.json({ error: 0, response: { currencies: ['USD'] } });
    if (method === 'getGameList') return Response.json({ error: 0, response: [{ id_hash: 'studio/Game', game_type: 'slots' }] });
    if (method === 'createPlayer') return Response.json({ error: 0 });
    return Response.json({ error: 1, message, response: env.SOFTAGGREGATOR_TEST_PLAYER_PASSWORD });
  };
  const message = 'Game not available in your country';
  assert.deepEqual(await operatorTestRequest(launch, approved, provider(message)), {
    status: 502, body: { ok: false, providerMethod: 'getGame', providerStatus: 200, providerError: 1, providerMessage: message },
  });
  const privateDenial = await operatorTestRequest(launch, approved, provider(env.SOFTAGGREGATOR_TEST_PLAYER_PASSWORD));
  assert.doesNotMatch(JSON.stringify(privateDenial), new RegExp(env.SOFTAGGREGATOR_TEST_PLAYER_PASSWORD));
});
