import type { CanonicalProviderEvent, ProviderAccountingStore } from '../../providerAccounting/types.js';

export type BetConstructProduct = 'sportsbook' | 'casino';
export type WalletOperation = 'CASINO_BET' | 'CASINO_WIN' | 'CASINO_REFUND';
export type TransactionStatus = 'accepted' | 'conflict' | 'rolled_back' | 'ignored';

export interface SessionBinding {
  id: string;
  product: BetConstructProduct;
  tokenDigest: string;
  playerAuthUserId: string;
  playerPublicId: string;
  walletId: string;
  displayCurrency: string;
  providerPlayerId: number | null;
  createdAtMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number | null;
  revokedAtMs: number | null;
  metadata: Record<string, unknown>;
}

export interface SportsBetRecord {
  id: string;
  betId: number;
  playerAuthUserId: string;
  playerPublicId: string;
  walletId: string;
  displayCurrency: string;
  stake: number;
  placedTransactionId: string;
  latestResultAmount: number;
  latestResultState: string | null;
  latestResultTransactionId: string | null;
  rolledBackAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  metadata: Record<string, unknown>;
}

export interface ProviderTransactionRecord {
  id: string;
  product: BetConstructProduct;
  method: string;
  externalTransactionId: string | null;
  relatedTransactionId: string | null;
  betId: number | null;
  providerPlayerId: number | null;
  playerAuthUserId: string;
  walletId: string;
  displayCurrency: string;
  amount: number;
  requestFingerprint: string;
  platformTransactionId: number | null;
  status: TransactionStatus;
  createdAtMs: number;
  processedAtMs: number | null;
  metadata: Record<string, unknown>;
}

export interface CallbackEventRecord {
  id: string;
  product: BetConstructProduct;
  method: string;
  externalTransactionId: string | null;
  providerBetId: number | null;
  payloadHash: string;
  correlationId: string;
  processingStatus: string;
  responseCode: string | null;
  receivedAtMs: number;
  processedAtMs: number | null;
  sanitizedMetadata: Record<string, unknown>;
}

export interface WalletLedgerEntry {
  ledgerId: string;
  walletId: string;
  signedAmount: number;
  operation: WalletOperation;
  idempotencyKey: string;
  currency: string;
}

export interface ApplyWalletEntryInput {
  walletId: string;
  signedAmount: number;
  operation: WalletOperation;
  idempotencyKey: string;
  currency: string;
  allowBlocked?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WalletAccountState {
  walletId: string;
  playerAuthUserId: string;
  currency: string;
  status: 'active' | 'blocked' | 'closed';
  entries: WalletLedgerEntry[];
}

export interface WalletLedgerPort {
  getAccount(walletId: string): Promise<WalletAccountState>;
  applyEntry(input: ApplyWalletEntryInput): Promise<{ ledgerId: string; balanceAfter: number }>;
  balanceOf(walletId: string): Promise<number>;
}

export interface SessionBindingPort {
  insert(binding: SessionBinding): Promise<SessionBinding>;
  findByDigest(digest: string): Promise<SessionBinding | null>;
  save(binding: SessionBinding): Promise<void>;
}

export interface SportsBetPort {
  insert(bet: SportsBetRecord): Promise<SportsBetRecord>;
  findByBetId(betId: number): Promise<SportsBetRecord | null>;
  findByPlacedTransactionId(transactionId: string): Promise<SportsBetRecord | null>;
  save(bet: SportsBetRecord): Promise<void>;
}

export interface TransactionPort {
  insert(row: ProviderTransactionRecord): Promise<ProviderTransactionRecord>;
  find(product: BetConstructProduct, method: string, externalTransactionId: string): Promise<ProviderTransactionRecord | null>;
  listByRelated(product: BetConstructProduct, relatedTransactionId: string): Promise<ProviderTransactionRecord[]>;
  save(row: ProviderTransactionRecord): Promise<void>;
  nextPlatformTransactionId(): Promise<number>;
}

export interface CallbackInboxPort {
  append(row: CallbackEventRecord): Promise<void>;
}

export interface SecurityPort {
  isExternalCasinoRestricted(playerAuthUserId: string): Promise<boolean>;
}

export interface BetConstructWalletPorts {
  nowMs: () => number;
  wallet: WalletLedgerPort;
  sessions: SessionBindingPort;
  sportsBets: SportsBetPort;
  transactions: TransactionPort;
  callbacks: CallbackInboxPort;
  security: SecurityPort;
  providerAccounting: ProviderAccountingStore;
  ingestProvider: (event: CanonicalProviderEvent) => Promise<void>;
}

export interface SportsCoreResult {
  ok: boolean;
  error?: string;
  replayed?: boolean;
  balance?: number;
  currency?: string;
  clientId?: string;
}

export interface CasinoCoreResult {
  ok: boolean;
  errorId: number;
  replayed?: boolean;
  token?: string;
  playerId?: number;
  currency?: string;
  balance?: number;
  platformTransactionId?: number;
}
