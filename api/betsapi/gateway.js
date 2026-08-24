const PRIMARY_HOST = 'https://api.b365api.com';
const FALLBACK_HOST = 'https://api.betsapi.com';
export const BETSAPI_CACHE_TTL_MS = 10_000;
const MIN_REQUEST_GAP_MS = 12_000;
const BACKOFF_START_MS = 60_000;
const BACKOFF_MAX_MS = 300_000;

const cache = new Map();
let networkChain = Promise.resolve();
let nextNetworkAt = 0;
let backoffUntil = 0;
let backoffMs = BACKOFF_START_MS;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getBetsApiGatewayToken() {
  const env = globalThis.process?.env ?? {};
  return (
    env.BETSAPI_KEY ||
    env.BETSAPI_TOKEN ||
    env.VITE_BETSAPI_KEY ||
    env.VITE_BETSAPI_TOKEN ||
    ''
  );
}

function cacheKey(path, search) {
  const params = new URLSearchParams(search);
  params.delete('token');
  params.sort();
  return `${path}?${params.toString()}`;
}

function pruneCache(now) {
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}

function isRetryableStatus(status) {
  return status >= 500 && status <= 599;
}

async function scheduledFetch(url, signal) {
  const run = networkChain.then(async () => {
    const wait = Math.max(0, Math.max(nextNetworkAt, backoffUntil) - Date.now());
    if (wait > 0) await sleep(wait);
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const pause = Math.max(
          BACKOFF_START_MS,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs,
        );
        backoffMs = Math.min(Math.max(pause, backoffMs) * 2, BACKOFF_MAX_MS);
        backoffUntil = Date.now() + pause;
      } else if (response.ok) {
        backoffMs = BACKOFF_START_MS;
      }
      return response;
    } finally {
      nextNetworkAt = Date.now() + MIN_REQUEST_GAP_MS;
    }
  });
  networkChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * @param {string} path
 * @param {URLSearchParams | Record<string, string>} search
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ status: number, body: string, contentType: string, cached: boolean }>}
 */
export async function fetchBetsApi(path, search = {}, signal) {
  const token = getBetsApiGatewayToken();
  if (!token) {
    return {
      status: 500,
      body: JSON.stringify({ success: 0, error: 'BetsAPI token is missing' }),
      contentType: 'application/json',
      cached: false,
    };
  }

  const suffix = `/${String(path || '').replace(/^\/+/, '')}`;
  const params = search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(search);
  params.delete('token');
  params.set('token', token);

  const now = Date.now();
  pruneCache(now);
  const key = cacheKey(suffix, params);
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    return { ...hit.response, cached: true };
  }

  const hosts = [PRIMARY_HOST, FALLBACK_HOST];
  let lastError = 'BetsAPI request failed';
  let lastStatus = 502;

  for (let i = 0; i < hosts.length; i += 1) {
    const url = `${hosts[i]}${suffix}?${params.toString()}`;
    try {
      const response = await scheduledFetch(url, signal);
      const body = await response.text();
      if (response.status === 429) {
        lastStatus = 429;
        lastError = 'TOO_MANY_REQUESTS';
        const result = {
          status: 429,
          body,
          contentType: response.headers.get('content-type') || 'application/json',
          cached: false,
        };
        const pause = Math.max(0, backoffUntil - Date.now()) || BACKOFF_START_MS;
        cache.set(key, { expires: Date.now() + pause, response: { ...result, cached: false } });
        return result;
      }
      if (isRetryableStatus(response.status) && i < hosts.length - 1) {
        lastStatus = response.status;
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const result = {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') || 'application/json',
        cached: false,
      };
      if (response.ok) {
        cache.set(key, { expires: Date.now() + BETSAPI_CACHE_TTL_MS, response: { ...result, cached: false } });
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error instanceof Error ? error.message : String(error);
      lastStatus = 502;
    }
  }

  return {
    status: lastStatus,
    body: JSON.stringify({ success: 0, error: lastError }),
    contentType: 'application/json',
    cached: false,
  };
}
