import { randomUUID } from 'node:crypto';
import { CASINO_ERROR } from './constants.js';
import { assertPlayerIdMatches, casinoPlayerIdFromPublicId } from './casinoPlayerId.js';
import { casinoPublicKeyIsValid } from './casinoPublicKey.js';
import {
  exactToNumber,
  isExactZero,
  requireMandatoryAmount,
  requireMandatoryNonNegativeAmount,
} from './exactAmount.js';
import { providerDisplayCurrency, walletStorageCurrency } from './currency.js';
import { financialFingerprint, payloadHash, providerEconomicExternalId } from './fingerprint.js';
import { persistLaunchBinding, resolveBinding, createCasinoSessionToken } from './session.js';
import type {
  BetConstructWalletPorts,
  CasinoCoreResult,
  ProviderTransactionRecord,
  SessionBinding,
} from './types.js';

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function requireBodyToken(body: Record<string, unknown>): string {
  if (!Object.prototype.hasOwnProperty.call(body, 'Token')) throw new Error('INVALID_TOKEN');
  if (typeof body.Token !== 'string' || body.Token === '') throw new Error('INVALID_TOKEN');
  return body.Token;
}

function requireCurrency(body: Record<string, unknown>, bound: string): string {
  if (!Object.prototype.hasOwnProperty.call(body, 'Currency')) throw new Error('CURRENCY_MISMATCH');
  const incoming = providerDisplayCurrency(asText(body.Currency));
  if (!incoming || incoming !== bound) throw new Error('CURRENCY_MISMATCH');
  return incoming;
}

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  delete out.PublicKey;
  delete out.publicKey;
  delete out.Token;
  delete out.token;
  delete out.AuthToken;
  return out;
}

function casinoFail(errorId: number): CasinoCoreResult {
  return { ok: false, errorId };
}

function mapError(error: unknown): number {
  const code = error instanceof Error ? error.message : 'GENERAL_ERROR';
  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID') {
    return CASINO_ERROR.INVALID_TOKEN;
  }
  if (code === 'WRONG_PLAYER_ID' || code === 'BETCONSTRUCT_PLAYER_ID_INVALID') {
    return CASINO_ERROR.WRONG_PLAYER_ID;
  }
  if (code === 'INSUFFICIENT_AVAILABLE_BALANCE') return CASINO_ERROR.NOT_ENOUGH_BALANCE;
  if (code === 'WALLET_BLOCKED' || code === 'WALLET_CLOSED' || code === 'SECURITY_CASINO_RESTRICTED') {
    return CASINO_ERROR.PLAYER_IS_BLOCKED;
  }
  if (code === 'TRANSACTION_NOT_FOUND') return CASINO_ERROR.TRANSACTION_NOT_FOUND;
  if (
    code === 'CURRENCY_MISMATCH'
    || code === 'AMOUNT_INVALID'
    || code === 'AMOUNT_SCALE_INVALID'
    || code === 'CURRENCY_UNSUPPORTED'
  ) {
    return CASINO_ERROR.WRONG_TRANSACTION_AMOUNT;
  }
  return CASINO_ERROR.GENERAL_ERROR;
}

async function recordCallback(
  ports: BetConstructWalletPorts,
  method: string,
  body: Record<string, unknown>,
  status: string,
  errorId: number | null,
): Promise<void> {
  await ports.callbacks.append({
    id: randomUUID(),
    product: 'casino',
    method,
    externalTransactionId: asText(body.RGSTransactionId) || null,
    providerBetId: null,
    payloadHash: payloadHash(sanitize(body)),
    correlationId: randomUUID(),
    processingStatus: status,
    responseCode: errorId == null ? '0' : String(errorId),
    receivedAtMs: ports.nowMs(),
    processedAtMs: ports.nowMs(),
    sanitizedMetadata: sanitize(body),
  });
}

function assertPublicKey(body: Record<string, unknown>, sharedKey: string): void {
  if (!casinoPublicKeyIsValid(body, sharedKey, body.PublicKey ?? body.publicKey)) {
    throw new Error('INVALID_TOKEN');
  }
}

