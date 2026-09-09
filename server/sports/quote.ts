import type {
  SportsQuote,
  SportsQuoteDecision,
  SportsQuoteDecisionOptions,
  SportsQuoteRequest,
} from './types.js';

export function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function pricesEqual(left: number, right: number): boolean {
  return roundPrice(left) === roundPrice(right);
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function identityFieldMismatch(requestValue: unknown, quoteValue: unknown): boolean {
  const requested = text(requestValue);
  const quoted = text(quoteValue);
  if (!requested && !quoted) return false;
  return requested !== quoted;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function readSportsQuote(value: unknown): SportsQuote {
  const row = asRecord(value);
  const health = row.health === 'HEALTHY' || row.health === 'STALE' || row.health === 'UNKNOWN'
    ? row.health
    : 'UNKNOWN';
  const status = row.status === 'open' || row.status === 'suspended' || row.status === 'settled'
    ? row.status
    : 'missing';
  const priceRaw = row.price;
  const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : Number(priceRaw);
  const provider = text(row.provider).toLowerCase();
  const marketStatus = row.marketStatus == null ? undefined : String(row.marketStatus);
  const betStatus = row.betStatus == null ? undefined : String(row.betStatus);
  const betStatusId = row.betStatusId == null ? undefined : String(row.betStatusId);
  return {
    provider,
    feedType: row.feedType === 'prematch' ? 'prematch' : 'inplay',
    fixtureId: String(row.fixtureId ?? ''),
    marketId: String(row.marketId ?? ''),
    marketKey: String(row.marketKey ?? ''),
    line: String(row.line ?? ''),
    outcomeId: String(row.outcomeId ?? row.betId ?? ''),
    outcomeName: String(row.outcomeName ?? ''),
    price: Number.isFinite(price) && price > 1 ? price : null,
    status,
    selectable: row.selectable === true,
    updatedAt: row.updatedAt == null ? null : String(row.updatedAt),
    health,
    heartbeatAgeMs: row.heartbeatAgeMs == null ? null : Number(row.heartbeatAgeMs),
    ...(marketStatus === undefined ? {} : { marketStatus }),
    ...(betStatus === undefined ? {} : { betStatus }),
    ...(betStatusId === undefined ? {} : { betStatusId }),
  };
}

export function decideSportsQuote(
  request: SportsQuoteRequest,
  quote: SportsQuote,
  options: SportsQuoteDecisionOptions = { bettingEnabled: true },
): SportsQuoteDecision {
  if (!options.bettingEnabled) {
    return { ok: false, reason: 'SPORTS_BET_DISABLED', quote };
  }
  const fixtureId = text(request.fixtureId);
  const outcomeId = text(request.outcomeId);
  if (!fixtureId) return { ok: false, reason: 'MISSING_FIXTURE', quote };
  if (!outcomeId) return { ok: false, reason: 'MISSING_BET_ID', quote };

  const requestedProvider = text(request.provider).toLowerCase();
  if (requestedProvider && requestedProvider !== text(quote.provider).toLowerCase()) {
    return { ok: false, reason: 'EVENT_UNAVAILABLE', quote };
  }

  if (quote.health !== 'HEALTHY') {
    return { ok: false, reason: 'FEED_STALE', quote };
  }
  if (options.maxHeartbeatAgeMs != null) {
    const age = quote.heartbeatAgeMs;
    if (age == null || !Number.isFinite(age) || age > options.maxHeartbeatAgeMs) {
      return { ok: false, reason: 'FEED_STALE', quote };
    }
  }

  if (
    quote.status === 'missing'
    || identityFieldMismatch(fixtureId, quote.fixtureId)
    || identityFieldMismatch(request.marketId, quote.marketId)
    || identityFieldMismatch(request.marketKey, quote.marketKey)
    || identityFieldMismatch(request.line, quote.line)
  ) {
    return { ok: false, reason: 'EVENT_UNAVAILABLE', quote };
  }
  if (identityFieldMismatch(outcomeId, quote.outcomeId)) {
    return { ok: false, reason: 'MISSING_BET_ID', quote };
  }

  if (quote.status === 'suspended' || !quote.selectable) {
    return { ok: false, reason: 'MARKET_SUSPENDED', quote };
  }

  if (quote.price == null || !Number.isFinite(quote.price) || quote.price <= 1) {
    return { ok: false, reason: 'INVALID_PRICE', quote, currentPrice: quote.price };
  }

  const requested = Number(request.price);
  if (Number.isFinite(requested) && requested > 1 && !pricesEqual(requested, quote.price)) {
    return {
      ok: false,
      reason: 'ODDS_CHANGED',
      quote,
      currentPrice: quote.price,
    };
  }

  return { ok: true, quote };
}
