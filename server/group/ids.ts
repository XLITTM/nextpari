import { GroupControlError } from './errors.js';

/** Matches the NextPari display width. Values above this are emitted in full. */
export const LEGACY_PUBLIC_ID_WIDTH = 6;

/** Bigint ceiling. Longer than six digits, still bounded so a bug cannot loop forever. */
export const GLOBAL_PUBLIC_ID_MAX = 10n ** 18n - 1n;

const PUBLIC_ID_RE = /^[0-9]{1,18}$/;

export function assertPublicId(value: string): string {
  const id = value.trim();
  if (!PUBLIC_ID_RE.test(id)) throw new GroupControlError('PUBLIC_ID_INVALID');
  if (BigInt(id) <= 0n) throw new GroupControlError('PUBLIC_ID_INVALID');
  return id;
}

export function publicIdNumeric(value: string): bigint {
  return BigInt(assertPublicId(value));
}

export function formatGlobalPlayerId(value: bigint): string {
  if (value <= 0n || value > GLOBAL_PUBLIC_ID_MAX) {
    throw new GroupControlError('PUBLIC_ID_SPACE_EXHAUSTED');
  }
  const raw = value.toString();
  if (value <= 999999n) return raw.padStart(LEGACY_PUBLIC_ID_WIDTH, '0');
  return raw;
}

export interface LegacyIdSources {
  profiles: readonly (string | null | undefined)[];
  wallets: readonly (string | null | undefined)[];
  appUsers: readonly (string | null | undefined)[];
}

/**
 * Union of every public ID the read-only export found.
 * Wallet-only IDs are included. Blank values are skipped.
 * The result is not a fixed production count.
 */
export function collectLegacyPublicIds(sources: LegacyIdSources): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const list of [sources.profiles, sources.wallets, sources.appUsers]) {
    for (const raw of list) {
      if (raw == null || String(raw).trim() === '') continue;
      const id = assertPublicId(String(raw));
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export interface LoginContract {
  minDigits: number;
  maxDigits: number;
}

/** NextPari login today accepts exactly six digits. */
export const NEXTPARI_LOGIN_TODAY: LoginContract = { minDigits: 6, maxDigits: 6 };

export function loginAcceptsPublicId(publicId: string, contract: LoginContract): boolean {
  const id = assertPublicId(publicId);
  return id.length >= contract.minDigits && id.length <= contract.maxDigits;
}

/**
 * Floor for the group counter after a read-only import.
 * Never returns a value below the production counter, and never writes that counter.
 */
export function planGroupCounter(input: {
  productionNextValue: number;
  legacyPublicIds: readonly string[];
}): bigint {
  if (!Number.isInteger(input.productionNextValue) || input.productionNextValue < 1) {
    throw new GroupControlError('PRODUCTION_COUNTER_INVALID');
  }
  let maxLegacy = 0n;
  for (const id of input.legacyPublicIds) {
    const numeric = publicIdNumeric(id);
    if (numeric > maxLegacy) maxLegacy = numeric;
  }
  const production = BigInt(input.productionNextValue);
  const afterLegacy = maxLegacy + 1n;
  return production > afterLegacy ? production : afterLegacy;
}