function rejectBonus(body: Record<string, unknown>): void {
  const bonus = body.BonusDefId ?? body.bonusDefId ?? body.BonusId;
  if (bonus != null && asText(bonus) !== '' && Number(bonus) !== 0) {
    throw Object.assign(new Error('INVALID_BONUS'), { errorId: CASINO_ERROR.INVALID_BONUS_DEFINITION_ID });
  }
}

async function requireNewCasinoPlay(
  ports: BetConstructWalletPorts,
  binding: SessionBinding,
): Promise<void> {
  if (await ports.security.isExternalCasinoRestricted(binding.playerAuthUserId)) {
    throw new Error('SECURITY_CASINO_RESTRICTED');
  }
  const account = await ports.wallet.getAccount(binding.walletId);
  if (account.status !== 'active') throw new Error('WALLET_BLOCKED');
}

async function remember(
  ports: BetConstructWalletPorts,
  row: Omit<ProviderTransactionRecord, 'id' | 'createdAtMs' | 'processedAtMs'>,
): Promise<ProviderTransactionRecord> {
  return ports.transactions.insert({
    ...row,
    id: randomUUID(),
    createdAtMs: ports.nowMs(),
    processedAtMs: ports.nowMs(),
  });
}

function duplicateErrorFor(method: string): number {
  return method === 'Deposit'
    ? CASINO_ERROR.DEPOSIT_ALREADY_RECEIVED
    : CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE;
}

