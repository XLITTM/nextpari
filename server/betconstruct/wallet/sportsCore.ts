import { randomUUID } from 'node:crypto';
import {
  assertExactScale,
  displayScaleOf,
  exactToNumber,
  fromMinorUnits,
  parseExactNonNegativeAmount,
  requirePositiveExactAmount,
  toMinorUnits,
} from './exactAmount.js';
import { providerDisplayCurrency, walletStorageCurrency } from './currency.js';
import { financialFingerprint, payloadHash, providerEconomicExternalId } from './fingerprint.js';
import { sportsbookHashIsValid, type SportsHashMethod } from './sportsHash.js';
import { assertSportsTsFresh } from './sportsTs.js';
import { resolveBinding, touchBinding } from './session.js';
import type {
  BetConstructWalletPorts,
  ProviderTransactionRecord,
  SessionBinding,
  SportsBetRecord,
  SportsCoreResult,
} from './types.js';

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asExactToken(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new Error('TOKEN_INVALID');
  return value;
}

function sanitizeMeta(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  delete out.Hash;
  delete out.hash;
  delete out.AuthToken;
  delete out.authToken;
  return out;
}

async function recordCallback(
  ports: BetConstructWalletPorts,
  method: string,
  params: Record<string, unknown>,
  status: string,
  responseCode: string | null,
): Promise<void> {
  await ports.callbacks.append({
    id: randomUUID(),
    product: 'sportsbook',
    method,
    externalTransactionId: asText(params.TransactionId) || null,
    providerBetId: params.BetId == null || asText(params.BetId) === '' ? null : Number(params.BetId),
    payloadHash: payloadHash(sanitizeMeta(params)),
    correlationId: randomUUID(),
    processingStatus: status,
    responseCode,
    receivedAtMs: ports.nowMs(),
    processedAtMs: ports.nowMs(),
    sanitizedMetadata: sanitizeMeta(params),
  });
}

async function requireSportsHash(
  method: SportsHashMethod,
  params: Record<string, unknown>,
  sharedKey: string,
  nowMs: number,
): Promise<void> {
  if (!sportsbookHashIsValid(method, params, sharedKey, params.Hash ?? params.hash)) {
    throw new Error('HASH_INVALID');
  }
  assertSportsTsFresh(params.TS, nowMs);
}

function sportsFail(error: string): SportsCoreResult {
  return { ok: false, error };
}

function requireSportsAmount(value: unknown, displayCurrency: string): string {
  return requirePositiveExactAmount(value, displayCurrency);
}

function requireSportsNonNegativeAmount(value: unknown, displayCurrency: string): string {
  if (value === undefined || value === null) throw new Error('AMOUNT_INVALID');
  const amount = parseExactNonNegativeAmount(value);
  assertExactScale(amount, displayCurrency);
  return amount;
}

function subtractExact(left: string, right: string, displayCurrency: string): string {
  const unit = displayScaleOf(displayCurrency);
  return fromMinorUnits(toMinorUnits(left, unit) - toMinorUnits(right, unit), unit);
}

async function storageCurrency(binding: SessionBinding): Promise<string> {
  const storage = walletStorageCurrency(binding.displayCurrency);
  if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
  return storage;
}

async function rememberTx(
  ports: BetConstructWalletPorts,
  row: Omit<ProviderTransactionRecord, 'id' | 'createdAtMs' | 'processedAtMs'> & { id?: string },
): Promise<ProviderTransactionRecord> {
  const stored: ProviderTransactionRecord = {
    ...row,
    id: row.id ?? randomUUID(),
    createdAtMs: ports.nowMs(),
    processedAtMs: ports.nowMs(),
  };
  return ports.transactions.insert(stored);
}

function assertSportsOwnership(binding: SessionBinding, bet: SportsBetRecord): void {
  if (binding.playerAuthUserId !== bet.playerAuthUserId) {
    throw new Error('TOKEN_PLAYER_MISMATCH');
  }
  if (binding.playerPublicId !== bet.playerPublicId) {
    throw new Error('TOKEN_PLAYER_MISMATCH');
  }
}

