/** Signed Int64 exclusive of the sign bit overflow: 0 .. 9223372036854775807. */
export const PROVIDER_INT64_MAX = 9223372036854775807n;
const CANONICAL_DIGITS_RE = /^(0|[1-9]\d*)$/;

function asCanonicalDigits(raw: string): string {
  if (!CANONICAL_DIGITS_RE.test(raw)) throw new Error('TRANSACTION_ID_INVALID');
  if (/[eE.]/.test(raw)) throw new Error('TRANSACTION_ID_INVALID');
  const value = BigInt(raw);
  if (value < 0n || value > PROVIDER_INT64_MAX) throw new Error('TRANSACTION_ID_INVALID');
  return raw;
}

/**
 * Canonical BetConstruct Long/Int64 identity.
 * Unsafe JS numbers are rejected; never round or coerce them.
 */
export function parseProviderInt64(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('TRANSACTION_ID_INVALID');
    return String(value);
  }
  if (typeof value === 'bigint') {
    if (value < 0n || value > PROVIDER_INT64_MAX) throw new Error('TRANSACTION_ID_INVALID');
    return value.toString(10);
  }
  if (typeof value === 'string') return asCanonicalDigits(value);
  throw new Error('TRANSACTION_ID_INVALID');
}

export function parseOptionalProviderInt64(value: unknown): string | null {
  if (value == null || value === '') return null;
  return parseProviderInt64(value);
}
