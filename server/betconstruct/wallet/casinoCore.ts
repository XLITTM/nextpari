import { randomUUID } from 'node:crypto';
import { CASINO_ERROR } from './constants.js';
import { assertPlayerIdMatches, casinoPlayerIdFromPublicId } from './casinoPlayerId.js';
import { casinoPublicKeyIsValid } from './casinoPublicKey.js';
import { money2, providerDisplayCurrency, walletStorageCurrency } from './currency.js';
import { financialFingerprint, payloadHash, providerEconomicExternalId } from './fingerprint.js';
import { resolveBinding, touchBinding } from './session.js';
import type {
  BetConstructWalletPorts,
  CasinoCoreResult,
  ProviderTransactionRecord,
  SessionBinding,
} from './types.js';

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('AMOUNT_INVALID');
  return money2(n);
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
  if (code === 'CURRENCY_MISMATCH' || code === 'AMOUNT_INVALID') return CASINO_ERROR.WRONG_TRANSACTION_AMOUNT;
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

export async function casinoAuthentication(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    const binding = await touchBinding(
      ports,
      await resolveBinding(ports, rawToken, 'casino', 'new_play'),
      false,
    );
    await requireNewCasinoPlay(ports, binding);
    const playerId = casinoPlayerIdFromPublicId(binding.playerPublicId).playerId;
    if (body.PlayerId != null && asText(body.PlayerId) !== '') {
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    }
    await recordCallback(ports, 'Authentication', body, 'accepted', 0);
    return {
      ok: true,
      errorId: 0,
      token: rawToken,
      playerId,
      currency: binding.displayCurrency,
      balance: await ports.wallet.balanceOf(binding.walletId),
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
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    const binding = await resolveBinding(ports, rawToken, 'casino', 'new_play');
    if (body.PlayerId != null && asText(body.PlayerId) !== '') {
      assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    }
    if (body.CurrencyId != null && asText(body.CurrencyId) !== '') {
      const incoming = providerDisplayCurrency(asText(body.CurrencyId));
      if (incoming !== binding.displayCurrency) throw new Error('CURRENCY_MISMATCH');
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

async function duplicateOrConflict(
  existing: ProviderTransactionRecord,
  fingerprint: string,
  duplicateError: number,
): Promise<CasinoCoreResult | null> {
  if (existing.requestFingerprint !== fingerprint) {
    return casinoFail(CASINO_ERROR.WRONG_TRANSACTION_AMOUNT);
  }
  if (existing.status === 'accepted' || existing.status === 'rolled_back') {
    return {
      ok: false,
      errorId: duplicateError,
      replayed: true,
      platformTransactionId: existing.platformTransactionId ?? undefined,
    };
  }
  return casinoFail(duplicateError);
}

export async function casinoWithdraw(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    const binding = await resolveBinding(ports, rawToken, 'casino', 'new_play');
    assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    if (body.CurrencyId != null && asText(body.CurrencyId) !== '') {
      if (providerDisplayCurrency(asText(body.CurrencyId)) !== binding.displayCurrency) {
        throw new Error('CURRENCY_MISMATCH');
      }
    }
    await requireNewCasinoPlay(ports, binding);
    const amount = asAmount(body.Amount);
    if (amount <= 0) throw new Error('AMOUNT_INVALID');
    const rgsId = asText(body.RGSTransactionId);
    if (!rgsId) throw new Error('TRANSACTION_ID_INVALID');
    const fingerprint = financialFingerprint({
      rgsId,
      amount,
      walletId: binding.walletId,
      currency: binding.displayCurrency,
      playerId: body.PlayerId,
    });
    const existing = await ports.transactions.find('casino', 'Withdraw', rgsId);
    if (existing) {
      const dup = await duplicateOrConflict(existing, fingerprint, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
      await recordCallback(ports, 'Withdraw', body, 'ignored', dup?.errorId ?? 110);
      return dup ?? casinoFail(CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    }
    const storage = walletStorageCurrency(binding.displayCurrency);
    if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
    await ports.wallet.applyEntry({
      walletId: binding.walletId,
      signedAmount: money2(-amount),
      operation: 'CASINO_BET',
      idempotencyKey: `bc-casino-withdraw:${rgsId}`,
      currency: storage,
      metadata: { phase: 'Withdraw' },
    });
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
      amount,
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
      amount,
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
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    const binding = await resolveBinding(ports, rawToken, 'casino', 'settlement');
    assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    if (body.CurrencyId != null && asText(body.CurrencyId) !== '') {
      if (providerDisplayCurrency(asText(body.CurrencyId)) !== binding.displayCurrency) {
        throw new Error('CURRENCY_MISMATCH');
      }
    }
    const amount = asAmount(body.Amount);
    if (amount <= 0) throw new Error('AMOUNT_INVALID');
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
    const existing = await ports.transactions.find('casino', 'Deposit', rgsId);
    if (existing) {
      const dup = await duplicateOrConflict(existing, fingerprint, CASINO_ERROR.DEPOSIT_ALREADY_RECEIVED);
      await recordCallback(ports, 'Deposit', body, 'ignored', dup?.errorId ?? 111);
      return dup ?? casinoFail(CASINO_ERROR.DEPOSIT_ALREADY_RECEIVED);
    }
    const storage = walletStorageCurrency(binding.displayCurrency);
    if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
    await ports.wallet.applyEntry({
      walletId: binding.walletId,
      signedAmount: amount,
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
      amount,
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
      amount,
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
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    rejectBonus(body);
    const binding = await resolveBinding(ports, rawToken, 'casino', 'new_play');
    assertPlayerIdMatches(binding.playerPublicId, body.PlayerId);
    await requireNewCasinoPlay(ports, binding);
    const withdrawAmount = asAmount(body.WithdrawAmount ?? body.BetAmount ?? body.Amount);
    const depositAmount = asAmount(body.DepositAmount ?? body.WinAmount ?? 0);
    if (withdrawAmount <= 0 && depositAmount <= 0) throw new Error('AMOUNT_INVALID');
    const rgsId = asText(body.RGSTransactionId);
    if (!rgsId) throw new Error('TRANSACTION_ID_INVALID');
    const fingerprint = financialFingerprint({
      rgsId,
      withdrawAmount,
      depositAmount,
      walletId: binding.walletId,
      currency: binding.displayCurrency,
    });
    const existing = await ports.transactions.find('casino', 'WithdrawAndDeposit', rgsId);
    if (existing) {
      const dup = await duplicateOrConflict(existing, fingerprint, CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
      await recordCallback(ports, 'WithdrawAndDeposit', body, 'ignored', dup?.errorId ?? 110);
      return dup ?? casinoFail(CASINO_ERROR.TRANSACTION_ALREADY_COMPLETE);
    }
    const storage = walletStorageCurrency(binding.displayCurrency);
    if (!storage) throw new Error('CURRENCY_UNSUPPORTED');
    if (withdrawAmount > 0) {
      await ports.wallet.applyEntry({
        walletId: binding.walletId,
        signedAmount: money2(-withdrawAmount),
        operation: 'CASINO_BET',
        idempotencyKey: `bc-casino-wad-bet:${rgsId}`,
        currency: storage,
        metadata: { phase: 'WithdrawAndDeposit', leg: 'bet' },
      });
    }
    if (depositAmount > 0) {
      await ports.wallet.applyEntry({
        walletId: binding.walletId,
        signedAmount: depositAmount,
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
      amount: money2(depositAmount - withdrawAmount),
      requestFingerprint: fingerprint,
      platformTransactionId,
      status: 'accepted',
      metadata: { ...sanitize(body), withdrawAmount, depositAmount },
    });
    if (withdrawAmount > 0) {
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: providerEconomicExternalId(rgsId, 'bet'),
        kind: 'bet',
        amount: withdrawAmount,
        currency: binding.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
    }
    if (depositAmount > 0) {
      await ports.ingestProvider({
        providerKey: 'betconstruct',
        product: 'casino',
        externalTransactionId: providerEconomicExternalId(rgsId, 'win'),
        relatedTransactionId: withdrawAmount > 0 ? providerEconomicExternalId(rgsId, 'bet') : null,
        kind: 'win',
        amount: depositAmount,
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
      signedAmount: row.amount,
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
      amount: row.amount,
      currency: row.displayCurrency,
      occurredAt: new Date(ports.nowMs()).toISOString(),
    });
  } else if (row.method === 'Deposit') {
    await ports.wallet.applyEntry({
      walletId: row.walletId,
      signedAmount: money2(-row.amount),
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
      amount: row.amount,
      currency: row.displayCurrency,
      occurredAt: new Date(ports.nowMs()).toISOString(),
    });
  } else if (row.method === 'WithdrawAndDeposit') {
    const withdrawAmount = Number(row.metadata.withdrawAmount ?? 0);
    const depositAmount = Number(row.metadata.depositAmount ?? 0);
    if (depositAmount > 0) {
      await ports.wallet.applyEntry({
        walletId: row.walletId,
        signedAmount: money2(-depositAmount),
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
        amount: depositAmount,
        currency: row.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
    }
    if (withdrawAmount > 0) {
      await ports.wallet.applyEntry({
        walletId: row.walletId,
        signedAmount: withdrawAmount,
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
        amount: withdrawAmount,
        currency: row.displayCurrency,
        occurredAt: new Date(ports.nowMs()).toISOString(),
      });
    }
  }
  row.status = 'rolled_back';
  await ports.transactions.save(row);
}

export async function casinoRollback(
  ports: BetConstructWalletPorts,
  body: Record<string, unknown>,
  sharedKey: string,
  rawToken: string,
): Promise<CasinoCoreResult> {
  try {
    assertPublicKey(body, sharedKey);
    const rgsId = asText(body.RGSTransactionId);
    if (!rgsId) throw new Error('TRANSACTION_NOT_FOUND');
    const original = await ports.transactions.find('casino', 'Withdraw', rgsId)
      ?? await ports.transactions.find('casino', 'Deposit', rgsId)
      ?? await ports.transactions.find('casino', 'WithdrawAndDeposit', rgsId);
    let binding: SessionBinding | null = null;
    try {
      binding = await resolveBinding(ports, rawToken, 'casino', 'settlement');
    } catch {
      binding = null;
    }
    if (!original) {
      await recordCallback(ports, 'Rollback', body, 'rejected', binding ? CASINO_ERROR.TRANSACTION_NOT_FOUND : CASINO_ERROR.INVALID_TOKEN);
      return casinoFail(binding ? CASINO_ERROR.TRANSACTION_NOT_FOUND : CASINO_ERROR.INVALID_TOKEN);
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
      };
    }
    const relatedWins = (await ports.transactions.listByRelated('casino', rgsId))
      .filter((row) => row.method === 'Deposit' && row.status === 'accepted');
    await reverseAccepted(ports, original, rgsId);
    for (const win of relatedWins) {
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
      amount: original.amount,
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
  } catch (error) {
    const errorId = mapError(error);
    await recordCallback(ports, 'Rollback', body, 'rejected', errorId);
    return casinoFail(errorId);
  }
}
