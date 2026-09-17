import { randomUUID } from 'node:crypto';
import {
  BETCONSTRUCT_CASINO_SESSION_TTL_MAX_MS,
  BETCONSTRUCT_CASINO_SESSION_TTL_MS,
  BETCONSTRUCT_SESSION_EXTEND_MS,
} from './constants.js';
import { casinoPlayerIdFromPublicId } from './casinoPlayerId.js';
import { providerDisplayCurrency } from './currency.js';
import { digestAuthToken } from './tokenDigest.js';
import type {
  BetConstructProduct,
  BetConstructTokenKind,
  BetConstructWalletPorts,
  SessionBinding,
} from './types.js';

export { digestAuthToken };
export { createCasinoSessionToken, CASINO_SESSION_TOKEN_MAX_LEN } from './sessionToken.js';

export function casinoSessionExpiresAtMs(
  nowMs: number,
  ttlMs = BETCONSTRUCT_CASINO_SESSION_TTL_MS,
): number {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('SESSION_EXPIRY_INVALID');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > BETCONSTRUCT_CASINO_SESSION_TTL_MAX_MS) {
    throw new Error('SESSION_EXPIRY_INVALID');
  }
  return nowMs + ttlMs;
}

export function bindingIsRevoked(binding: SessionBinding): boolean {
  return binding.revokedAtMs != null;
}

export function bindingIsExpired(binding: SessionBinding, nowMs: number): boolean {
  return nowMs >= binding.expiresAtMs;
}

export async function persistLaunchBinding(
  ports: BetConstructWalletPorts,
  input: {
    product: BetConstructProduct;
    rawToken: string;
    playerAuthUserId: string;
    playerPublicId: string;
    walletId: string;
    displayCurrency: string;
    issuedAtMs: number;
    expiresAtMs: number;
    tokenKind?: BetConstructTokenKind;
  },
): Promise<SessionBinding> {
  const displayCurrency = providerDisplayCurrency(input.displayCurrency);
  if (!displayCurrency) throw new Error('CURRENCY_UNSUPPORTED');
  const casinoId = input.product === 'casino'
    ? casinoPlayerIdFromPublicId(input.playerPublicId).playerId
    : null;
  return ports.sessions.insert({
    id: randomUUID(),
    product: input.product,
    tokenKind: input.tokenKind ?? 'launch',
    tokenDigest: digestAuthToken(input.rawToken),
    playerAuthUserId: input.playerAuthUserId,
    playerPublicId: input.playerPublicId,
    walletId: input.walletId,
    displayCurrency,
    providerPlayerId: casinoId,
    createdAtMs: input.issuedAtMs,
    expiresAtMs: input.expiresAtMs,
    lastSeenAtMs: input.issuedAtMs,
    revokedAtMs: null,
    metadata: {},
  });
}

export async function resolveBinding(
  ports: BetConstructWalletPorts,
  rawToken: string,
  product: BetConstructProduct,
  mode: 'new_play' | 'settlement',
  tokenKind?: BetConstructTokenKind,
): Promise<SessionBinding> {
  const digest = digestAuthToken(rawToken);
  const binding = await ports.sessions.findByDigest(digest);
  if (!binding || binding.product !== product || bindingIsRevoked(binding)) {
    throw new Error(product === 'casino' ? 'INVALID_TOKEN' : 'TOKEN_INVALID');
  }
  if (tokenKind && binding.tokenKind !== tokenKind) {
    throw new Error(product === 'casino' ? 'INVALID_TOKEN' : 'TOKEN_INVALID');
  }
  const now = ports.nowMs();
  if (mode === 'new_play' && bindingIsExpired(binding, now)) {
    throw new Error(product === 'casino' ? 'INVALID_TOKEN' : 'TOKEN_EXPIRED');
  }
  return binding;
}

export async function touchBinding(
  ports: BetConstructWalletPorts,
  binding: SessionBinding,
  extend: boolean,
): Promise<SessionBinding> {
  const now = ports.nowMs();
  const next: SessionBinding = {
    ...binding,
    lastSeenAtMs: now,
    expiresAtMs: extend && !bindingIsExpired(binding, now)
      ? now + BETCONSTRUCT_SESSION_EXTEND_MS
      : binding.expiresAtMs,
  };
  await ports.sessions.save(next);
  return next;
}
