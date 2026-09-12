import { createLsportsHttpQuoteProvider } from './lsportsQuote.js';
import {
  createSportsQuoteProviderRegistry,
} from './quoteProviderRegistry.js';
import { SPORTS_PROVIDER_LSPORTS, type SportsQuoteProvider } from './types.js';

export {
  createSportsQuoteProviderRegistry,
  normalizeSportsProviderId,
  SportsProviderRegistrationError,
  SportsProviderUnsupportedError,
  SPORTS_PROVIDER_UNSUPPORTED,
} from './quoteProviderRegistry.js';
export type {
  SportsQuoteProviderFactory,
  SportsQuoteProviderRegistration,
  SportsQuoteProviderRegistry,
} from './quoteProviderRegistry.js';

const liveRegistry = createSportsQuoteProviderRegistry([
  {
    id: SPORTS_PROVIDER_LSPORTS,
    create: () => createLsportsHttpQuoteProvider(),
  },
]);

/**
 * Live quote source for the generic place path.
 * Delegates to the composed registry. Missing/blank and unknown ids fail closed.
 */
export function resolveSportsQuoteProvider(providerId?: string): SportsQuoteProvider {
  return liveRegistry.resolve(providerId);
}
