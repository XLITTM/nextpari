import type {
  CanonicalProviderEvent,
  GgrBucket,
  ProviderLedgerRow,
  ProviderProduct,
  ProviderTxKind,
  SettlementPeriod,
} from './types.js';

export function money2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeProviderKey(value: string): string {
  const key = String(value ?? '').trim().toLowerCase();
  if (key.length < 1 || key.length > 64) {
    throw new Error('PROVIDER_KEY_INVALID');
  }
  return key;
}

export function normalizeCurrency(value: string): string {
  const currency = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) {
    throw new Error('PROVIDER_CURRENCY_INVALID');
  }
  return currency;
}

export function utcMonthBounds(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

export function utcInclusiveDateRange(fromDate: string, toDate: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error('PERIOD_INVALID');
  }
  if (toDate < fromDate) throw new Error('PERIOD_INVALID');
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${toDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, end: endExclusive };
}

export function inUtcHalfOpen(at: Date, start: Date, end: Date): boolean {
  return at >= start && at < end;
}

function assertProductKind(product: ProviderProduct, kind: ProviderTxKind): void {
  if (product === 'sports' && (kind === 'bet' || kind === 'win')) {
    throw new Error('PROVIDER_KIND_INVALID');
  }
  if (product === 'casino' && (kind === 'stake' || kind === 'payout')) {
    throw new Error('PROVIDER_KIND_INVALID');
  }
}

export function economicEffectFor(
  event: Pick<CanonicalProviderEvent, 'kind' | 'amount' | 'product'>,
  related?: Pick<ProviderLedgerRow, 'economicEffect' | 'kind' | 'product' | 'currency'> | null,
  currency?: string,
): number {
  assertProductKind(event.product, event.kind);
  const amount = money2(event.amount);
  if (!(amount > 0)) throw new Error('PROVIDER_AMOUNT_INVALID');
  if (event.kind === 'stake' || event.kind === 'bet') return amount;
  if (event.kind === 'payout' || event.kind === 'win') return money2(-amount);
  if (!related) throw new Error('PROVIDER_RELATED_TRANSACTION_NOT_FOUND');
  if (related.kind === 'refund' || related.kind === 'void' || related.kind === 'rollback') {
    throw new Error('PROVIDER_RELATED_KIND_INVALID');
  }
  if (related.product !== event.product) throw new Error('PROVIDER_PRODUCT_MISMATCH');
  if (currency && related.currency !== currency) throw new Error('PROVIDER_CURRENCY_MISMATCH');
  return money2(-related.economicEffect);
}

export function emptyBucket(currency: string): GgrBucket {
  return {
    currency,
    stakeTotal: 0,
    payoutTotal: 0,
    refundTotal: 0,
    voidTotal: 0,
    rollbackTotal: 0,
    internalGgr: 0,
  };
}

export function addToBucket(bucket: GgrBucket, row: ProviderLedgerRow): void {
  if (row.kind === 'stake' || row.kind === 'bet') bucket.stakeTotal = money2(bucket.stakeTotal + row.amount);
  if (row.kind === 'payout' || row.kind === 'win') bucket.payoutTotal = money2(bucket.payoutTotal + row.amount);
  if (row.kind === 'refund') bucket.refundTotal = money2(bucket.refundTotal + row.amount);
  if (row.kind === 'void') bucket.voidTotal = money2(bucket.voidTotal + row.amount);
  if (row.kind === 'rollback') bucket.rollbackTotal = money2(bucket.rollbackTotal + row.amount);
  bucket.internalGgr = money2(bucket.internalGgr + row.economicEffect);
}

export function aggregateGgrByCurrency(rows: ProviderLedgerRow[]): GgrBucket[] {
  const byCurrency = new Map<string, GgrBucket>();
  for (const row of rows) {
    let bucket = byCurrency.get(row.currency);
    if (!bucket) {
      bucket = emptyBucket(row.currency);
      byCurrency.set(row.currency, bucket);
    }
    addToBucket(bucket, row);
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function periodKey(input: {
  providerKey: string;
  product: ProviderProduct;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}): string {
  return [
    input.providerKey,
    input.product,
    input.currency,
    input.periodStart.toISOString(),
    input.periodEnd.toISOString(),
  ].join('|');
}

export function totalsFromRows(rows: ProviderLedgerRow[]): Omit<
  SettlementPeriod,
  | 'id'
  | 'providerKey'
  | 'product'
  | 'currency'
  | 'periodStart'
  | 'periodEnd'
  | 'providerReportedGgr'
  | 'discrepancy'
  | 'commercialTerms'
  | 'commissionFee'
  | 'amountDue'
  | 'providerStatementRef'
  | 'providerInvoiceRef'
  | 'status'
> {
  const bucket = emptyBucket(rows[0]?.currency ?? 'TMTM');
  for (const row of rows) addToBucket(bucket, row);
  return {
    internalStakeTotal: bucket.stakeTotal,
    internalPayoutTotal: bucket.payoutTotal,
    refundTotal: bucket.refundTotal,
    voidTotal: bucket.voidTotal,
    rollbackTotal: bucket.rollbackTotal,
    internalGgr: bucket.internalGgr,
  };
}

export function derivedDiscrepancy(
  internalGgr: number,
  providerReportedGgr: number | null,
): number | null {
  if (providerReportedGgr == null) return null;
  return money2(internalGgr - providerReportedGgr);
}
