import type { WithdrawalMethod, WithdrawalRequest, WithdrawalStatus } from '../types';

const LOCAL_KEY = 'nextpari.withdrawal_requests.v1';

function loadLocal(): WithdrawalRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WithdrawalRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(rows: WithdrawalRequest[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 100)));
}

function normalizeRow(row: Record<string, unknown>): WithdrawalRequest {
  return {
    id: String(row.id),
    method: String(row.method) as WithdrawalMethod,
    method_label: String(row.method_label ?? ''),
    amount: Number(row.amount) || 0,
    status: String(row.status ?? 'pending') as WithdrawalStatus,
    rejection_reason: row.rejection_reason == null ? null : String(row.rejection_reason),
    created_at: String(row.created_at ?? new Date().toISOString()),
    pin_code: row.pin_code == null && row.pinCode == null ? null : String(row.pin_code ?? row.pinCode),
    city: row.city == null ? null : String(row.city),
    point: row.point == null ? null : String(row.point),
    player_id:
      row.player_id == null && row.playerId == null ? null : String(row.player_id ?? row.playerId),
  };
}

export async function listWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  return loadLocal();
}

export async function createWithdrawalRequest(params: {
  method: WithdrawalMethod;
  methodLabel: string;
  amount: number;
  pinCode?: string;
  city?: string;
  point?: string;
  playerId?: string;
}): Promise<WithdrawalRequest> {
  const base: WithdrawalRequest = {
    id: crypto.randomUUID(),
    method: params.method,
    method_label: params.methodLabel,
    amount: params.amount,
    status: 'pending',
    rejection_reason: null,
    created_at: new Date().toISOString(),
  };

  const row: WithdrawalRequest = {
    ...base,
    pin_code: params.pinCode ?? base.pin_code ?? null,
    city: params.city ?? base.city ?? null,
    point: params.point ?? base.point ?? null,
    player_id: params.playerId ?? base.player_id ?? null,
  };

  const next = [row, ...loadLocal().filter((item) => item.id !== row.id)];
  saveLocal(next);
  return row;
}

/** Mark matching Mobcash withdrawal request as paid (approved / «Выплачено»). */
export function markWithdrawalPaidByPin(pinCode: string): void {
  if (!pinCode) return;
  const rows = loadLocal().map((row) =>
    row.pin_code === pinCode && row.status === 'pending'
      ? { ...row, status: 'approved' as const }
      : row,
  );
  saveLocal(rows);

}