export async function sportsGetClientDetails(
  ports: BetConstructWalletPorts,
  params: Record<string, unknown>,
  sharedKey: string,
): Promise<SportsCoreResult> {
  try {
    await requireSportsHash('GetClientDetails', params, sharedKey, ports.nowMs());
    const binding = await touchBinding(
      ports,
      await resolveBinding(ports, asExactToken(params.AuthToken), 'sportsbook', 'new_play', 'launch'),
      true,
    );
    await recordCallback(ports, 'GetClientDetails', params, 'accepted', '0');
    return {
      ok: true,
      clientId: binding.playerPublicId,
      currency: binding.displayCurrency,
      balance: await ports.wallet.balanceOf(binding.walletId),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
    await recordCallback(ports, 'GetClientDetails', params, 'rejected', code);
    return sportsFail(code);
  }
}

export async function sportsGetClientBalance(
  ports: BetConstructWalletPorts,
  params: Record<string, unknown>,
  sharedKey: string,
): Promise<SportsCoreResult> {
  try {
    await requireSportsHash('GetClientBalance', params, sharedKey, ports.nowMs());
    const binding = await touchBinding(
      ports,
      await resolveBinding(ports, asExactToken(params.AuthToken), 'sportsbook', 'new_play', 'launch'),
      true,
    );
    await recordCallback(ports, 'GetClientBalance', params, 'accepted', '0');
    return {
      ok: true,
      currency: binding.displayCurrency,
      balance: await ports.wallet.balanceOf(binding.walletId),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
    await recordCallback(ports, 'GetClientBalance', params, 'rejected', code);
    return sportsFail(code);
  }
}

export async function sportsBetPlaced(
  ports: BetConstructWalletPorts,
  params: Record<string, unknown>,
  sharedKey: string,
): Promise<SportsCoreResult> {
  try {
    await requireSportsHash('BetPlaced', params, sharedKey, ports.nowMs());
    return await ports.runAtomic(async () => {
      const binding = await touchBinding(
        ports,
        await resolveBinding(ports, asExactToken(params.AuthToken), 'sportsbook', 'new_play', 'launch'),
        true,
      );
      const stake = requireSportsAmount(params.Amount, binding.displayCurrency);
      const txId = asText(params.TransactionId);
      const betId = Number(params.BetId);
      if (!txId || !Number.isInteger(betId)) throw new Error('TRANSACTION_ID_INVALID');
      const fingerprint = financialFingerprint({
        transactionId: txId,
        betId,
        amount: stake,
        walletId: binding.walletId,
        currency: binding.displayCurrency,
      });
      const existing = await ports.transactions.find('sportsbook', 'BetPlaced', txId);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          await recordCallback(ports, 'BetPlaced', params, 'conflict', 'CONFLICT');
          return sportsFail('CONFLICT');
        }
        await recordCallback(ports, 'BetPlaced', params, 'ignored', '0');
        return {
          ok: true,
          replayed: true,
          currency: binding.displayCurrency,
          balance: await ports.wallet.balanceOf(binding.walletId),
        };
      }
      const storage = await storageCurrency(binding);
      const account = await ports.wallet.getAccount(binding.walletId);
      if (providerDisplayCurrency(account.currency) !== binding.displayCurrency) {
        throw new Error('CURRENCY_MISMATCH');
      }
      await ports.wallet.applyEntry({
        walletId: binding.walletId,
        signedAmountExact: `-${stake}`,
        operation: 'CASINO_BET',
        idempotencyKey: `bc-sports-place:${txId}`,
        currency: storage,
        metadata: { phase: 'BetPlaced' },
      });
      ports.trip('sports_bet_persist');
      const bet: SportsBetRecord = {
        id: randomUUID(),
        betId,
        playerAuthUserId: binding.playerAuthUserId,
        playerPublicId: binding.playerPublicId,
        walletId: binding.walletId,
        displayCurrency: binding.displayCurrency,
        stakeExact: stake,
        placedTransactionId: txId,
        latestResultAmountExact: '0',
        latestResultState: null,
        latestResultTransactionId: null,
        rolledBackAtMs: null,
        createdAtMs: ports.nowMs(),
        updatedAtMs: ports.nowMs(),
        metadata: sanitizeMeta(params),
      };
      await ports.sportsBets.insert(bet);
      await rememberTx(ports, {
        product: 'sportsbook',
        method: 'BetPlaced',
        externalTransactionId: txId,
        relatedTransactionId: null,
        betId,
        providerPlayerId: null,
        playerAuthUserId: binding.playerAuthUserId,
        walletId: binding.walletId,
        displayCurrency: binding.displayCurrency,
        amountExact: stake,
        requestFingerprint: fingerprint,
        platformTransactionId: null,
        status: 'accepted',
        metadata: sanitizeMeta(params),
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'sports',
        externalTransactionId: txId,
        kind: 'stake',
        amount: exactToNumber(stake),
        currency: binding.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
        metadata: { betId },
      });
      await recordCallback(ports, 'BetPlaced', params, 'accepted', '0');
      return {
        ok: true,
        currency: binding.displayCurrency,
        balance: await ports.wallet.balanceOf(binding.walletId),
      };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
    await recordCallback(ports, 'BetPlaced', params, 'rejected', code);
    return sportsFail(code);
  }
}

export async function sportsBetResulted(
  ports: BetConstructWalletPorts,
  params: Record<string, unknown>,
  sharedKey: string,
): Promise<SportsCoreResult> {
  try {
    await requireSportsHash('BetResulted', params, sharedKey, ports.nowMs());
    return await ports.runAtomic(async () => {
      const binding = await resolveBinding(
        ports,
        asExactToken(params.AuthToken),
        'sportsbook',
        'settlement',
        'launch',
      );
      const txId = asText(params.TransactionId);
      const betId = Number(params.BetId);
      if (!txId || !Number.isInteger(betId)) throw new Error('TRANSACTION_ID_INVALID');
      const bet = await ports.sportsBets.findByBetId(betId);
      if (!bet) throw new Error('BET_NOT_FOUND');
      assertSportsOwnership(binding, bet);
      const finalAmount = requireSportsNonNegativeAmount(params.Amount, bet.displayCurrency);
      const fingerprint = financialFingerprint({
        transactionId: txId,
        betId,
        amount: finalAmount,
        betState: asText(params.BetState),
      });
      const existing = await ports.transactions.find('sportsbook', 'BetResulted', txId);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          await recordCallback(ports, 'BetResulted', params, 'conflict', 'CONFLICT');
          return sportsFail('CONFLICT');
        }
        await recordCallback(ports, 'BetResulted', params, 'ignored', '0');
        return {
          ok: true,
          replayed: true,
          currency: bet.displayCurrency,
          balance: await ports.wallet.balanceOf(bet.walletId),
        };
      }
      const previous = bet.latestResultAmountExact;
      const delta = subtractExact(finalAmount, previous, bet.displayCurrency);
      const storage = walletStorageCurrency(bet.displayCurrency);
      if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
      const scale = displayScaleOf(bet.displayCurrency);
      const signedDeltaMinor = toMinorUnits(delta, scale);
      if (signedDeltaMinor > 0n) {
        await ports.wallet.applyEntry({
          walletId: bet.walletId,
          signedAmountExact: delta,
          operation: 'CASINO_WIN',
          idempotencyKey: `bc-sports-result:${txId}`,
          currency: storage,
          allowBlocked: true,
          metadata: { phase: 'BetResulted', previous, finalAmount },
        });
      } else if (signedDeltaMinor < 0n) {
        await ports.wallet.applyEntry({
          walletId: bet.walletId,
          signedAmountExact: delta,
          operation: 'CASINO_BET',
          idempotencyKey: `bc-sports-result:${txId}`,
          currency: storage,
          allowBlocked: true,
          metadata: { phase: 'BetResulted', previous, finalAmount },
        });
      }
      const previousPayoutExternal = typeof bet.metadata.payoutExternalId === 'string'
        ? bet.metadata.payoutExternalId
        : null;
      const previousMinor = toMinorUnits(previous, scale);
      const finalMinor = toMinorUnits(finalAmount, scale);
      if (signedDeltaMinor !== 0n && previousMinor > 0n && previousPayoutExternal) {
        await ports.ingestProvider({
          providerKey: 'betconstruct',
          product: 'sports',
          externalTransactionId: providerEconomicExternalId(txId, 'rollback'),
          relatedTransactionId: previousPayoutExternal,
          kind: 'rollback',
          amount: exactToNumber(previous),
          currency: bet.displayCurrency,
          occurredAt: new Date(ports.nowMs()).toISOString(),
        });
      }
      if (finalMinor > 0n && (signedDeltaMinor !== 0n || previousMinor === 0n)) {
        const payoutExternal = previousMinor === 0n ? txId : providerEconomicExternalId(txId, 'payout');
        await ports.ingestProvider({
          providerKey: 'betconstruct',
          product: 'sports',
          externalTransactionId: payoutExternal,
          relatedTransactionId: bet.placedTransactionId,
          kind: 'payout',
          amount: exactToNumber(finalAmount),
          currency: bet.displayCurrency,
          occurredAt: new Date(ports.nowMs()).toISOString(),
        });
        bet.metadata = { ...bet.metadata, payoutExternalId: payoutExternal };
      } else if (finalMinor === 0n && previousMinor > 0n && previousPayoutExternal) {
        bet.metadata = { ...bet.metadata, payoutExternalId: null };
      }
      bet.latestResultAmountExact = finalAmount;
      bet.latestResultState = asText(params.BetState) || null;
      bet.latestResultTransactionId = txId;
      bet.updatedAtMs = ports.nowMs();
      await ports.sportsBets.save(bet);
      await rememberTx(ports, {
        product: 'sportsbook',
        method: 'BetResulted',
        externalTransactionId: txId,
        relatedTransactionId: bet.placedTransactionId,
        betId,
        providerPlayerId: null,
        playerAuthUserId: bet.playerAuthUserId,
        walletId: bet.walletId,
        displayCurrency: bet.displayCurrency,
        amountExact: finalAmount,
        requestFingerprint: fingerprint,
        platformTransactionId: null,
        status: 'accepted',
        metadata: sanitizeMeta(params),
      });
      await recordCallback(ports, 'BetResulted', params, 'accepted', '0');
      return {
        ok: true,
        currency: bet.displayCurrency,
        balance: await ports.wallet.balanceOf(bet.walletId),
      };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
    await recordCallback(ports, 'BetResulted', params, 'rejected', code);
    return sportsFail(code);
  }
}

export async function sportsRollback(
  ports: BetConstructWalletPorts,
  params: Record<string, unknown>,
  sharedKey: string,
): Promise<SportsCoreResult> {
  try {
    await requireSportsHash('Rollback', params, sharedKey, ports.nowMs());
    return await ports.runAtomic(async () => {
      const binding = await resolveBinding(
        ports,
        asExactToken(params.AuthToken),
        'sportsbook',
        'settlement',
        'launch',
      );
      const txId = asText(params.TransactionId);
      if (!txId) throw new Error('TRANSACTION_ID_INVALID');
      const fingerprint = financialFingerprint({ transactionId: txId });
      const existing = await ports.transactions.find('sportsbook', 'Rollback', txId);
      if (existing) {
        const bet = await ports.sportsBets.findByPlacedTransactionId(txId);
        await recordCallback(ports, 'Rollback', params, 'ignored', '0');
        return {
          ok: true,
          replayed: true,
          currency: bet?.displayCurrency,
          balance: bet ? await ports.wallet.balanceOf(bet.walletId) : undefined,
        };
      }
      const bet = await ports.sportsBets.findByPlacedTransactionId(txId);
      if (!bet) {
        await recordCallback(ports, 'Rollback', params, 'ignored', '0');
        return { ok: true, replayed: true };
      }
      assertSportsOwnership(binding, bet);
      if (bet.rolledBackAtMs != null) {
        await recordCallback(ports, 'Rollback', params, 'ignored', '0');
        return {
          ok: true,
          replayed: true,
          currency: bet.displayCurrency,
          balance: await ports.wallet.balanceOf(bet.walletId),
        };
      }
      const storage = walletStorageCurrency(bet.displayCurrency);
      if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
      await ports.wallet.applyEntry({
        walletId: bet.walletId,
        signedAmountExact: bet.stakeExact,
        operation: 'CASINO_REFUND',
        idempotencyKey: `bc-sports-rollback:${txId}`,
        currency: storage,
        allowBlocked: true,
        metadata: { phase: 'Rollback' },
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'sports',
        externalTransactionId: providerEconomicExternalId(txId, 'rollback'),
        relatedTransactionId: txId,
        kind: 'rollback',
        amount: exactToNumber(bet.stakeExact),
        currency: bet.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
      bet.rolledBackAtMs = ports.nowMs();
      bet.updatedAtMs = ports.nowMs();
      await ports.sportsBets.save(bet);
      const placed = await ports.transactions.find('sportsbook', 'BetPlaced', txId);
      if (placed) {
        placed.status = 'rolled_back';
        await ports.transactions.save(placed);
      }
      await rememberTx(ports, {
        product: 'sportsbook',
        method: 'Rollback',
        externalTransactionId: txId,
        relatedTransactionId: txId,
        betId: bet.betId,
        providerPlayerId: null,
        playerAuthUserId: bet.playerAuthUserId,
        walletId: bet.walletId,
        displayCurrency: bet.displayCurrency,
        amountExact: bet.stakeExact,
        requestFingerprint: fingerprint,
        platformTransactionId: null,
        status: 'accepted',
        metadata: sanitizeMeta(params),
      });
      await recordCallback(ports, 'Rollback', params, 'accepted', '0');
      return {
        ok: true,
        currency: bet.displayCurrency,
        balance: await ports.wallet.balanceOf(bet.walletId),
      };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
    await recordCallback(ports, 'Rollback', params, 'rejected', code);
    return sportsFail(code);
  }
}
