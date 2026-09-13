import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { retainIdempotencyKey } from '../shared/staff/financeGate';
import {
  approveOwnerWithdrawal,
  fetchOwnerWithdrawals,
  formatBackofficeDateTime,
  formatTmtmCompact,
  markOwnerWithdrawalPaid,
  rejectOwnerWithdrawal,
  type OwnerWithdrawalRow,
} from './services';

export function WithdrawalsPanel() {
  const [rows, setRows] = useState<OwnerWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionSlot, setActionSlot] = useState<{ key: string; fingerprint: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchOwnerWithdrawals({
        status: status || null,
        limit: 100,
        offset: 0,
      });
      setRows(page.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    fingerprint: string,
    work: (key: string) => Promise<void>,
  ) => {
    const slot = retainIdempotencyKey(actionSlot, fingerprint);
    setActionSlot(slot);
    await work(slot.key);
    setActionSlot(null);
    await load();
  };

  const badge = (value: string) => {
    if (value === 'paid') {
      return { label: 'Выплачено', className: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    }
    if (value === 'approved') {
      return { label: 'Одобрено', className: 'bg-blue-100 text-blue-700', icon: CheckCircle2 };
    }
    if (value === 'rejected' || value === 'cancelled' || value === 'expired') {
      return { label: value === 'rejected' ? 'Отклонено' : value === 'expired' ? 'Истекло' : 'Отменено', className: 'bg-slate-100 text-slate-700', icon: Ban };
    }
    return { label: 'Ожидает', className: 'bg-amber-100 text-amber-700', icon: Clock3 };
  };

  const destinationText = (row: OwnerWithdrawalRow): string => {
    if (row.method === 'cash') {
      const parts = [row.cashPickupCity, row.cashPickupPoint].filter((part) => Boolean(part && part.trim()));
      return parts.length ? parts.join(' · ') : '—';
    }
    if (row.method === 'card') {
      return row.destinationRef ? `**** ${row.destinationRef}` : '—';
    }
    return row.destinationRef?.trim() || '—';
  };

  return (
    <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Заявки на выплату</h3>
          <p className="text-xs text-gray-500 mt-0.5">JWT owner withdrawals · wallet ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-xl outline-none"
            aria-label="Статус заявок"
          >
            <option value="">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="approved">Одобрено</option>
            <option value="paid">Выплачено</option>
            <option value="rejected">Отклонено</option>
            <option value="cancelled">Отменено</option>
            <option value="expired">Истекло</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-ink-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>
      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <label className="mb-3 block text-xs font-bold text-ink-700">
        Причина отклонения
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
          placeholder="Обязательна для reject"
        />
      </label>
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">Загрузка заявок…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Заявок на выплату пока нет</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2 font-bold">Дата</th>
                <th className="px-2 py-2 font-bold">Игрок</th>
                <th className="px-2 py-2 font-bold">Метод</th>
                <th className="px-2 py-2 font-bold">Реквизиты</th>
                <th className="px-2 py-2 font-bold">Сумма</th>
                <th className="px-2 py-2 font-bold">Статус</th>
                <th className="px-2 py-2 font-bold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const item = badge(row.status);
                const StatusIcon = item.icon;
                const cash = row.method === 'cash';
                const card = row.method === 'card';
                const pending = row.status === 'pending';
                const approved = row.status === 'approved';
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-3 whitespace-nowrap text-xs font-medium text-gray-600">
                      {row.createdAt ? formatBackofficeDateTime(row.createdAt) : '—'}
                    </td>
                    <td className="px-2 py-3 font-semibold text-ink-900">
                      {row.playerPublicId ? `#${row.playerPublicId}` : '—'}
                    </td>
                    <td className="px-2 py-3 text-xs font-medium text-gray-700">
                      {row.methodLabel || row.method || '—'}
                    </td>
                    <td className="px-2 py-3 text-xs font-medium text-gray-700 max-w-[220px] truncate" title={destinationText(row)}>
                      {destinationText(row)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap font-extrabold tabular-nums text-red-600">
                      − {formatTmtmCompact(row.amount)}
                    </td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${item.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {item.label}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-1">
                        {!cash && !card && pending && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => {
                              setBusyId(row.id);
                              setError('');
                              void runAction(`approve:${row.id}`, (key) => approveOwnerWithdrawal(row.id, key))
                                .catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))
                                .finally(() => setBusyId(''));
                            }}
                            className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700"
                          >
                            Approve
                          </button>
                        )}
                        {(pending || approved) && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => {
                              if (!reason.trim()) {
                                setError('Укажите причину отклонения');
                                return;
                              }
                              setBusyId(row.id);
                              setError('');
                              void runAction(`reject:${row.id}:${reason.trim()}`, (key) => (
                                rejectOwnerWithdrawal(row.id, reason.trim(), key)
                              ))
                                .catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))
                                .finally(() => setBusyId(''));
                            }}
                            className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700"
                          >
                            Reject
                          </button>
                        )}
                        {!cash && !card && approved && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => {
                              setBusyId(row.id);
                              setError('');
                              void runAction(`paid:${row.id}`, (key) => markOwnerWithdrawalPaid(row.id, key))
                                .catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))
                                .finally(() => setBusyId(''));
                            }}
                            className="rounded-lg bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700"
                          >
                            Mark paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
