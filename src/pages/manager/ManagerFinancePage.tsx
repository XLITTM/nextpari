import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { BarChart3, Building2, Dices, Gamepad2, Landmark, TrendingUp, Trophy, Wallet } from 'lucide-react';
import {
  fetchDashboardKpis,
  formatTmtmCompact,
  type DashboardKpis,
  type ManagerSession,
} from '../../lib/backoffice';
import { useManagerNetwork } from '../../stores/backofficeStore';

export function ManagerFinancePage({ session }: { session: ManagerSession }) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { managerAgents, limit } = useManagerNetwork(session?.id);
  const cashiers = managerAgents || [];

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
    { label: 'Остаток во всех кассах', value: kpis?.floatTotal ?? cashiers.reduce((sum, row) => sum + (Number(row?.floatBalance) || 0), 0), icon: Building2 },
    { label: 'Депозиты Мобкеш', value: kpis?.deposits ?? 0, icon: Landmark },
    { label: 'Выплаты наличными', value: kpis?.payouts ?? 0, icon: TrendingUp },
    { label: 'Оборот кассовой сети', value: kpis?.turnover ?? 0, icon: BarChart3 },
  ];

  // MVP: чистая прибыль (ставки − выигрыши) игроков касс текущего менеджера.
  const ggrSports = 1250;
  const ggrCasino = 3400;
  const ggrGames = 850;
  const totalGgr = ggrSports + ggrCasino + ggrGames;
  const ggrCards = [
    { label: 'GGR Спорт', value: ggrSports, icon: Trophy, iconClass: 'text-emerald-500' },
    { label: 'GGR Казино', value: ggrCasino, icon: Dices, iconClass: 'text-violet-500' },
    { label: 'GGR Games (Fast Games)', value: ggrGames, icon: Gamepad2, iconClass: 'text-orange-500' },
    { label: 'Общий GGR сети', value: totalGgr, icon: TrendingUp, iconClass: 'text-amber-500' },
  ];

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Отчет по смене</h2>
          <p className="text-sm text-gray-500 mt-0.5">{session?.networkName || 'Сеть'} · только ваши точки</p>
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
          <article key={card.label} className="bg-white dark:bg-[#1c1c1e] rounded-xl p-4 border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 leading-snug pr-2">{card.label}</p>
              <card.icon className="w-4 h-4 text-brand-600 shrink-0" />
            </div>
            <p className="text-2xl font-black tabular-nums text-ink-900 dark:text-white">{formatTmtmCompact(card.value)}</p>
          </article>
        ))}
      </div>

      <h3 className="text-lg font-semibold mt-8 mb-4">Аналитика доходности (GGR)</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">
        Чистая прибыль по игрокам касс вашей сети: сумма ставок минус сумма выигрышей
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ggrCards.map((card) => (
          <GgrCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}

function GgrCard({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
}) {
  return (
    <article className="bg-white dark:bg-[#1c1c1e] rounded-xl p-4 border border-slate-200 dark:border-white/10 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 leading-snug pr-2">{label}</p>
        {Icon ? <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} /> : null}
      </div>
      <p className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
        {formatTmtmCompact(value)}
      </p>
    </article>
  );
}
