import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export interface WithdrawalReviewSummary {
  new: number;
  under_review: number;
  active: number;
}

export interface WithdrawalReviewRow {
  id: string;
  withdrawal_id: string;
  player_public_id: string;
  amount: number;
  currency: string;
  status: string;
  selected_cashier?: {
    display_name?: string;
    city?: string;
    label?: string;
  };
  selected_cashier_amount: number;
  cross_cashier_amount: number;
  attribution_snapshot: unknown;
  signals: Record<string, unknown>;
  created_at: string;
  decision_reason?: string;
  audit?: Array<{
    actor_role: string;
    previous_status: string;
    new_status: string;
    decision: string;
    internal_reason?: string;
    created_at: string;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function staffJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const raw = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || raw.ok === false) {
    throw new Error(String(raw.error || 'Ошибка'));
  }
  return raw;
}

export function createWithdrawalReviewApi(base: '/api/security' | '/api/owner') {
  return {
    async summary(): Promise<WithdrawalReviewSummary> {
      const rec = await staffJson(`${base}/withdrawal-reviews/summary`);
      const data = asRecord(rec.data ?? rec);
      return {
        new: Number(data.new ?? 0) || 0,
        under_review: Number(data.under_review ?? 0) || 0,
        active: Number(data.active ?? 0) || 0,
      };
    },
    async list(status?: string): Promise<WithdrawalReviewRow[]> {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const rec = await staffJson(`${base}/withdrawal-reviews${qs}`);
      const data = asRecord(rec.data ?? rec);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return rows as WithdrawalReviewRow[];
    },
    async get(id: string): Promise<WithdrawalReviewRow> {
      const rec = await staffJson(`${base}/withdrawal-reviews/${id}`);
      return asRecord(rec.data ?? rec) as unknown as WithdrawalReviewRow;
    },
    async start(id: string): Promise<void> {
      await staffJson(`${base}/withdrawal-reviews/${id}/start`, { method: 'POST', body: '{}' });
    },
    async approve(id: string, reason: string): Promise<void> {
      await staffJson(`${base}/withdrawal-reviews/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ reason, idempotencyKey: `review-approve:${id}:${Date.now()}` }),
      });
    },
    async reject(id: string, reason: string): Promise<void> {
      await staffJson(`${base}/withdrawal-reviews/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, idempotencyKey: `review-reject:${id}:${Date.now()}` }),
      });
    },
  };
}

export function WithdrawalAttributionReviewPanel({
  base,
}: {
  base: '/api/security' | '/api/owner';
}) {
  const api = useMemo(() => createWithdrawalReviewApi(base), [base]);
  const [tab, setTab] = useState<'required' | 'under_review' | 'approved' | 'rejected'>('required');
  const [summary, setSummary] = useState<WithdrawalReviewSummary>({ new: 0, under_review: 0, active: 0 });
  const [rows, setRows] = useState<WithdrawalReviewRow[]>([]);
  const [selected, setSelected] = useState<WithdrawalReviewRow | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'start' | 'approve' | 'reject' | null>(null);
  const busyRef = useRef(false);
  const reasonReady = reason.trim().length >= 1;
  const actionBusy = busyAction !== null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextRows] = await Promise.all([api.summary(), api.list(tab)]);
      setSummary(nextSummary);
      setRows(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [api, tab]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (kind: 'start' | 'approve' | 'reject') => {
    if (!selected || busyAction || busyRef.current) return;
    if ((kind === 'approve' || kind === 'reject') && reason.trim().length < 1) return;
    busyRef.current = true;
    setBusyAction(kind);
    setError('');
    try {
      if (kind === 'start') await api.start(selected.id);
      if (kind === 'approve') await api.approve(selected.id, reason);
      if (kind === 'reject') await api.reject(selected.id, reason);
      setReason('');
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-ink-900">Выводы на проверке</h2>
          <p className="text-xs text-gray-500">Только Security и Owner. Обновление каждые 15 сек.</p>
        </div>
        <button type="button" onClick={() => void load()} className="p-2 rounded-xl hover:bg-slate-100">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="flex gap-2 mb-4">
        {([
          ['required', `Новые${summary.new ? ` [${summary.new}]` : ''}`],
          ['under_review', `На рассмотрении${summary.under_review ? ` [${summary.under_review}]` : ''}`],
          ['approved', 'Одобрено'],
          ['rejected', 'Отклонено'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold ${tab === id ? 'bg-ink-900 text-white' : 'bg-white border'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border overflow-hidden">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => { setSelected(row); void api.get(row.id).then(setSelected).catch(() => setSelected(row)); }}
              className="w-full text-left px-4 py-3 border-b hover:bg-slate-50"
            >
              <p className="text-sm font-bold">Игрок {row.player_public_id} · {row.amount} {row.currency}</p>
              <p className="text-xs text-gray-500">
                Касса: {row.selected_cashier?.label || row.selected_cashier?.display_name || '—'}
                {' · '}cross {row.cross_cashier_amount}
              </p>
            </button>
          ))}
          {rows.length === 0 && <p className="p-4 text-sm text-gray-500">Нет заявок</p>}
        </div>
        {selected && (
          <div className="bg-white rounded-2xl border p-4 space-y-3">
            <p className="font-bold">Игрок {selected.player_public_id}</p>
            <p className="text-sm">Сумма {selected.amount} {selected.currency}</p>
            <p className="text-sm">Касса: {selected.selected_cashier?.city} · {selected.selected_cashier?.label}</p>
            <p className="text-sm">Доля выбранной кассы: {selected.selected_cashier_amount}</p>
            <p className="text-sm">Cross-cashier: {selected.cross_cashier_amount}</p>
            <pre className="text-[11px] bg-slate-50 rounded-xl p-3 overflow-auto max-h-48">
              {JSON.stringify({ attribution: selected.attribution_snapshot, signals: selected.signals, audit: selected.audit }, null, 2)}
            </pre>
            {(selected.status === 'required' || selected.status === 'under_review') && (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  maxLength={500}
                  placeholder="Внутренняя причина"
                  className="w-full bg-slate-50 rounded-xl p-3 text-sm"
                />
                {actionBusy && <p className="text-xs font-semibold text-gray-500">Обработка...</p>}
                <div className="flex gap-2">
                  {selected.status === 'required' && (
                    <button
                      type="button"
                      onClick={() => void act('start')}
                      disabled={actionBusy}
                      className="px-3 py-2 rounded-xl bg-slate-200 text-sm font-bold disabled:opacity-50"
                    >
                      {busyAction === 'start' ? 'Обработка...' : 'На рассмотрении'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void act('approve')}
                    disabled={actionBusy || !reasonReady}
                    className="px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busyAction === 'approve' ? 'Обработка...' : 'Одобрить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void act('reject')}
                    disabled={actionBusy || !reasonReady}
                    className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busyAction === 'reject' ? 'Обработка...' : 'Отклонить'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
