import { randomUUID } from 'node:crypto';
import {
  MemoryProviderAccountingStore,
  ingestProviderAccountingEvent,
} from '../../providerAccounting/ingest.js';
import { money2 } from './currency.js';
import type {
  ApplyWalletEntryInput,
  BetConstructWalletPorts,
  CallbackEventRecord,
  ProviderTransactionRecord,
  SessionBinding,
  SportsBetRecord,
  WalletAccountState,
  WalletLedgerEntry,
} from './types.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryWalletLedger implements WalletAccountState {
  walletId: string;
  playerAuthUserId: string;
  currency: string;
  status: WalletAccountState['status'];
  entries: WalletLedgerEntry[] = [];
  private initialBalance: number;

  constructor(input: {
    walletId: string;
    playerAuthUserId: string;
    currency: string;
    status?: WalletAccountState['status'];
    balance?: number;
  }) {
    this.walletId = input.walletId;
    this.playerAuthUserId = input.playerAuthUserId;
    this.currency = input.currency;
    this.status = input.status ?? 'active';
    this.initialBalance = money2(input.balance ?? 0);
  }

  balance(): number {
    return money2(this.initialBalance + this.entries.reduce((sum, row) => sum + row.signedAmount, 0));
  }
}

export function createMemoryWalletPorts(input: {
  wallets: MemoryWalletLedger[];
  restrictedPlayerIds?: string[];
  nowMs?: number;
}): BetConstructWalletPorts & {
  wallets: Map<string, MemoryWalletLedger>;
  sessionRows: SessionBinding[];
  sportsBetRows: SportsBetRecord[];
  transactionRows: ProviderTransactionRecord[];
  callbackRows: CallbackEventRecord[];
  accounting: MemoryProviderAccountingStore;
  setNow: (ms: number) => void;
} {
  const wallets = new Map(input.wallets.map((wallet) => [wallet.walletId, wallet]));
  const sessions: SessionBinding[] = [];
  const sportsBets: SportsBetRecord[] = [];
  const transactions: ProviderTransactionRecord[] = [];
  const callbacks: CallbackEventRecord[] = [];
  const accounting = new MemoryProviderAccountingStore();
  const restricted = new Set(input.restrictedPlayerIds ?? []);
  let now = input.nowMs ?? Date.now();
  let platformSeq = 1;

  const ports: BetConstructWalletPorts = {
    nowMs: () => now,
    wallet: {
      async getAccount(walletId) {
        const wallet = wallets.get(walletId);
        if (!wallet) throw new Error('WALLET_ACCOUNT_NOT_FOUND');
        return {
          walletId: wallet.walletId,
          playerAuthUserId: wallet.playerAuthUserId,
          currency: wallet.currency,
          status: wallet.status,
          entries: [...wallet.entries],
        };
      },
      async applyEntry(entry: ApplyWalletEntryInput) {
        const wallet = wallets.get(entry.walletId);
        if (!wallet) throw new Error('WALLET_ACCOUNT_NOT_FOUND');
        if (wallet.currency !== entry.currency) throw new Error('CURRENCY_MISMATCH');
        if (wallet.status !== 'active' && entry.allowBlocked !== true) {
          throw new Error(wallet.status === 'closed' ? 'WALLET_CLOSED' : 'WALLET_BLOCKED');
        }
        const existing = wallet.entries.find((row) => row.idempotencyKey === entry.idempotencyKey);
        if (existing) {
          if (
            existing.signedAmount !== money2(entry.signedAmount)
            || existing.operation !== entry.operation
            || existing.walletId !== entry.walletId
          ) {
            throw new Error('IDEMPOTENCY_KEY_CONFLICT');
          }
          return { ledgerId: existing.ledgerId, balanceAfter: wallet.balance() };
        }
        const signedAmount = money2(entry.signedAmount);
        if (signedAmount < 0 && wallet.balance() + signedAmount < 0) {
          throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
        }
        const next: WalletLedgerEntry = {
          ledgerId: randomUUID(),
          walletId: entry.walletId,
          signedAmount,
          operation: entry.operation,
          idempotencyKey: entry.idempotencyKey,
          currency: entry.currency,
        };
        wallet.entries.push(next);
        return { ledgerId: next.ledgerId, balanceAfter: wallet.balance() };
      },
      async balanceOf(walletId) {
        const wallet = wallets.get(walletId);
        if (!wallet) throw new Error('WALLET_ACCOUNT_NOT_FOUND');
        return wallet.balance();
      },
    },
    sessions: {
      async insert(binding) {
        if (sessions.some((row) => row.tokenDigest === binding.tokenDigest)) {
          throw new Error('SESSION_DIGEST_CONFLICT');
        }
        const stored = clone(binding);
        sessions.push(stored);
        return clone(stored);
      },
      async findByDigest(digest) {
        const found = sessions.find((row) => row.tokenDigest === digest);
        return found ? clone(found) : null;
      },
      async save(binding) {
        const idx = sessions.findIndex((row) => row.id === binding.id);
        if (idx < 0) throw new Error('SESSION_NOT_FOUND');
        const previous = sessions[idx];
        if (
          previous.playerAuthUserId !== binding.playerAuthUserId
          || previous.walletId !== binding.walletId
          || previous.displayCurrency !== binding.displayCurrency
        ) {
          throw new Error('SESSION_IMMUTABLE');
        }
        sessions[idx] = clone(binding);
      },
    },
    sportsBets: {
      async insert(bet) {
        if (sportsBets.some((row) => row.betId === bet.betId)) throw new Error('BET_ID_CONFLICT');
        if (sportsBets.some((row) => row.placedTransactionId === bet.placedTransactionId)) {
          throw new Error('PLACED_TRANSACTION_CONFLICT');
        }
        sportsBets.push(clone(bet));
        return clone(bet);
      },
      async findByBetId(betId) {
        const found = sportsBets.find((row) => row.betId === betId);
        return found ? clone(found) : null;
      },
      async findByPlacedTransactionId(transactionId) {
        const found = sportsBets.find((row) => row.placedTransactionId === transactionId);
        return found ? clone(found) : null;
      },
      async save(bet) {
        const idx = sportsBets.findIndex((row) => row.id === bet.id);
        if (idx < 0) throw new Error('BET_NOT_FOUND');
        const previous = sportsBets[idx];
        if (
          previous.walletId !== bet.walletId
          || previous.displayCurrency !== bet.displayCurrency
          || previous.playerAuthUserId !== bet.playerAuthUserId
        ) {
          throw new Error('BET_IMMUTABLE');
        }
        sportsBets[idx] = clone(bet);
      },
    },
    transactions: {
      async insert(row) {
        transactions.push(clone(row));
        return clone(row);
      },
      async find(product, method, externalTransactionId) {
        const found = transactions.find((row) =>
          row.product === product
          && row.method === method
          && row.externalTransactionId === externalTransactionId
        );
        return found ? clone(found) : null;
      },
      async listByRelated(product, relatedTransactionId) {
        return transactions
          .filter((row) => row.product === product && row.relatedTransactionId === relatedTransactionId)
          .map(clone);
      },
      async save(row) {
        const idx = transactions.findIndex((item) => item.id === row.id);
        if (idx < 0) throw new Error('TRANSACTION_NOT_FOUND');
        transactions[idx] = clone(row);
      },
      async nextPlatformTransactionId() {
        const id = platformSeq;
        platformSeq += 1;
        return id;
      },
    },
    callbacks: {
      async append(row) {
        callbacks.push(clone(row));
      },
    },
    security: {
      async isExternalCasinoRestricted(playerAuthUserId) {
        return restricted.has(playerAuthUserId);
      },
    },
    providerAccounting: accounting,
    ingestProvider: async (event) => {
      await ingestProviderAccountingEvent(event, accounting);
    },
  };

  return {
    ...ports,
    wallets,
    sessionRows: sessions,
    sportsBetRows: sportsBets,
    transactionRows: transactions,
    callbackRows: callbacks,
    accounting,
    setNow(ms: number) {
      now = ms;
    },
  };
}
