import {
  economicEffectFor,
  money2,
  normalizeCurrency,
  normalizeProviderKey,
  periodKey,
  totalsFromRows,
  utcMonthBounds,
} from './ggr.js';
import type {
  CanonicalProviderEvent,
  IngestResult,
  ProviderAccountingStore,
  ProviderLedgerRow,
  SettlementPeriod,
} from './types.js';

function asDate(value: Date | string): Date {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) throw new Error('PROVIDER_OCCURRED_AT_REQUIRED');
  return at;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `prov-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class MemoryProviderAccountingStore implements ProviderAccountingStore {
  readonly rows = new Map<string, ProviderLedgerRow>();
  readonly periods = new Map<string, SettlementPeriod>();

  private txKey(providerKey: string, externalTransactionId: string): string {
    return `${providerKey}\u001f${externalTransactionId}`;
  }

  async findByProviderTx(providerKey: string, externalTransactionId: string) {
    return this.rows.get(this.txKey(providerKey, externalTransactionId)) ?? null;
  }

  async insert(row: ProviderLedgerRow) {
    const key = this.txKey(row.providerKey, row.externalTransactionId);
    if (this.rows.has(key)) return this.rows.get(key)!;
    if (row.kind === 'refund' || row.kind === 'void' || row.kind === 'rollback') {
      for (const existing of this.rows.values()) {
        if (
          existing.providerKey === row.providerKey
          && existing.relatedTransactionId === row.relatedTransactionId
          && (existing.kind === 'refund' || existing.kind === 'void' || existing.kind === 'rollback')
        ) {
          throw new Error('PROVIDER_NEUTRALIZATION_DUPLICATE');
        }
      }
    }
    this.rows.set(key, row);
    return row;
  }

  async list(filter?: {
    providerKey?: string;
    product?: ProviderLedgerRow['product'];
    currency?: string;
    from?: Date;
    to?: Date;
  }) {
    return [...this.rows.values()].filter((row) => {
      if (filter?.providerKey && row.providerKey !== filter.providerKey) return false;
      if (filter?.product && row.product !== filter.product) return false;
      if (filter?.currency && row.currency !== filter.currency) return false;
      if (filter?.from && row.occurredAt < filter.from) return false;
      if (filter?.to && row.occurredAt >= filter.to) return false;
      return true;
    });
  }

  async upsertPeriod(period: SettlementPeriod) {
    const key = periodKey(period);
    const existing = this.periods.get(key);
    const next: SettlementPeriod = existing
      ? {
          ...existing,
          internalStakeTotal: period.internalStakeTotal,
          internalPayoutTotal: period.internalPayoutTotal,
          refundTotal: period.refundTotal,
          voidTotal: period.voidTotal,
          rollbackTotal: period.rollbackTotal,
          internalGgr: period.internalGgr,
          discrepancy: existing.providerReportedGgr == null
            ? null
            : money2(period.internalGgr - existing.providerReportedGgr),
        }
      : period;
    this.periods.set(key, next);
    return next;
  }

  async listPeriods() {
    return [...this.periods.values()];
  }
}

export async function ingestProviderAccountingEvent(
  event: CanonicalProviderEvent,
  store: ProviderAccountingStore,
): Promise<IngestResult> {
  const providerKey = normalizeProviderKey(event.providerKey);
  const currency = normalizeCurrency(event.currency);
  const externalTransactionId = String(event.externalTransactionId ?? '').trim();
  if (!externalTransactionId || externalTransactionId.length > 128) {
    throw new Error('PROVIDER_TRANSACTION_ID_INVALID');
  }
  const relatedTransactionId = event.relatedTransactionId
    ? String(event.relatedTransactionId).trim() || null
    : null;
  const occurredAt = asDate(event.occurredAt);
  const amount = money2(event.amount);

  const existing = await store.findByProviderTx(providerKey, externalTransactionId);
  if (existing) {
    const sameIdentity = existing.providerKey === providerKey
      && existing.product === event.product
      && existing.externalTransactionId === externalTransactionId
      && (existing.relatedTransactionId ?? null) === (relatedTransactionId ?? null)
      && existing.kind === event.kind
      && existing.amount === amount
      && existing.currency === currency
      && existing.occurredAt.getTime() === occurredAt.getTime();
    if (!sameIdentity) {
      throw new Error('PROVIDER_TRANSACTION_CONFLICT');
    }
    return { inserted: false, replayed: true, row: existing };
  }

  let related: ProviderLedgerRow | null = null;
  if (event.kind === 'refund' || event.kind === 'void' || event.kind === 'rollback') {
    if (!relatedTransactionId) throw new Error('PROVIDER_RELATED_TRANSACTION_REQUIRED');
    related = await store.findByProviderTx(providerKey, relatedTransactionId);
    if (!related) throw new Error('PROVIDER_RELATED_TRANSACTION_NOT_FOUND');
    if (amount !== related.amount) {
      throw new Error('PROVIDER_NEUTRALIZATION_AMOUNT_MISMATCH');
    }
  }

  const row: ProviderLedgerRow = {
    id: newId(),
    providerKey,
    product: event.product,
    externalTransactionId,
    relatedTransactionId,
    kind: event.kind,
    amount,
    currency,
    occurredAt,
    receivedAt: new Date(),
    metadata: event.metadata ?? {},
    economicEffect: economicEffectFor(event, related, currency),
  };

  const saved = await store.insert(row);
  const month = utcMonthBounds(saved.occurredAt);
  const monthRows = (await store.list({
    providerKey: saved.providerKey,
    product: saved.product,
    currency: saved.currency,
    from: month.start,
    to: month.end,
  }));
  const totals = totalsFromRows(monthRows);
  await store.upsertPeriod({
    id: newId(),
    providerKey: saved.providerKey,
    product: saved.product,
    currency: saved.currency,
    periodStart: month.start,
    periodEnd: month.end,
    ...totals,
    providerReportedGgr: null,
    discrepancy: null,
    commercialTerms: null,
    commissionFee: null,
    amountDue: null,
    providerStatementRef: null,
    providerInvoiceRef: null,
    status: 'open',
  });
  return { inserted: true, replayed: false, row: saved };
}
