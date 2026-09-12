import type { SportsQuoteProvider } from './types.js';

export const SPORTS_PROVIDER_UNSUPPORTED = 'SPORTS_PROVIDER_UNSUPPORTED';

export class SportsProviderUnsupportedError extends Error {
  readonly code = SPORTS_PROVIDER_UNSUPPORTED;

  constructor() {
    super(SPORTS_PROVIDER_UNSUPPORTED);
    this.name = 'SportsProviderUnsupportedError';
  }
}

export class SportsProviderRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SportsProviderRegistrationError';
  }
}

export function normalizeSportsProviderId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export type SportsQuoteProviderFactory = () => SportsQuoteProvider;

export interface SportsQuoteProviderRegistration {
  id: string;
  create: SportsQuoteProviderFactory;
}

export interface SportsQuoteProviderRegistry {
  resolve(providerId?: string): SportsQuoteProvider;
  has(providerId?: string): boolean;
  ids(): string[];
}

export function createSportsQuoteProviderRegistry(
  registrations: readonly SportsQuoteProviderRegistration[],
): SportsQuoteProviderRegistry {
  const factories = new Map<string, SportsQuoteProviderFactory>();

  for (const registration of registrations) {
    const id = normalizeSportsProviderId(registration.id);
    if (!id) {
      throw new SportsProviderRegistrationError('SPORTS_PROVIDER_REGISTRATION_ID_REQUIRED');
    }
    if (factories.has(id)) {
      throw new SportsProviderRegistrationError(`SPORTS_PROVIDER_REGISTRATION_DUPLICATE:${id}`);
    }
    if (typeof registration.create !== 'function') {
      throw new SportsProviderRegistrationError(`SPORTS_PROVIDER_REGISTRATION_FACTORY_REQUIRED:${id}`);
    }
    factories.set(id, registration.create);
  }

  return {
    resolve(providerId) {
      const id = normalizeSportsProviderId(providerId);
      if (!id) throw new SportsProviderUnsupportedError();
      const create = factories.get(id);
      if (!create) throw new SportsProviderUnsupportedError();
      const provider = create();
      const createdId = normalizeSportsProviderId(provider?.id);
      if (createdId !== id) {
        throw new SportsProviderRegistrationError(
          `SPORTS_PROVIDER_REGISTRATION_ID_MISMATCH:${id}:${createdId}`,
        );
      }
      return provider;
    },
    has(providerId) {
      const id = normalizeSportsProviderId(providerId);
      return Boolean(id) && factories.has(id);
    },
    ids() {
      return [...factories.keys()];
    },
  };
}
