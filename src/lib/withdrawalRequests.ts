import { supabase } from './supabase';
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
  const local = loadLocal();
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to load withdrawals:', error.message);
    return local;
  }
  const remote = (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
  const remoteIds = new Set(remote.map((row) => row.id));
  const merged = [...remote, ...local.filter((row) => !remoteIds.has(row.id))];
  // Prefer local pin/city/point overlays for matching ids / pins.
  const byPin = new Map(
    local
      .filter((row) => row.pin_code)
      .map((row) => [row.pin_code as string, row] as const),
  );
  const hydrated = merged.map((row) => {
    const localMatch =
      local.find((item) => item.id === row.id) ||
      (row.pin_code ? byPin.get(row.pin_code) : undefined) ||
      (row.method_label?.includes('Mobcash')
        ? local.find((item) => item.method_label === row.method_label && item.amount === row.amount)
        : undefined);
    if (!localMatch) return row;
    return {
      ...row,
      pin_code: row.pin_code || localMatch.pin_code,
      city: row.city || localMatch.city,
      point: row.point || localMatch.point,
      player_id: row.player_id || localMatch.player_id,
      status: localMatch.status === 'approved' ? 'approved' : row.status,
    };
  });
  hydrated.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return hydrated;
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
  const payload = {
    method: params.method,
    method_label: params.methodLabel,
    amount: params.amount,
    status: 'pending' as const,
  };

  let { data, error } = await supabase
    .from('withdrawal_requests')
    .insert(payload)
    .select('*')
    .maybeSingle();

  // Older schemas reject method='cash' — keep Mobcash label on ewallet.
  if (error && params.method === 'cash') {
    ({ data, error } = await supabase
      .from('withdrawal_requests')
      .insert({ ...payload, method: 'ewallet' })
      .select('*')
      .maybeSingle());
  }

  const base: WithdrawalRequest = !error && data
    ? normalizeRow(data as Record<string, unknown>)
    : {
        id: crypto.randomUUID(),
        method: params.method,
        method_label: params.methodLabel,
        amount: params.amount,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
      };

  if (error) {
    console.error('Failed to insert withdrawal_requests:', error.message);
  }

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

  const matched = rows.find((row) => row.pin_code === pinCode);
  if (!matched) return;
  // Remote table may not have pin_code — update the matching row by id when available.
  void supabase
    .from('withdrawal_requests')
    .update({ status: 'approved' })
    .eq('id', matched.id)
    .eq('status', 'pending')
    .then(({ error }) => {
      if (error) console.error('Failed to update withdrawal status:', error.message);
    });
}
