import { normalizeSportsProviderId } from './quoteProviderRegistry.js';

export const SPORTS_PROVIDER_RETIRED = 'SPORTS_PROVIDER_RETIRED';

const RETIRED_SPORTS_PROVIDERS = new Set([
  'lsports',
  'betsapi',
  'b365api',
  'b365',
]);

export function isRetiredSportsProvider(value: unknown): boolean {
  return RETIRED_SPORTS_PROVIDERS.has(normalizeSportsProviderId(value));
}
