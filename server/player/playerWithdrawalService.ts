import { staffError } from '../staff/errors.js';
import {
  livePlayerGamePorts,
  runPlayerGameRpc,
  type PlayerGameGatewayPorts,
} from './playerGamesService.js';
import type { PlayerAuthHttpResult } from './playerAuthService.js';

const METHODS = new Set(['cash', 'card', 'crypto', 'ewallet', 'other']);
const AMOUNT_SCALE_TOLERANCE = 1e-8;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function requireText(value: unknown, code: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw staffError(code, 400);
  return text;
}

function requireAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw staffError('AMOUNT_NOT_POSITIVE', 400);
  const cents = n * 100;
  if (Math.abs(cents - Math.round(cents)) > AMOUNT_SCALE_TOLERANCE) {
    throw staffError('AMOUNT_SCALE_INVALID', 400);
  }
  return Math.round(cents) / 100;
}

function stripBrowserAuthority(body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  delete copy.auth_user_id;
  delete copy.authUserId;
  delete copy.wallet_id;
  delete copy.walletId;
  delete copy.player_id;
  delete copy.playerId;
  delete copy.cashier_id;
  delete copy.cashierId;
  delete copy.manager_id;
  delete copy.managerId;
  delete copy.network_id;
  delete copy.networkId;
  delete copy.balance;
  delete copy.status;
  delete copy.approved_by;
  delete copy.approvedBy;
  delete copy.paid_by;
  delete copy.paidBy;
  return copy;
}

function wrapOk(result: PlayerAuthHttpResult): PlayerAuthHttpResult {
  return {
    ...result,
    body: { ok: true, data: result.body },
  };
}

export async function createPlayerWithdrawal(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const rec = stripBrowserAuthority(asRecord(body));
  const method = requireText(rec.method, 'WITHDRAWAL_METHOD_INVALID').toLowerCase();
  if (!METHODS.has(method)) throw staffError('WITHDRAWAL_METHOD_INVALID', 400);
  if (method === 'card') throw staffError('CARD_WITHDRAWAL_PROVIDER_REQUIRED', 400);
  const amount = requireAmount(rec.amount);
  return wrapOk(await runPlayerGameRpc(ports, cookieHeader, secure, 'player_create_withdrawal', {
    p_method: method,
    p_amount: amount,
    p_idempotency_key: requireText(rec.idempotencyKey ?? rec.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'),
    p_method_label: requireText(rec.methodLabel ?? rec.method_label, 'METHOD_LABEL_REQUIRED'),
    p_destination_ref: rec.destinationRef ?? rec.destination_ref ?? rec.detail ?? null,
    p_cash_pickup_city: rec.cashPickupCity ?? rec.cash_pickup_city ?? rec.city ?? null,
    p_cash_pickup_point: rec.cashPickupPoint ?? rec.cash_pickup_point ?? rec.point ?? null,
    p_metadata: {},
    p_payout_destination_id: rec.payoutDestinationId ?? rec.payout_destination_id ?? rec.destinationId ?? null,
  }));
}

export async function listPlayerWithdrawals(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return wrapOk(await runPlayerGameRpc(ports, cookieHeader, secure, 'player_list_withdrawals', {}));
}

export async function listPlayerCashPayoutDestinations(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return wrapOk(await runPlayerGameRpc(ports, cookieHeader, secure, 'player_list_cash_payout_destinations', {}));
}

export function livePlayerWithdrawalPorts(): PlayerGameGatewayPorts {
  return livePlayerGamePorts();
}
