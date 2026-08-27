import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Building2, Landmark, TrendingUp, Wallet } from 'lucide-react';
import {
  fetchDashboardKpis,
  formatTmtmCompact,
  type DashboardKpis,
  type ManagerSession,
} from '../../lib/backoffice';
import { useBackofficeStore } from '../../stores/backofficeStore';

export function ManagerFinancePage({ session }: { session: ManagerSession }) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = useBackofficeStore((s) => s.managerLimit(session.id));
  const cashiers = useBackofficeStore((s) => s.cashiers.filter((row) => row.managerId === session.id));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setKpis(await fetchDashboardKpis(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить отчёт');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: 'Доступный лимит', value: limit, icon: Wallet },
    { label: 'Остаток во всех кассах', value: kpis?.floatTotal ?? cashiers.reduce((sum, row) => sum + row.floatBalance, 0), icon: Building2 },
    { label: 'Депозиты Мобкеш', value: kpis?.deposits ?? 0, icon: Landmark },
    { label: 'Выплаты наличными', value: kpis?.payouts ?? 0, icon: TrendingUp },
    { label: 'Оборот кассовой сети', value: kpis?.turnover ?? 0, icon: BarChart3 },
  ];

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Отчет по смене</h2>
          <p className="text-sm text-gray-500 mt-0.5">{session.networkName} · только ваши точки</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
        >
          {loading ? 'Обновление…' : 'Обновить'}
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((card) => (
          <article key={card.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 leading-snug pr-2">{card.label}</p>
              <card.icon className="w-4 h-4 text-brand-600 shrink-0" />
            </div>
            <p className="text-2xl font-black tabular-nums text-ink-900">{formatTmtmCompact(card.value)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
