import { createLsportsHttpQuoteProvider } from './lsportsQuote.js';
import { SPORTS_PROVIDER_LSPORTS, type SportsQuoteProvider } from './types.js';

export const SPORTS_PROVIDER_UNSUPPORTED = 'SPORTS_PROVIDER_UNSUPPORTED';

export class SportsProviderUnsupportedError extends Error {
  readonly code = SPORTS_PROVIDER_UNSUPPORTED;

  constructor() {
    super(SPORTS_PROVIDER_UNSUPPORTED);
    this.name = 'SportsProviderUnsupportedError';
  }
}

export function normalizeSportsProviderId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Live quote source for the generic place path.
 * Missing/blank ids fail closed. Explicit lsports uses the LSports adapter.
 * Any other explicit id without a registered adapter fails closed.
 */
export function resolveSportsQuoteProvider(providerId?: string): SportsQuoteProvider {
  const id = normalizeSportsProviderId(providerId);
  if (!id) {
    throw new SportsProviderUnsupportedError();
  }
  if (id === SPORTS_PROVIDER_LSPORTS) {
    return createLsportsHttpQuoteProvider();
  }
  throw new SportsProviderUnsupportedError();
}
