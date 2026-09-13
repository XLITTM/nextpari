import type { WithdrawalMethod, WithdrawalRequest } from '../types';

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
