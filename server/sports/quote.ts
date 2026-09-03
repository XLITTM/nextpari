import { parseCanonicalMarketKey } from '../lsports/state/keys.js';
import { LSPORTS_HEARTBEAT_STALE_MS } from '../lsports/state/types.js';
import type { SportsQuote, SportsQuoteDecision, SportsQuoteRequest } from './types.js';

export function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function pricesEqual(left: number, right: number): boolean {
  return roundPrice(left) === roundPrice(right);
}

function isLsportsQuoteRequest(request: SportsQuoteRequest): boolean {
  const provider = String(request.provider ?? 'lsports').trim().toLowerCase();
  return provider === '' || provider === 'lsports';
}

function lsportsIdentityMismatch(request: SportsQuoteRequest, quote: SportsQuote): boolean {
  const marketId = String(request.marketId ?? '').trim();
  const marketKey = String(request.marketKey ?? '').trim();
  const parsed = parseCanonicalMarketKey(marketKey);
  if (!marketId || !parsed) return true;
  if (parsed.fixtureId !== String(request.fixtureId ?? '').trim()) return true;
  if (parsed.marketId !== marketId) return true;
  if (String(quote.fixtureId) !== parsed.fixtureId) return true;
  if (String(quote.marketId) !== marketId) return true;
  if (String(quote.marketKey) !== marketKey) return true;
  const storeLine = String(quote.line ?? '');
  const requestedLine = String(request.line ?? '').trim();
  if (storeLine) return requestedLine !== storeLine || parsed.line !== storeLine;
  return Boolean(requestedLine) || parsed.line !== '';
}

export function decideSportsQuote(
  request: SportsQuoteRequest,
  quote: SportsQuote,
  options: { bettingEnabled: boolean; now?: number } = { bettingEnabled: true },
): SportsQuoteDecision {
  if (!options.bettingEnabled) {
    return { ok: false, reason: 'SPORTS_BET_DISABLED', quote };
  }
  const fixtureId = String(request.fixtureId ?? '').trim();
  const outcomeId = String(request.outcomeId ?? '').trim();
  if (!fixtureId) return { ok: false, reason: 'MISSING_FIXTURE', quote };
  if (!outcomeId) return { ok: false, reason: 'MISSING_BET_ID', quote };

  const heartbeatAge = quote.heartbeatAgeMs;
  const stale = quote.health !== 'HEALTHY'
    || heartbeatAge == null
    || heartbeatAge > LSPORTS_HEARTBEAT_STALE_MS;
  if (stale) return { ok: false, reason: 'FEED_STALE', quote };

  if (isLsportsQuoteRequest(request) && lsportsIdentityMismatch(request, quote)) {
    return { ok: false, reason: 'EVENT_UNAVAILABLE', quote };
  }

  if (quote.status === 'missing' || String(quote.fixtureId) !== fixtureId) {
    return { ok: false, reason: 'EVENT_UNAVAILABLE', quote };
  }
  if (String(quote.outcomeId) !== outcomeId) {
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
