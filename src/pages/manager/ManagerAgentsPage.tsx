import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Snowflake, Unlock } from 'lucide-react';
import {
  fetchManagerCashiers,
  fetchManagerFinance,
  formatTmtmCompact,
  type BackofficeCashier,
  type ManagerFinanceOverview,
} from '../../manager/services';

export function ManagerAgentsPage({
  onNotice,
}: {
  onNotice: (value: string) => void;
}) {
  const [cashiers, setCashiers] = useState<BackofficeCashier[]>([]);
  const [finance, setFinance] = useState<ManagerFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, overview] = await Promise.all([
        fetchManagerCashiers(),
        fetchManagerFinance().catch(() => null),
      ]);
      setCashiers(rows);
      setFinance(overview);
    } catch (err) {
      setCashiers([]);
      setFinance(null);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить кассы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const opById = new Map((finance?.cashiers ?? []).map((row) => [row.cashierId, row]));
  const activationPending = finance?.activationPending !== false;

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Мои кассы и кассиры</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Загрузка…' : `${cashiers.length} точек · создание и деньги недоступны до канонического перевода`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>
      <p className="mb-4 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
        Financial activation pending. Пополнение и инкассация отключены, пока operational accounts в staging.
      </p>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Имя точки / кассира</th>
              <th className="px-4 py-3">Адрес точки</th>
              <th className="px-4 py-3 text-right">Операционный остаток</th>
              <th className="px-4 py-3 text-right">Доход за смену</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cashiers.map((row) => {
              const op = opById.get(row.id);
              return (
                <tr key={row.id || row.login} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-bold text-ink-900">{row.pointName || 'Точка'}</p>
                    <p className="text-xs text-gray-500">{row.fullName || 'Кассир'} · {row.login || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.city || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-extrabold tabular-nums">
                      {formatTmtmCompact(op?.availableBalance)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      legacy float (diagnostic): {formatTmtmCompact(op?.legacyFloatBalance ?? row.floatBalance)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-700">
                    {formatTmtmCompact(row.commissionEarned)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {row.isActive ? 'Активна' : 'Заблокирована'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        disabled
                        title="Financial activation pending"
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
                      >
                        Пополнить
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Financial activation pending"
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
                      >
                        Инкассация
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === row.id}
                        onClick={async () => {
                          setPendingId(row.id);
                          setError('');
                          try {
                            await setManagerCashierFrozen({ cashierId: row.id, frozen: row.isActive });
                            onNotice(row.isActive ? `Касса ${row.fullName || row.login} заблокирована` : `Касса ${row.fullName || row.login} разблокирована`);
                            await load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                          } finally {
                            setPendingId(null);
                          }
                        }}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-50 ${
                          row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {row.isActive ? 'Блокировать' : 'Разблокировать'}
                      </button>
                    </div>
                    {activationPending && (
                      <p className="text-[10px] text-amber-700 mt-1 text-right">Financial activation pending</p>
                    )}
                  </td>
                </tr>
              );
            })}
            {cashiers.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  {error ? 'Кассы недоступны' : 'Касс в вашей сети пока нет'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
