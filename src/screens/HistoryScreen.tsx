import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Filter, Calendar, Tag, Plus,
  Bell, MoreHorizontal, Ticket, TrendingUp,
} from 'lucide-react';
import type { BetHistoryEntry, Screen } from '../types';
import { useBetHistory } from '../BetHistoryContext';
import {
  formatStakeMoney,
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
  const [monthOpen, setMonthOpen] = useState(false);
  const [saleOnly, setSaleOnly] = useState(false);

  const visible = saleOnly
    ? entries.filter((b) => (b.status === 'in_progress' || b.status === 'pending' || b.status === 'accepted') && b.cashout)
    : entries;

  const stats = historyPeriodStats(visible);

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-28">
      <header className="bg-white dark:bg-[#1e293b] px-4 h-12 flex items-center justify-between">
        <button type="button" className="flex items-center gap-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">История ставок</h1>
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
        </button>
        <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-700 dark:text-gray-200" aria-label="Фильтр">
          <Filter className="w-5 h-5" strokeWidth={1.8} />
        </button>
      </header>

      <div className="bg-white dark:bg-[#1e293b] px-4 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-medium">Основной</p>
            <button type="button" className="flex items-center gap-1 mt-0.5">
              <span className="text-xl font-extrabold text-gray-900 dark:text-white tabular-nums leading-none">
                {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
            </button>
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
            onClick={() => setMonthOpen(!monthOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#0f172a] text-xs font-medium ${
              monthOpen ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.8} />
            За месяц
          </button>
          <button
            type="button"
            onClick={() => setSaleOnly(!saleOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#0f172a] text-xs font-medium ${
              saleOnly ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Tag className="w-3.5 h-3.5" strokeWidth={1.8} />
            Продажа
          </button>
        </div>
      </div>

      <button type="button" className="w-full flex items-center justify-between px-4 py-2.5">
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Статистика за период</p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
            Ставок: {stats.count} · {formatStakeMoney(stats.stakeTotal)}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500 leading-none tabular-nums truncate">
          {view.dateTime} · №{view.couponNo}
        </p>
        <div className="flex items-center shrink-0">
          <span
            role="button"
            tabIndex={0}
            className="w-7 h-7 flex items-center justify-center text-gray-400"
            aria-label="Уведомления"
            onClick={(e) => e.stopPropagation()}
          >
            <Bell className="w-3.5 h-3.5" strokeWidth={1.8} />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="w-7 h-7 flex items-center justify-center text-gray-400"
            aria-label="Ещё"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
          </span>
        </div>
      </div>

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
