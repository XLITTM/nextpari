import { ProviderOfficeError } from './errors.js';
import { formatMinor, parseMinor } from './money.js';

export type RateVerification = 'unverified' | 'verified';

export interface ContractExchangeRate {
  pair: string;
  /** USD received for 1 unit of the source currency. */
  rate: string;
  source: 'usdt-p2p';
  effectiveDate: string;
  status: RateVerification;
}

const RATE = /^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/;
const TMT_CODES = new Set(['TMT', 'TMTM']);

/**
 * TMT and the ledger code TMTM share the contractual TMT/USD rate.
 * A gaming or wallet rate is not accepted by this function.
 */
export function convertToUsd(amount: string, currency: string, rate: ContractExchangeRate | null): {
  usd: string;
  status: 'identity' | 'provisional' | 'final' | 'rate_required';
} {
  const minor = parseMinor(amount);
  const code = currency.trim().toUpperCase();
  if (code === 'USD') return { usd: formatMinor(minor), status: 'identity' };
  if (!TMT_CODES.has(code)) throw new ProviderOfficeError('CURRENCY_UNMAPPED');
  if (!rate || rate.pair !== 'TMT/USD' || rate.source !== 'usdt-p2p') {
    return { usd: '', status: 'rate_required' };
  }
  if (!RATE.test(rate.rate)) throw new ProviderOfficeError('EXCHANGE_RATE_INVALID');
  return {
    usd: formatMinor(applyRate(minor, rate.rate)),
    status: rate.status === 'verified' ? 'final' : 'provisional',
  };
}

export function applyRate(minor: bigint, rate: string): bigint {
  if (!RATE.test(rate)) throw new ProviderOfficeError('EXCHANGE_RATE_INVALID');
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const [whole, frac = ''] = rate.split('.');
  const scale = 10n ** BigInt(frac.length);
  const numerator = BigInt(whole) * scale + BigInt(frac === '' ? '0' : frac);
  const product = abs * numerator;
  const rounded = (product + scale / 2n) / scale;
  return negative ? -rounded : rounded;
}

export interface ClosedSnapshot {
  providerId: string;
  brandCode: string;
  periodStart: string;
  periodEnd: string;
  rate: string;
  rateStatus: 'verified';
  usdGgr: string;
  totalMonthlyFee: string;
}

export function snapshotKey(snapshot: Pick<ClosedSnapshot, 'providerId' | 'brandCode' | 'periodStart' | 'periodEnd'>): string {
  return [snapshot.providerId, snapshot.brandCode, snapshot.periodStart, snapshot.periodEnd].join('|');
}

export function rememberSnapshot(store: Map<string, ClosedSnapshot>, snapshot: ClosedSnapshot): ClosedSnapshot {
  const key = snapshotKey(snapshot);
  const existing = store.get(key);
  if (!existing) {
    store.set(key, snapshot);
    return snapshot;
  }
  if (existing.rate !== snapshot.rate || existing.usdGgr !== snapshot.usdGgr || existing.totalMonthlyFee !== snapshot.totalMonthlyFee) {
    throw new ProviderOfficeError('SNAPSHOT_CLOSED');
  }
  return existing;
}
