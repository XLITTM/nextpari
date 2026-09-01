import { getBetsApiGatewayToken } from '../betsapi/gateway.js';
import { ensureOddsList } from './odds-fallback.js';

const PRIMARY = 'https://api.b365api.com';
const FALLBACK = 'https://api.betsapi.com';
const SPORT_ID = '1';
const CLOSED = new Set(['3', '4', '5', '8']);
const PAUSE_429_MS = 30_000;
const TTL = { inplay: 4_000, upcoming: 20_000 };

const cache = {
  inplay: { at: 0, body: JSON.stringify({ success: 1, results: [] }), pauseUntil: 0, inflight: null },
  upcoming: { at: 0, body: JSON.stringify({ success: 1, results: [] }), pauseUntil: 0, inflight: null },
};

function resolveToken() {
  return getBetsApiGatewayToken();
}

function parsePayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function timeStatusOf(row) {
  return String(row?.time_status ?? '').trim();
}

function keepInplay(row) {
  const status = timeStatusOf(row);
  if (CLOSED.has(status)) return false;
  return status === '1';
}

function keepUpcoming(row) {
  const status = timeStatusOf(row);
  if (CLOSED.has(status)) return false;
  return status === '0' || status === '';
}

function normalizeUpcoming(row) {
  return { ...row, time_status: timeStatusOf(row) || '0' };
}

function catalogUrls(type, token) {
  const path = type === 'upcoming' ? 'events/upcoming' : 'events/inplay';
  const query = `token=${encodeURIComponent(token)}&sport_id=${SPORT_ID}`;
  return [
    `${PRIMARY}/v1/${path}?${query}`,
    `${FALLBACK}/v1/${path}?${query}`,
    `${PRIMARY}/v3/${path}?${query}`,
    `${FALLBACK}/v3/${path}?${query}`,
  ];
}

async function fetchOnce(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.text();
  return { status: response.status, body };
}

function pack(results) {
  return JSON.stringify({ success: 1, results: ensureOddsList(results) });
}

async function loadType(type) {
  const slot = cache[type];
  const token = resolveToken();
  if (!token) {
    slot.body = pack([]);
    return { status: 200, body: slot.body, cached: false };
  }

  const keep = type === 'upcoming' ? keepUpcoming : keepInplay;
  const urls = catalogUrls(type, token);

  for (let i = 0; i < urls.length; i += 1) {
    try {
      const result = await fetchOnce(urls[i]);
      if (result.status === 429) {
        slot.pauseUntil = Date.now() + PAUSE_429_MS;
        return { status: 200, body: slot.body, cached: Boolean(slot.at), paused: true };
      }

      const json = parsePayload(result.body);
      const ok = result.status >= 200 && result.status < 400 && json && Number(json.success) === 1;
      if (!ok) continue;

      let rows = Array.isArray(json.results) ? json.results.filter(keep) : [];
      if (type === 'upcoming') rows = rows.map(normalizeUpcoming);
      if (!rows.length && i < urls.length - 1) continue;

      slot.at = Date.now();
      slot.body = pack(rows);
      return { status: 200, body: slot.body, cached: false };
    } catch {
      continue;
    }
  }

  if (type === 'inplay') {
    try {
      const { getInplayResponse } = await import('./inplay-cache.js');
      const fallback = await getInplayResponse();
      const json = parsePayload(fallback.body);
      const rows = Array.isArray(json?.results) ? json.results.filter(keepInplay) : [];
      if (rows.length) {
        slot.at = Date.now();
        slot.body = pack(rows);
        return { status: 200, body: slot.body, cached: Boolean(fallback.cached) };
      }
    } catch {
      // keep last body
    }
  }

  if (slot.at) {
    return { status: 200, body: slot.body, cached: true };
  }

  slot.body = pack([]);
  return { status: 200, body: slot.body, cached: false };
}

export function catalogTypeOf(value) {
  const type = String(value ?? '').trim().toLowerCase();
  if (type === 'upcoming' || type === 'line' || type === 'prematch') return 'upcoming';
  return 'inplay';
}

export async function getCatalogResponse(rawType) {
  const type = catalogTypeOf(rawType);
  const slot = cache[type];
  const now = Date.now();
  if (slot.at && now - slot.at < TTL[type]) {
    return { status: 200, body: slot.body, cached: true };
  }
  if (now < slot.pauseUntil) {
    return { status: 200, body: slot.body, cached: true, paused: true };
  }
  if (slot.inflight) return slot.inflight;
  slot.inflight = loadType(type).finally(() => {
    slot.inflight = null;
  });
  return slot.inflight;
}
