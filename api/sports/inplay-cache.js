import { getBetsApiGatewayToken } from '../betsapi/gateway.js';
import { ensureOddsList } from './odds-fallback.js';

const PRIMARY = 'https://api.b365api.com/v3/events/inplay';
const FALLBACK = 'https://api.betsapi.com/v3/events/inplay';
const CACHE_TTL_MS = 4_000;
const SPORT_TTL_MS = 24_000;
const PAUSE_429_MS = 30_000;
const CLOSED = new Set(['3', '4', '5', '8']);
const FALLBACK_TOKEN = '264390-ZTbtCqHFCvyhXS';
const SPORT_IDS = ['1', '13', '17', '18', '91'];

const sportCache = new Map();
let lastMergeAt = 0;
let lastBody = JSON.stringify({ success: 1, results: [] });
let pauseUntil = 0;
let inflight = null;
let rotateAt = 0;

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

function parsePayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function mergedBody() {
  const now = Date.now();
  const results = [];
  const seen = new Set();
  for (const sportId of SPORT_IDS) {
    const entry = sportCache.get(sportId);
    if (!entry || now - entry.at > SPORT_TTL_MS * 3) continue;
    for (const row of entry.results) {
      const id = String(row?.id ?? '');
      if (!id || seen.has(id) || !keepLive(row)) continue;
      seen.add(id);
      results.push(row);
    }
  }
  lastMergeAt = now;
  lastBody = JSON.stringify({ success: 1, results: ensureOddsList(results) });
  return lastBody;
}

async function fetchOnce(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.text();
  return { status: response.status, body };
}

function nextSportId() {
  const now = Date.now();
  let oldestId = SPORT_IDS[rotateAt % SPORT_IDS.length];
  let oldestAt = now;
  for (const sportId of SPORT_IDS) {
    const entry = sportCache.get(sportId);
    if (!entry) return sportId;
    if (entry.at < oldestAt) {
      oldestAt = entry.at;
      oldestId = sportId;
    }
  }
  rotateAt += 1;
  return oldestId;
}

async function loadFromNetwork() {
  const key = resolveToken();
  if (!key) {
    return { status: 500, body: JSON.stringify({ success: 0, error: 'BetsAPI token is missing', results: [] }), cached: false };
  }

  const sportId = nextSportId();
  const query = `token=${encodeURIComponent(key)}&sport_id=${encodeURIComponent(sportId)}`;
  const hosts = [`${PRIMARY}?${query}`, `${FALLBACK}?${query}`];

  for (let i = 0; i < hosts.length; i += 1) {
    try {
      const result = await fetchOnce(hosts[i]);
      if (result.status === 429) {
        pauseUntil = Date.now() + PAUSE_429_MS;
        return {
          status: 200,
          body: lastBody,
          cached: Boolean(lastMergeAt),
          paused: true,
        };
      }

      const json = parsePayload(result.body);
      const ok = result.status >= 200 && result.status < 400 && json && Number(json.success) === 1;
      if (!ok) {
        if (i === 0) continue;
        break;
      }

      const rows = Array.isArray(json.results) ? json.results.filter(keepLive) : [];
      sportCache.set(sportId, { at: Date.now(), results: rows });
      return { status: 200, body: mergedBody(), cached: false };
    } catch {
      if (i === 0) continue;
    }
  }

  if (lastMergeAt) {
    return { status: 200, body: lastBody, cached: true };
  }
  return {
    status: 502,
    body: JSON.stringify({ success: 0, error: 'BetsAPI inplay failed', results: [] }),
    cached: false,
  };
}

export async function getInplayResponse() {
  const now = Date.now();
  if (lastMergeAt && now - lastMergeAt < CACHE_TTL_MS) {
    return { status: 200, body: lastBody, cached: true };
  }
  if (now < pauseUntil) {
    return { status: 200, body: lastBody, cached: true, paused: true };
  }
  if (inflight) return inflight;
  inflight = loadFromNetwork().finally(() => {
    inflight = null;
  });
  return inflight;
}
