import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { asRecord, readBoundedJson, softAggregatorEndpoint } from './softAggregator.js';
import { isTestIdentity, testBranch } from './softAggregatorTestWallet.js';

type Method = 'getCurrencies' | 'getGameList' | 'createPlayer' | 'getGame';
const unavailable = { ok: false };

function sameSecret(actual: string | undefined, expected: string) {
  if (!actual || actual.length !== expected.length) return false;
  const received = Buffer.from(actual);
  const secret = Buffer.from(expected);
  return received.length === secret.length && timingSafeEqual(received, secret);
}

function approvedOrigin(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

export async function operatorTestRequest(
  req: { method?: string; headers: IncomingMessage['headers']; body?: unknown },
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
) {
  const host = req.headers.host;
  const token = env.SOFTAGGREGATOR_TEST_OPERATOR_TOKEN;
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== testBranch ||
      env.SOFTAGGREGATOR_TEST_OPERATOR_ENABLED !== '1' || !host || host !== env.VERCEL_URL ||
      req.method !== 'POST' || req.headers.origin !== 'https://' + host ||
      !token || token.length < 32 || !sameSecret(req.headers.authorization, 'Bearer ' + token)) {
    return { status: 404, body: unavailable };
  }

  const { action, device } = asRecord(req.body);
  if (action !== 'capabilities' && action !== 'createPlayer' && action !== 'launch') {
    return { status: 400, body: unavailable };
  }

  const login = env.SOFTAGGREGATOR_TEST_API_LOGIN;
  const password = env.SOFTAGGREGATOR_TEST_API_PASSWORD;
  const username = env.SOFTAGGREGATOR_TEST_USERNAME ?? '';
  const playerPassword = env.SOFTAGGREGATOR_TEST_PLAYER_PASSWORD ?? '';
  const currency = env.SOFTAGGREGATOR_TEST_CURRENCY ?? '';
  const gameid = env.SOFTAGGREGATOR_TEST_GAME_ID;
  if (!login || !password || login === env.SOFTAGGREGATOR_DEMO_LOGIN) {
    return { status: 503, body: unavailable };
  }
  if (action !== 'capabilities' && (!isTestIdentity(username, currency) ||
      playerPassword.length < 24 || playerPassword === password)) return { status: 503, body: unavailable };

  const origins = (env.SOFTAGGREGATOR_TEST_LAUNCH_ORIGINS ?? '').split(',').map(approvedOrigin);
  const country = env.SOFTAGGREGATOR_TEST_COUNTRY ?? '';
  if (action === 'launch' && (env.SOFTAGGREGATOR_TEST_STANDARD_LAUNCH_APPROVED !== '1' ||
      env.SOFTAGGREGATOR_TEST_CALLBACK_ENABLED !== '1' || env.SOFTAGGREGATOR_TEST_CALLBACK_VERIFIED !== '1' ||
      !origins.some(Boolean) || !gameid || !/^[A-Z]{2}$/.test(country) ||
      (device !== 'mobile' && device !== 'desktop'))) return { status: 403, body: unavailable };

  async function call(method: Method, params: Record<string, unknown> = {}) {
    const response = await fetcher(softAggregatorEndpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...params, method, api_login: login, api_password: password }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Provider unavailable');
    }
    const result = asRecord(await readBoundedJson(response));
    if (result.error !== 0) throw new Error('Provider declined');
    return result.response;
  }

  try {
    const currencyList = asRecord(await call('getCurrencies')).currencies;
    const currencies = Array.isArray(currencyList)
      ? currencyList.filter((value): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value))
      : [];
    if (action === 'capabilities') return { status: 200, body: { ok: true, currencies } };
    if (!currencies.includes(currency)) return { status: 403, body: unavailable };

    const player = { user_username: username, user_password: playerPassword, currency };
    if (action === 'createPlayer') {
      await call('createPlayer', player);
      return { status: 200, body: { ok: true } };
    }

    const games = await call('getGameList');
    if (!Array.isArray(games)) return { status: 502, body: unavailable };
    const matches = games.map(asRecord).filter((game) => game.id_hash === gameid);
    if (matches.length !== 1 || !['slots', 'live', 'crash', 'table', 'instant', 'bingo', 'keno', 'fishing', 'other']
        .includes(String(matches[0].game_type))) return { status: 404, body: unavailable };

    const result = await call('getGame', {
      ...player, gameid, country, device, lang: 'en', homeurl: 'https://' + host + '/casino/demo',
    });
    if (typeof result !== 'string' || result.length > 8192) return { status: 502, body: unavailable };
    const url = new URL(result);
    const decoded = decodeURIComponent(result);
    if (url.protocol !== 'https:' || !origins.includes(url.origin) || url.username || url.password ||
        [login, password, playerPassword, token].some((secret) => decoded.includes(secret))) {
      return { status: 502, body: unavailable };
    }
    return { status: 200, body: { ok: true, launchUrl: url.href } };
  } catch {
    return { status: 502, body: unavailable };
  }
}

export async function operatorTestVercel(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const type = req.headers['content-type'] ?? '';
  let body = /^application\/json(?:;|$)/i.test(type) ? req.body : undefined;
  if (typeof body === 'string') {
    try { body = body.length <= 1024 ? JSON.parse(body) : undefined; }
    catch { body = undefined; }
  }
  const result = await operatorTestRequest({ method: req.method, headers: req.headers, body }, process.env);
  res.statusCode = result.status;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(result.body));
}
