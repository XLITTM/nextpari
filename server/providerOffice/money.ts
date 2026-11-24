import { ProviderOfficeError } from './errors.js';

const MONEY = /^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;

export function parseMinor(value: string): bigint {
  const trimmed = value.trim();
  if (!MONEY.test(trimmed)) throw new ProviderOfficeError('MONEY_INVALID');
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ''] = body.split('.');
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return negative ? -minor : minor;
}

export function formatMinor(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${(abs / 100n).toString()}.${frac}`;
}

/** Half away from zero. `bps` is out of 10_000. */
export function mulBps(minor: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new ProviderOfficeError('CONTRACT_TERMS_INVALID');
  }
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const rounded = (abs * BigInt(bps) + 5_000n) / 10_000n;
  return negative ? -rounded : rounded;
}

export function maxMinor(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}
