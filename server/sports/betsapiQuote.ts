import { BetsApiReadOnlyClient, type BetsApiReadOnlyClientOptions } from '../betsapi/client.js';
import type { NormalizedEvent, NormalizedMarket } from '../betsapi/types.js';
import type { SportsQuote, SportsQuoteProvider, SportsQuoteRequest } from './types.js';

const SUPPORTED = new Set(['1x2', 'over_under', 'asian_handicap']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function missingQuote(request: SportsQuoteRequest, health: SportsQuote['health'] = 'UNKNOWN'): SportsQuote {
  return {
    provider: 'betsapi',
    feedType: request.feedType === 'prematch' ? 'prematch' : 'inplay',
    fixtureId: text(request.fixtureId),
    marketId: text(request.marketId),
    marketKey: text(request.marketKey),
    line: text(request.line),
    outcomeId: text(request.outcomeId),
    outcomeName: '',
    price: null,
    status: 'missing',
    selectable: false,
    updatedAt: null,
    health,
    heartbeatAgeMs: null,
  };
}

function findMarket(event: NormalizedEvent, request: SportsQuoteRequest): NormalizedMarket | null {
  const key = text(request.marketKey);
  const line = text(request.line);
  const id = text(request.marketId);
  return event.markets.find((market) => {
    if (!SUPPORTED.has(market.key) || market.key !== key) return false;
    if (text(market.line ?? '') !== line) return false;
    if (id && id !== marketKeyId(market.key)) return false;
    return true;
  }) ?? null;
}

export function marketKeyId(key: string): string {
  if (key === '1x2') return '1_1';
  if (key === 'asian_handicap') return '1_2';
  if (key === 'over_under') return '1_3';
  return '';
}

export function quoteFromFootballEvent(
  event: NormalizedEvent | null,
  request: SportsQuoteRequest,
  now: number,
  fetchedAt: string | null,
  stale: boolean,
): SportsQuote {
  if (!event) return missingQuote(request, stale ? 'STALE' : 'UNKNOWN');
  const fetched = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
  const age = Number.isFinite(fetched) ? Math.max(0, now - fetched) : null;
  const health: SportsQuote['health'] = stale ? 'STALE' : 'HEALTHY';
  const market = findMarket(event, request);
  const feedType = event.status === 'live' ? 'inplay' : 'prematch';
  const base: SportsQuote = {
    provider: 'betsapi',
    feedType: request.feedType === 'prematch' || request.feedType === 'inplay' ? request.feedType : feedType,
    fixtureId: event.eventId,
    marketId: marketKeyId(text(request.marketKey)),
    marketKey: text(request.marketKey),
    line: text(request.line),
    outcomeId: text(request.outcomeId),
    outcomeName: '',
    price: null,
    status: 'missing',
    selectable: false,
    updatedAt: event.updatedAt,
    health,
    heartbeatAgeMs: age,
  };
  if (event.status === 'finished') return { ...base, status: 'settled' };
  if (event.status === 'closed' || !market || market.status !== 'open') {
    return { ...base, status: 'suspended', marketStatus: 'closed' };
  }
  const outcome = market.outcomes.find((item) => item.key === text(request.outcomeId));
  if (!outcome || !(outcome.price > 1)) {
    return { ...base, status: 'suspended', updatedAt: market.updatedAt, marketStatus: 'closed' };
  }
  return {
    ...base,
    outcomeName: outcome.name,
    price: outcome.price,
    status: 'open',
    selectable: true,
    updatedAt: market.updatedAt ?? event.updatedAt,
    marketStatus: 'open',
    betStatus: 'open',
  };
}

export function createBetsapiQuoteProvider(
  options: BetsApiReadOnlyClientOptions = {},
): SportsQuoteProvider {
  const client = new BetsApiReadOnlyClient(options);
  const now = options.now ?? (() => Date.now());
  return {
    id: 'betsapi',
    async getQuote(request) {
      const eventId = text(request.fixtureId);
      if (!/^\d{1,20}$/.test(eventId)) return missingQuote(request);
      const result = await client.getEvent(eventId);
      const event = result.feed?.events[0] ?? null;
      return quoteFromFootballEvent(
        event,
        request,
        now(),
        result.feed?.fetchedAt ?? null,
        Boolean(result.feed?.stale || result.feed?.rateLimited || !result.ok),
      );
    },
  };
}
