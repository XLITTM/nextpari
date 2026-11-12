import type { ProviderSource } from './types.js';

/** Structured keys keep opaque IDs with separators from colliding. */
export function identity(...parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !/\p{Cc}/u.test(value);
}

export function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validSource(source: ProviderSource): boolean {
  return isId(source.provider) && isId(source.namespace);
}

export function sourceKey(source: ProviderSource): string {
  return identity(source.provider, source.namespace);
}
