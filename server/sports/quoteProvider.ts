import { isBetsapiQuoteEnabled } from './betsapiActivation.js';
import { createBetsapiQuoteProvider } from './betsapiQuote.js';
import {
  createSportsQuoteProviderRegistry,
  normalizeSportsProviderId,
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
export function resolveSportsQuoteProvider(
  providerId?: string,
  env: NodeJS.ProcessEnv = process.env,
): SportsQuoteProvider {
  if (normalizeSportsProviderId(providerId) === 'betsapi' && isBetsapiQuoteEnabled(env)) {
    return createBetsapiQuoteProvider({ env });
  }
  return liveRegistry.resolve(providerId);
}
