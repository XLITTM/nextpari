import {
  createSportsQuoteProviderRegistry,
} from './quoteProviderRegistry.js';
import type { SportsQuoteProvider } from './types.js';

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

const liveRegistry = createSportsQuoteProviderRegistry([]);

/**
 * Live quote source for the generic place path.
 * Legacy BetsAPI / LSports identities are retired from this registry.
 * Missing/blank and unknown ids fail closed.
 */
export function resolveSportsQuoteProvider(providerId?: string): SportsQuoteProvider {
  return liveRegistry.resolve(providerId);
}
