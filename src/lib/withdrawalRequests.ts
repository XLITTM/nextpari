import type { WithdrawalMethod, WithdrawalRequest, WithdrawalStatus } from '../types';
import { retainIdempotencyKey } from '../shared/staff/financeGate';

export const PLAYER_WITHDRAWALS_PATH = '/api/player/withdrawals';

const STATUSES = new Set<WithdrawalStatus>([
  'pending',
  'approved',
  'paid',
  'rejected',
  'cancelled',
  'expired',
]);

let createSlot: { key: string; fingerprint: string } | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapStatus(value: unknown): WithdrawalStatus {
  const status = str(value, 'pending') as WithdrawalStatus;
  return STATUSES.has(status) ? status : 'pending';
}

function mapRow(raw: unknown): WithdrawalRequest {
  const item = asRecord(raw);
  const method = str(item.method, 'other') as WithdrawalMethod;
  return {
    id: str(item.id),
    method: ['card', 'crypto', 'ewallet', 'cash', 'other'].includes(method) ? method : 'other',
    method_label: str(item.method_label ?? item.methodLabel),
    amount: num(item.amount),
    status: mapStatus(item.status),
    rejection_reason: item.rejection_reason == null && item.rejectionReason == null
      ? null
      : str(item.rejection_reason ?? item.rejectionReason),
    created_at: str(item.created_at ?? item.createdAt ?? item.requested_at),
    pin_code: item.pin_code == null && item.pinCode == null && item.code == null
      ? null
      : str(item.pin_code ?? item.pinCode ?? item.code),
    city: item.cash_pickup_city == null && item.city == null ? null : str(item.cash_pickup_city ?? item.city),
    point: item.cash_pickup_point == null && item.point == null ? null : str(item.cash_pickup_point ?? item.point),
    player_id: item.player_public_id == null ? null : str(item.player_public_id),
  };
}

function mapError(code: string): string {
  if (code === 'AUTH_REQUIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
    return 'Требуется вход в аккаунт';
  }
  if (code === 'AMOUNT_NOT_POSITIVE' || code === 'AMOUNT_SCALE_INVALID') {
    return 'Введите корректную сумму';
  }
  if (code === 'CASH_WITHDRAWAL_BELOW_MIN') return 'Минимальная сумма вывода — 40.00 TMTM';
  if (code === 'INSUFFICIENT_AVAILABLE_BALANCE') return 'Недостаточно средств на балансе';
  if (code === 'CASH_PICKUP_REQUIRED') return 'Выберите город и точку выдачи';
  if (code === 'DESTINATION_REQUIRED') return 'Заполните реквизиты для вывода';
  if (code === 'OPERATIONAL_ACCOUNT_NOT_ACTIVE') return 'Вывод через кассу временно недоступен.';
  if (code === 'IDEMPOTENCY_KEY_CONFLICT') return 'Повтор запроса с другими данными отклонён';
  if (code === 'CARD_WITHDRAWAL_PROVIDER_REQUIRED') return 'Вывод на карту временно недоступен';
  return code || 'Ошибка при создании заявки';
}

async function playerWithdrawalJson(init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(PLAYER_WITHDRAWALS_PATH, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const raw = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || raw.ok === false) {
    throw new Error(mapError(str(raw.error, 'WITHDRAWAL_FAILED')));
  }
  return raw;
}

export async function listWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const rec = await playerWithdrawalJson({ method: 'GET' });
  const data = asRecord(rec.data);
  const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(rec.rows) ? rec.rows : [];
  return rows.map(mapRow);
}

export async function createWithdrawalRequest(params: {
  method: WithdrawalMethod;
  methodLabel: string;
  amount: number;
  destinationRef?: string;
  city?: string;
  point?: string;
}): Promise<WithdrawalRequest> {
  const fingerprint = JSON.stringify({
    method: params.method,
    amount: params.amount,
    destinationRef: params.destinationRef ?? '',
    city: params.city ?? '',
    point: params.point ?? '',
  });
  createSlot = retainIdempotencyKey(createSlot, fingerprint);
  const rec = await playerWithdrawalJson({
    method: 'POST',
    body: JSON.stringify({
      method: params.method,
      methodLabel: params.methodLabel,
      amount: params.amount,
      destinationRef: params.destinationRef ?? null,
      cashPickupCity: params.city ?? null,
      cashPickupPoint: params.point ?? null,
      idempotencyKey: createSlot.key,
    }),
  });
  const data = rec.data ?? rec;
  createSlot = null;
  return mapRow(data);
}