async function duplicateOrConflict(
  existing: ProviderTransactionRecord,
  fingerprint: string,
  method: string,
): Promise<CasinoCoreResult> {
  if (existing.requestFingerprint !== fingerprint) {
    return casinoFail(CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
  }
  return {
    ok: false,
    errorId: duplicateErrorFor(method),
    replayed: true,
    platformTransactionId: existing.platformTransactionId ?? undefined,
  };
}

async function rejectCasinoFinancialCollision(
  ports: BetConstructWalletPorts,
  method: 'Withdraw' | 'Deposit' | 'WithdrawAndDeposit',
  rgsId: string,
  fingerprint: string,
): Promise<CasinoCoreResult | null> {
  const existing = await ports.transactions.findCasinoFinancial(rgsId);
  if (!existing) return null;
  if (existing.method !== method) {
    return casinoFail(CASINO_ERROR.GENERAL_ERROR);
  }
  return duplicateOrConflict(existing, fingerprint, method);
}

function wadHasWithdrawLeg(row: ProviderTransactionRecord): boolean {
  const withdrawAmount = typeof row.metadata.withdrawAmount === 'string'
    ? row.metadata.withdrawAmount
    : null;
  return Boolean(withdrawAmount && !isExactZero(withdrawAmount));
}

function rollbackOriginalEligible(row: ProviderTransactionRecord): boolean {
  if (row.method === 'Withdraw') return true;
  if (row.method === 'WithdrawAndDeposit') return wadHasWithdrawLeg(row);
  return false;
}

export async function casinoAuthentication(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    const launchToken = requireBodyToken(body);
    const launch = await resolveBinding(ports, launchToken, 'casino', 'new_play', 'launch');
    await requireNewCasinoPlay(ports, launch);
    if (body.PlayerId != null && asText(body.PlayerId) !== '') {
      assertPlayerIdMatches(launch.playerPublicId, body.PlayerId);
    }
    const sessionToken = createCasinoSessionToken();
    const session = await persistLaunchBinding(ports, {
      product: 'casino',
      rawToken: sessionToken,
      tokenKind: 'session',
      playerAuthUserId: launch.playerAuthUserId,
      playerPublicId: launch.playerPublicId,
      walletId: launch.walletId,
      displayCurrency: launch.displayCurrency,
      issuedAtMs: ports.nowMs(),
      expiresAtMs: launch.expiresAtMs,
    });
    await recordCallback(ports, 'Authentication', body, 'accepted', 0);
    return {
      ok: true,
      errorId: 0,
      token: sessionToken,
      playerId: casinoPlayerIdFromPublicId(session.playerPublicId).playerId,
      currency: session.displayCurrency,
      balance: await ports.wallet.balanceOf(session.walletId),
    };
  } catch (error) {
    const errorId = (error as { errorId?: number }).errorId ?? mapError(error);
    await recordCallback(ports, 'Authentication', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}

export async function casinoGetBalance(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    const binding = await resolveBinding(ports, requireBodyToken(body), 'casino', 'new_play', 'session');
    if (body.PlayerId != null && asText(body.PlayerId) !== '') {
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'Currency')) {
      requireCurrency(body, binding.displayCurrency);
    }
    await recordCallback(ports, 'GetBalance', body, 'accepted', 0);
    return {
      ok: true,
      errorId: 0,
      playerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
      currency: binding.displayCurrency,
      balance: await ports.wallet.balanceOf(binding.walletId),
    };
  } catch (error) {
    const errorId = mapError(error);
    await recordCallback(ports, 'GetBalance', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}

export async function casinoWithdraw(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    return await ports.runAtomic(async () => {
      const binding = await resolveBinding(ports, requireBodyToken(body), 'casino', 'new_play', 'session');
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
      requireCurrency(body, binding.displayCurrency);
      await requireNewCasinoPlay(ports, binding);
      const amount = requireMandatoryAmount(body, 'WithdrawAmount', binding.displayCurrency);
      const rgsId = asText(body.RGSTransactionId);
      if (!rgsId) throw new Error('TRANSACTION_ID_INVALID');
      const fingerprint = financialFingerprint({
        rgsId,
        amount,
        walletId: binding.walletId,
        currency: binding.displayCurrency,
        playerId: body.PlayerId,
      });
      const collision = await rejectCasinoFinancialCollision(ports, 'Withdraw', rgsId, fingerprint);
      if (collision) {
        await recordCallback(ports, 'Withdraw', body, 'ignored', collision.errorId);
        return collision;
      }
      const storage = walletStorageCurrency(binding.displayCurrency);
      if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
      await ports.wallet.applyEntry({
        walletId: binding.walletId,
        signedAmountExact: `-${amount}`,
        operation: 'CASINO_BET',
        idempotencyKey: `bc-casino-withdraw:${rgsId}`,
        currency: storage,
        metadata: { phase: 'Withdraw' },
      });
      ports.trip('casino_withdraw_persist');
      const platformTransactionId = await ports.transactions.nextPlatformTransactionId();
      await remember(ports, {
        product: 'casino',
        method: 'Withdraw',
        externalTransactionId: rgsId,
        relatedTransactionId: asText(body.RGSRelatedTransactionId) || null,
        betId: null,
        providerPlayerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
        playerAuthUserId: binding.playerAuthUserId,
        walletId: binding.walletId,
        displayCurrency: binding.displayCurrency,
        amountExact: amount,
        requestFingerprint: fingerprint,
        platformTransactionId,
        status: 'accepted',
        metadata: sanitize(body),
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: rgsId,
        kind: 'bet',
        amount: exactToNumber(amount),
        currency: binding.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
      await recordCallback(ports, 'Withdraw', body, 'accepted', 0);
      return {
        ok: true,
        errorId: 0,
        balance: await ports.wallet.balanceOf(binding.walletId),
        currency: binding.displayCurrency,
        platformTransactionId,
        playerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
      };
    });
  } catch (error) {
    const errorId = (error as { errorId?: number }).errorId ?? mapError(error);
    await recordCallback(ports, 'Withdraw', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}

export async function casinoDeposit(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    return await ports.runAtomic(async () => {
      const binding = await resolveBinding(ports, requireBodyToken(body), 'casino', 'settlement', 'session');
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
      requireCurrency(body, binding.displayCurrency);
      const amount = requireMandatoryAmount(body, 'DepositAmount', binding.displayCurrency);
      const rgsId = asText(body.RGSTransactionId);
      if (!rgsId) throw new Error('TRANSACTION_ID_INVALID');
      const related = asText(body.RGSRelatedTransactionId) || null;
      const fingerprint = financialFingerprint({
        rgsId,
        amount,
        walletId: binding.walletId,
        currency: binding.displayCurrency,
        related,
      });
      const collision = await rejectCasinoFinancialCollision(ports, 'Deposit', rgsId, fingerprint);
      if (collision) {
        await recordCallback(ports, 'Deposit', body, 'ignored', collision.errorId);
        return collision;
      }
      const storage = walletStorageCurrency(binding.displayCurrency);
      if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
      await ports.wallet.applyEntry({
        walletId: binding.walletId,
        signedAmountExact: amount,
        operation: 'CASINO_WIN',
        idempotencyKey: `bc-casino-deposit:${rgsId}`,
        currency: storage,
        allowBlocked: true,
        metadata: { phase: 'Deposit' },
      });
      const platformTransactionId = await ports.transactions.nextPlatformTransactionId();
      await remember(ports, {
        product: 'casino',
        method: 'Deposit',
        externalTransactionId: rgsId,
        relatedTransactionId: related,
        betId: null,
        providerPlayerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
        playerAuthUserId: binding.playerAuthUserId,
        walletId: binding.walletId,
        displayCurrency: binding.displayCurrency,
        amountExact: amount,
        requestFingerprint: fingerprint,
        platformTransactionId,
        status: 'accepted',
        metadata: sanitize(body),
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: rgsId,
        relatedTransactionId: related,
        kind: 'win',
        amount: exactToNumber(amount),
        currency: binding.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
      await recordCallback(ports, 'Deposit', body, 'accepted', 0);
      return {
        ok: true,
        errorId: 0,
        balance: await ports.wallet.balanceOf(binding.walletId),
        currency: binding.displayCurrency,
        platformTransactionId,
        playerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
      };
    });
  } catch (error) {
    const errorId = (error as { errorId?: number }).errorId ?? mapError(error);
    await recordCallback(ports, 'Deposit', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}

export async function casinoWithdrawAndDeposit(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    return await ports.runAtomic(async () => {
      const binding = await resolveBinding(ports, requireBodyToken(body), 'casino', 'new_play', 'session');
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
      requireCurrency(body, binding.displayCurrency);
      await requireNewCasinoPlay(ports, binding);
      const withdrawAmount = requireMandatoryNonNegativeAmount(body, 'WithdrawAmount', binding.displayCurrency);
      const depositAmount = requireMandatoryNonNegativeAmount(body, 'DepositAmount', binding.displayCurrency);
      if (isExactZero(withdrawAmount) && isExactZero(depositAmount)) throw new Error('AMOUNT_INVALID');
      const rgsId = asText(body.RGSTransactionId);
      if (!rgsId) throw new Error('TRANSACTION_ID_INVALID');
      const fingerprint = financialFingerprint({
        rgsId,
        withdrawAmount,
        depositAmount,
        walletId: binding.walletId,
        currency: binding.displayCurrency,
      });
      const collision = await rejectCasinoFinancialCollision(ports, 'WithdrawAndDeposit', rgsId, fingerprint);
      if (collision) {
        await recordCallback(ports, 'WithdrawAndDeposit', body, 'ignored', collision.errorId);
        return collision;
      }
      const storage = walletStorageCurrency(binding.displayCurrency);
      if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
      if (!isExactZero(withdrawAmount)) {
        await ports.wallet.applyEntry({
          walletId: binding.walletId,
          signedAmountExact: `-${withdrawAmount}`,
          operation: 'CASINO_BET',
          idempotencyKey: `bc-casino-wad-bet:${rgsId}`,
          currency: storage,
          metadata: { phase: 'WithdrawAndDeposit', leg: 'bet' },
        });
      }
      ports.trip('casino_wad_win');
      if (!isExactZero(depositAmount)) {
        await ports.wallet.applyEntry({
          walletId: binding.walletId,
          signedAmountExact: depositAmount,
          operation: 'CASINO_WIN',
          idempotencyKey: `bc-casino-wad-win:${rgsId}`,
          currency: storage,
          allowBlocked: true,
          metadata: { phase: 'WithdrawAndDeposit', leg: 'win' },
        });
      }
      const platformTransactionId = await ports.transactions.nextPlatformTransactionId();
      await remember(ports, {
        product: 'casino',
        method: 'WithdrawAndDeposit',
        externalTransactionId: rgsId,
        relatedTransactionId: asText(body.RGSRelatedTransactionId) || null,
        betId: null,
        providerPlayerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
        playerAuthUserId: binding.playerAuthUserId,
        walletId: binding.walletId,
        displayCurrency: binding.displayCurrency,
        amountExact: depositAmount,
        requestFingerprint: fingerprint,
        platformTransactionId,
        status: 'accepted',
        metadata: { ...sanitize(body), withdrawAmount, depositAmount },
      });
      if (!isExactZero(withdrawAmount)) {
        await ports.ingestProvider({
          providerKey: 'betconstruct',
          product: 'casino',
          externalTransactionId: providerEconomicExternalId(rgsId, 'bet'),
          kind: 'bet',
          amount: exactToNumber(withdrawAmount),
          currency: binding.displayCurrency,
          occurredAt: new Date(ports.nowMs()).toISOString(),
        });
      }
      if (!isExactZero(depositAmount)) {
        await ports.ingestProvider({
          providerKey: 'betconstruct',
          product: 'casino',
          externalTransactionId: providerEconomicExternalId(rgsId, 'win'),
          relatedTransactionId: !isExactZero(withdrawAmount)
            ? providerEconomicExternalId(rgsId, 'bet')
            : null,
          kind: 'win',
          amount: exactToNumber(depositAmount),
          currency: binding.displayCurrency,
          occurredAt: new Date(ports.nowMs()).toISOString(),
        });
      }
      await recordCallback(ports, 'WithdrawAndDeposit', body, 'accepted', 0);
      return {
        ok: true,
        errorId: 0,
        balance: await ports.wallet.balanceOf(binding.walletId),
        currency: binding.displayCurrency,
        platformTransactionId,
        playerId: casinoPlayerIdFromPublicId(binding.playerPublicId).playerId,
      };
    });
  } catch (error) {
    const errorId = (error as { errorId?: number }).errorId ?? mapError(error);
    await recordCallback(ports, 'WithdrawAndDeposit', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}

async function reverseAccepted(
  ports: BetConstructWalletPorts,
  row: ProviderTransactionRecord,
  rollbackId: string,
): Promise<void> {
  if (row.status === 'rolled_back') return;
  const storage = walletStorageCurrency(row.displayCurrency);
  if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
  if (row.method === 'Withdraw') {
    await ports.wallet.applyEntry({
      walletId: row.walletId,
      signedAmountExact: row.amountExact,
      operation: 'CASINO_REFUND',
      idempotencyKey: `bc-casino-rollback:${rollbackId}:${row.externalTransactionId}`,
      currency: storage,
      allowBlocked: true,
    });
    await ports.ingestProvider({
      providerKey: 'betconstruct',
      product: 'casino',
      externalTransactionId: providerEconomicExternalId(rollbackId, 'rollback'),
      relatedTransactionId: row.externalTransactionId ?? rollbackId,
      kind: 'rollback',
      amount: exactToNumber(row.amountExact),
      currency: row.displayCurrency,
      occurredAt: new Date(ports.nowMs()).toISOString(),
    });
  } else if (row.method === 'Deposit') {
    await ports.wallet.applyEntry({
      walletId: row.walletId,
      signedAmountExact: `-${row.amountExact}`,
      operation: 'CASINO_BET',
      idempotencyKey: `bc-casino-rollback:${rollbackId}:${row.externalTransactionId}`,
      currency: storage,
      allowBlocked: true,
    });
    await ports.ingestProvider({
      providerKey: 'betconstruct',
      product: 'casino',
      externalTransactionId: providerEconomicExternalId(String(row.externalTransactionId), 'rollback'),
      relatedTransactionId: row.externalTransactionId ?? rollbackId,
      kind: 'rollback',
      amount: exactToNumber(row.amountExact),
      currency: row.displayCurrency,
      occurredAt: new Date(ports.nowMs()).toISOString(),
    });
  } else if (row.method === 'WithdrawAndDeposit') {
    const withdrawAmount = typeof row.metadata.withdrawAmount === 'string' ? row.metadata.withdrawAmount : '0';
    const depositAmount = typeof row.metadata.depositAmount === 'string' ? row.metadata.depositAmount : '0';
    if (!isExactZero(depositAmount)) {
      await ports.wallet.applyEntry({
        walletId: row.walletId,
        signedAmountExact: `-${depositAmount}`,
        operation: 'CASINO_BET',
        idempotencyKey: `bc-casino-rollback-win:${rollbackId}`,
        currency: storage,
        allowBlocked: true,
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: providerEconomicExternalId(rollbackId, 'rollback') + ':win',
        relatedTransactionId: providerEconomicExternalId(String(row.externalTransactionId), 'win'),
        kind: 'rollback',
        amount: exactToNumber(depositAmount),
        currency: row.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
    }
    if (!isExactZero(withdrawAmount)) {
      await ports.wallet.applyEntry({
        walletId: row.walletId,
        signedAmountExact: withdrawAmount,
        operation: 'CASINO_REFUND',
        idempotencyKey: `bc-casino-rollback-bet:${rollbackId}`,
        currency: storage,
        allowBlocked: true,
      });
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: providerEconomicExternalId(rollbackId, 'rollback') + ':bet',
        relatedTransactionId: providerEconomicExternalId(String(row.externalTransactionId), 'bet'),
        kind: 'rollback',
        amount: exactToNumber(withdrawAmount),
        currency: row.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
    }
  }
  row.status = 'rolled_back';
  await ports.transactions.save(row);
}

async function lookupCasinoSessionForRollback(
  ports: BetConstructWalletPorts,
  rawToken: string,
): Promise<SessionBinding | 'unknown'> {
  try {
    return await resolveBinding(ports, rawToken, 'casino', 'settlement', 'session');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INVALID_TOKEN' || code === 'TOKEN_INVALID') return 'unknown';
    throw error;
  }
}

export async function casinoRollback(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    return await ports.runAtomic(async () => {
      const rawToken = requireBodyToken(body);
      const binding = await lookupCasinoSessionForRollback(ports, rawToken);
      if (binding === 'unknown') {
        throw new Error('INVALID_TOKEN');
      }
      const rgsId = asText(body.RGSTransactionId);
      if (!rgsId) throw new Error('TRANSACTION_NOT_FOUND');
      const original = await ports.transactions.findCasinoFinancial(rgsId);
      if (!original || !rollbackOriginalEligible(original)) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }
      if (binding.playerAuthUserId !== original.playerAuthUserId) {
        throw new Error('WRONG_PLAYER_ID');
      }
      if (
        original.providerPlayerId != null
        && binding.providerPlayerId != null
        && original.providerPlayerId !== binding.providerPlayerId
      ) {
        throw new Error('WRONG_PLAYER_ID');
      }
      if (body.PlayerId != null && asText(body.PlayerId) !== '') {
        if (original.providerPlayerId != null && Number(body.PlayerId) !== original.providerPlayerId) {
          throw new Error('WRONG_PLAYER_ID');
        }
      }
      const existingRollback = await ports.transactions.find('casino', 'Rollback', rgsId);
      if (existingRollback || original.status === 'rolled_back') {
        await recordCallback(ports, 'Rollback', body, 'ignored', 0);
        return {
          ok: true,
          errorId: 0,
          replayed: true,
          platformTransactionId: existingRollback?.platformTransactionId ?? original.platformTransactionId ?? undefined,
          balance: await ports.wallet.balanceOf(original.walletId),
          currency: original.displayCurrency,
        };
      }
      const relatedWins = (await ports.transactions.listByRelated('casino', rgsId))
        .filter((row) => row.method === 'Deposit' && row.status === 'accepted');
      await reverseAccepted(ports, original, rgsId);
      for (const win of relatedWins) {
        ports.trip('casino_rollback_related_win');
        await reverseAccepted(ports, win, `${rgsId}:${win.externalTransactionId}`);
      }
      const platformTransactionId = await ports.transactions.nextPlatformTransactionId();
      await remember(ports, {
        product: 'casino',
        method: 'Rollback',
        externalTransactionId: rgsId,
        relatedTransactionId: rgsId,
        betId: null,
        providerPlayerId: original.providerPlayerId,
        playerAuthUserId: original.playerAuthUserId,
        walletId: original.walletId,
        displayCurrency: original.displayCurrency,
        amountExact: original.amountExact,
        requestFingerprint: financialFingerprint({ rgsId }),
        platformTransactionId,
        status: 'accepted',
        metadata: sanitize(body),
      });
      await recordCallback(ports, 'Rollback', body, 'accepted', 0);
      return {
        ok: true,
        errorId: 0,
        platformTransactionId,
        balance: await ports.wallet.balanceOf(original.walletId),
        currency: original.displayCurrency,
      };
    });
  } catch (error) {
    const errorId = mapError(error);
    await recordCallback(ports, 'Rollback', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}
