import { getBetsApiGatewayToken } from '../betsapi/gateway.js';

const PRIMARY = 'https://api.b365api.com/v1/events/inplay';
const FALLBACK = 'https://api.betsapi.com/v1/events/inplay';
const CACHE_TTL_MS = 4_000;
const PAUSE_429_MS = 30_000;
const CLOSED = new Set(['3', '4', '5', '8']);
const FALLBACK_TOKEN = '264390-ZTbtCqHFCvyhXS';

let cache = {
  at: 0,
  status: 200,
  body: JSON.stringify({ success: 1, results: [] }),
};
let pauseUntil = 0;
let inflight = null;

function resolveToken() {
  return getBetsApiGatewayToken() || FALLBACK_TOKEN;
}

function timeStatusOf(row) {
  return String(row?.time_status ?? '').trim();
}

function keepLive(row) {
  const status = timeStatusOf(row);
  if (CLOSED.has(status)) return false;
  return status === '1';
}

function filterBody(body) {
  try {
    const json = JSON.parse(body);
    const results = Array.isArray(json.results) ? json.results.filter(keepLive) : [];
    return JSON.stringify({ ...json, success: json.success ?? 1, results });
  } catch {
    return JSON.stringify({ success: 1, results: [] });
  }
}

function emptyBody() {
  return JSON.stringify({ success: 1, results: [] });
}

async function fetchOnce(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.text();
  return { status: response.status, body };
}

async function loadFromNetwork() {
  const key = resolveToken();
  if (!key) {
    return { status: 500, body: JSON.stringify({ success: 0, error: 'BetsAPI token is missing' }), cached: false };
  }

  const query = `token=${encodeURIComponent(key)}`;
  const hosts = [`${PRIMARY}?${query}`, `${FALLBACK}?${query}`];
  let lastStatus = 502;
  let lastBody = emptyBody();

  for (let i = 0; i < hosts.length; i += 1) {
    try {
      const result = await fetchOnce(hosts[i]);
      if (result.status === 429) {
        pauseUntil = Date.now() + PAUSE_429_MS;
        return {
          status: 200,
          body: cache.body || emptyBody(),
          cached: Boolean(cache.at),
          paused: true,
        };
      }
      if (result.status >= 500 && i === 0) {
        lastStatus = result.status;
        lastBody = result.body;
        continue;
      }
      if (!result.status || result.status >= 400) {
        lastStatus = result.status;
        lastBody = result.body;
        if (i === 0) continue;
        break;
      }
      const filtered = filterBody(result.body);
      cache = { at: Date.now(), status: 200, body: filtered };
      return { status: 200, body: filtered, cached: false };
    } catch (error) {
      lastStatus = 502;
      lastBody = JSON.stringify({
        success: 0,
        error: error instanceof Error ? error.message : 'BetsAPI inplay failed',
      });
    }
  }

  if (cache.at) {
    return { status: 200, body: cache.body, cached: true };
  }
  return { status: lastStatus || 502, body: lastBody, cached: false };
}

export async function getInplayResponse() {
  const now = Date.now();
  if (cache.at && now - cache.at < CACHE_TTL_MS) {
    return { status: 200, body: cache.body, cached: true };
  }
  if (now < pauseUntil) {
    return { status: 200, body: cache.body || emptyBody(), cached: true, paused: true };
  }
  if (inflight) return inflight;
  inflight = loadFromNetwork().finally(() => {
    inflight = null;
  });
  return inflight;
}
