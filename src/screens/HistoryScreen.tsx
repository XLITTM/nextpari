import { useMemo, useState } from 'react';
import { Calendar, Plus, Tag, Ticket, TrendingUp } from 'lucide-react';
import type { BetHistoryEntry, Screen } from '../types';
import { useBetHistory } from '../BetHistoryContext';
import {
  filterHistoryEntries,
  formatStakeMoney,
  hasRealCashout,
  historyCardView,
  historyPeriodStats,
  playerStatusClass,
} from '../lib/betHistoryView';

interface HistoryScreenProps {
  onNavigate: (screen: Screen) => void;
  balance: number;
}

export function HistoryScreen({ onNavigate, balance }: HistoryScreenProps) {
  const { entries, loading } = useBetHistory();
  const [period, setPeriod] = useState<'all' | '30d'>('all');
  const [saleOnly, setSaleOnly] = useState(false);
  const canFilterSale = entries.some(hasRealCashout);

  const visible = useMemo(
    () => filterHistoryEntries(entries, period, saleOnly && canFilterSale),
    [entries, period, saleOnly, canFilterSale],
  );
  const stats = historyPeriodStats(visible);
  const filteredEmpty = !loading && entries.length > 0 && visible.length === 0;

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-28">
      <header className="bg-white dark:bg-[#1e293b] px-4 h-12 flex items-center">
        <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">История ставок</h1>
      </header>

      <div className="bg-white dark:bg-[#1e293b] px-4 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-medium">Основной</p>
            <p className="mt-0.5 text-xl font-extrabold text-gray-900 dark:text-white tabular-nums leading-none">
              {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'wallet' })}
            className="shrink-0 bg-gray-800 text-white rounded-xl px-3 py-1.5 text-sm font-medium flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
            Пополнить
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => setPeriod((current) => (current === '30d' ? 'all' : '30d'))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#0f172a] text-xs font-medium ${
              period === '30d' ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.8} />
            {period === '30d' ? 'За 30 дней' : 'Все время'}
          </button>
          {canFilterSale && (
            <button
              type="button"
              onClick={() => setSaleOnly((current) => !current)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#0f172a] text-xs font-medium ${
                saleOnly ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              <Tag className="w-3.5 h-3.5" strokeWidth={1.8} />
              Продажа
            </button>
          )}
        </div>
      </div>

      <div className="w-full px-4 py-2.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Статистика за период</p>
        <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
          Ставок: {stats.count} · Сумма: {formatStakeMoney(stats.stakeTotal)}
        </p>
      </div>

      {loading && visible.length === 0 ? (
        <div className="text-center py-16 text-sm font-bold text-gray-500">Загрузка...</div>
      ) : visible.length > 0 ? (
        <div className="px-3 space-y-2">
          {visible.map((bet) => (
            <HistoryItem
              key={bet.id}
              bet={bet}
              onOpen={() => onNavigate({ name: 'bet-details', betId: bet.id })}
            />
          ))}
        </div>
      ) : filteredEmpty ? (
        <p className="text-center py-16 text-sm font-bold text-gray-500">Нет ставок за выбранный период</p>
      ) : (
        <EmptyState onNavigate={onNavigate} />
      )}
    </div>
  );
}

function HistoryItem({
  bet,
  onOpen,
}: {
  bet: BetHistoryEntry;
  onOpen: () => void;
}) {
  const view = historyCardView(bet);

  return (
    <article
      className="bg-white dark:bg-[#1e293b] rounded-2xl px-3 py-2.5 shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
      onClick={onOpen}
    >
      <p className="text-[11px] text-gray-500 leading-none tabular-nums truncate">
        {view.dateTime} · №{view.couponNo}
      </p>
      <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{view.typeLabel}</p>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        <Row label="Коэффициент:" value={view.odds} />
        <Row label="Ставка:" value={view.stake} />
        <Row label="Возможный выигрыш:" value={view.potential} />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-gray-400">Статус:</dt>
          <dd className={`text-sm font-semibold ${playerStatusClass(view.status)}`}>{view.statusLabel}</dd>
        </div>
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white dark:bg-[#0f172a] flex items-center justify-center mb-5 shadow-sm">
        <Ticket className="w-10 h-10 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">История ставок пуста</h3>
      <p className="text-sm text-gray-600 dark:text-gray-200 mb-6 max-w-xs font-semibold">
        Вы ещё не сделали ни одной ставки. Выберите матч и сделайте свой первый прогноз!
      </p>
      <button
        onClick={() => onNavigate({ name: 'home' })}
        className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all active:scale-[0.98] flex items-center gap-2"
      >
        <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
        Сделать ставку
      </button>
    </div>
  );
}
