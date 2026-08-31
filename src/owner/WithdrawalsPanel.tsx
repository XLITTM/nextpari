import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { fetchOwnerWithdrawals, formatBackofficeDateTime, formatTmtmCompact, type OwnerWithdrawalRow } from './services';

export function WithdrawalsPanel() {
  const [rows, setRows] = useState<OwnerWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

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

  const badge = (value: string) => {
    if (value === 'paid') {
      return { label: 'Выплачено', className: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    }
    if (value === 'cancelled') {
      return { label: 'Отменено', className: 'bg-slate-100 text-slate-700', icon: Ban };
    }
    return { label: 'Ожидает', className: 'bg-amber-100 text-amber-700', icon: Clock3 };
  };

  return (
    <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Заявки на выплату</h3>
          <p className="text-xs text-gray-500 mt-0.5">JWT owner_list_withdrawals · cashier_payout_requests · только чтение</p>
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
            <option value="paid">Выплачено</option>
            <option value="cancelled">Отменено</option>
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
                <th className="px-2 py-2 font-bold">Сумма</th>
                <th className="px-2 py-2 font-bold">Статус</th>
                <th className="px-2 py-2 font-bold">Кассир</th>
                <th className="px-2 py-2 font-bold">Выплачено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const item = badge(row.status);
                const StatusIcon = item.icon;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-3 whitespace-nowrap text-xs font-medium text-gray-600">
                      {row.createdAt ? formatBackofficeDateTime(row.createdAt) : '—'}
                    </td>
                    <td className="px-2 py-3 font-semibold text-ink-900">
                      {row.playerPublicId ? `#${row.playerPublicId}` : '—'}
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
                    <td className="px-2 py-3 text-xs font-medium text-gray-600">
                      {row.cashierId ? row.cashierId.slice(0, 8) : '—'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-xs font-medium text-gray-600">
                      {row.paidAt ? formatBackofficeDateTime(row.paidAt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] font-semibold text-amber-800">
        Только чтение. Approve / reject / payout execution недоступны.
      </p>
    </div>
  );
}
