import type { SportsQuote } from './types.js';

export interface SportsChangedLeg {
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
  currentPrice: number | null;
}

export function sanitizeChangedLeg(
  quote: SportsQuote,
  currentPrice?: number | null,
): SportsChangedLeg {
  const price = currentPrice ?? quote.price ?? null;
  return {
    fixtureId: String(quote.fixtureId ?? '').trim(),
    marketId: String(quote.marketId ?? '').trim(),
    marketKey: String(quote.marketKey ?? '').trim(),
    line: String(quote.line ?? ''),
    outcomeId: String(quote.outcomeId ?? '').trim(),
    currentPrice: typeof price === 'number' && Number.isFinite(price) ? price : null,
  };
}
