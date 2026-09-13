export const PROVIDER_PRODUCTS = ['sports', 'casino'] as const;
export type ProviderProduct = (typeof PROVIDER_PRODUCTS)[number];

export const PROVIDER_TX_KINDS = [
  'stake',
  'bet',
  'payout',
  'win',
  'refund',
  'void',
  'rollback',
] as const;
export type ProviderTxKind = (typeof PROVIDER_TX_KINDS)[number];

export const SETTLEMENT_STATUSES = [
  'open',
  'reconciled',
  'invoiced',
  'paid',
  'dispute',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export interface CanonicalProviderEvent {
  providerKey: string;
  product: ProviderProduct;
  externalTransactionId: string;
  relatedTransactionId?: string | null;
  kind: ProviderTxKind;
  amount: number;
  currency: string;
  occurredAt: Date | string;
  metadata?: Record<string, unknown>;
}

export interface ProviderLedgerRow {
  id: string;
  providerKey: string;
  product: ProviderProduct;
  externalTransactionId: string;
  relatedTransactionId: string | null;
  kind: ProviderTxKind;
  amount: number;
  currency: string;
  occurredAt: Date;
  receivedAt: Date;
  metadata: Record<string, unknown>;
  economicEffect: number;
}

export interface IngestResult {
  inserted: boolean;
  replayed: boolean;
  row: ProviderLedgerRow;
}

export interface SettlementPeriod {
  id: string;
  providerKey: string;
  product: ProviderProduct;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  internalStakeTotal: number;
  internalPayoutTotal: number;
  refundTotal: number;
  voidTotal: number;
  rollbackTotal: number;
  internalGgr: number;
  providerReportedGgr: number | null;
  discrepancy: number | null;
  commercialTerms: Record<string, unknown> | null;
  commissionFee: number | null;
  amountDue: number | null;
  providerStatementRef: string | null;
  providerInvoiceRef: string | null;
  status: SettlementStatus;
}

export interface GgrBucket {
  currency: string;
  stakeTotal: number;
  payoutTotal: number;
  refundTotal: number;
  voidTotal: number;
  rollbackTotal: number;
  internalGgr: number;
}

export interface ProviderAccountingStore {
  findByProviderTx(
    providerKey: string,
    externalTransactionId: string,
  ): Promise<ProviderLedgerRow | null>;
  insert(row: ProviderLedgerRow): Promise<ProviderLedgerRow>;
  list(filter?: {
    providerKey?: string;
    product?: ProviderProduct;
    currency?: string;
    from?: Date;
    to?: Date;
  }): Promise<ProviderLedgerRow[]>;
  upsertPeriod(period: SettlementPeriod): Promise<SettlementPeriod>;
  listPeriods(): Promise<SettlementPeriod[]>;
}
