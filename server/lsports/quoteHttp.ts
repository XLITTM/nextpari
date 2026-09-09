export function readLsportsFeedBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.LSPORTS_FEED_BASE_URL ?? env.VITE_LSPORTS_FEED_BASE_URL ?? '')
    .trim()
    .replace(/\/$/, '');
}

export function lsportsQuoteUrl(
  env: NodeJS.ProcessEnv = process.env,
  query: {
    fixtureId: string;
    marketId?: string;
    marketKey?: string;
    line?: string;
    outcomeId: string;
    feedType?: string;
  },
): string {
  const base = readLsportsFeedBaseUrl(env);
  if (!base) throw new Error('LSPORTS_FEED_BASE_URL_REQUIRED');
  const params = new URLSearchParams();
  params.set('fixtureId', query.fixtureId);
  params.set('betId', query.outcomeId);
  if (query.marketId) params.set('marketId', query.marketId);
  if (query.marketKey) params.set('marketKey', query.marketKey);
  if (query.line) params.set('line', query.line);
  params.set('feedType', query.feedType === 'prematch' ? 'prematch' : 'inplay');
  return `${base}/quote?${params.toString()}`;
}

export async function fetchLsportsCanonicalQuote(
  query: {
    fixtureId: string;
    marketId?: string;
    marketKey?: string;
    line?: string;
    outcomeId: string;
    feedType?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchImpl(lsportsQuoteUrl(env, query), {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`lsports-quote-http-${response.status}`);
  }
  return response.json();
}
