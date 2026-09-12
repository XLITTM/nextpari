import { useMemo, useState } from 'react';
import { Calendar, ChevronRight, Plus, Tag, Ticket, TrendingUp } from 'lucide-react';
import type { Screen } from '../types';
import { useBetHistory } from '../BetHistoryContext';
import {
  filterHistoryEntries,
  formatStakeMoney,
  historyPeriodStats,
} from '../lib/betHistoryView';
import { historyPeriodLabel } from '../lib/historyPeriodFilter';
import { setHistoryPeriodSelection, useHistoryPeriodSelection } from '../lib/historyPeriodStore';
import { BetHistoryCard } from '../components/history/BetHistoryCard';
import { HistoryPeriodSheet } from '../components/history/HistoryPeriodSheet';

interface HistoryScreenProps {
  onNavigate: (screen: Screen) => void;
  balance: number;
}

export function HistoryScreen({ onNavigate, balance }: HistoryScreenProps) {
  const { entries, loading } = useBetHistory();
  const period = useHistoryPeriodSelection();
  const [saleOnly, setSaleOnly] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const visible = useMemo(
    () => filterHistoryEntries(entries, period, saleOnly),
    [entries, period, saleOnly],
  );
  const stats = historyPeriodStats(visible);
  const filteredEmpty = !loading && entries.length > 0 && visible.length === 0;
  const periodLabel = historyPeriodLabel(period);

  return (
    <div className="np-page min-h-full px-3.5 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-3">
      <header className="flex h-12 items-center justify-center px-1">
        <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--np-text)]">История ставок</h1>
      </header>

      <section
        className="np-panel np-balance mt-2 overflow-hidden px-4 py-4"
        style={{
          background:
            'linear-gradient(180deg, var(--np-surface-mint) 0%, var(--np-surface-elevated) 42%, var(--np-surface) 100%)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--np-text-secondary)]">Основной</p>
            <p className="mt-1 text-[28px] font-black leading-none tabular-nums text-[var(--np-text)]">
              {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'wallet' })}
            className="np-press shrink-0 rounded-2xl bg-[var(--np-accent)] px-4 py-2.5 text-[15px] font-extrabold text-[var(--np-accent-ink)] shadow-[var(--np-glow)]"
          >
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" strokeWidth={2.8} />
              Пополнить
            </span>
          </button>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setPeriodOpen(true)}
          className="np-control np-press flex h-12 items-center justify-center gap-2 px-3 text-[14px] font-semibold text-[var(--np-text)]"
        >
          <Calendar className="h-4 w-4 shrink-0 text-[var(--np-accent)]" strokeWidth={2.2} />
          <span className="truncate">{periodLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => setSaleOnly((current) => !current)}
          className={`np-control np-press flex h-12 items-center justify-center gap-2 px-3 text-[14px] font-semibold ${
            saleOnly ? 'text-[var(--np-text)]' : 'text-[var(--np-text-secondary)]'
          }`}
        >
          <Tag className="h-4 w-4 text-[var(--np-accent)]" strokeWidth={2.2} />
          Продажа
        </button>
      </div>

      <div className="np-card mt-3 flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-[var(--np-text)]">Статистика за период</p>
          <p className="mt-1 text-[12px] tabular-nums text-[var(--np-text-secondary)]">
            Ставок: {stats.count} · {formatStakeMoney(stats.stakeTotal)}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--np-accent)]" strokeWidth={2.4} />
      </div>

      {loading && visible.length === 0 ? (
        <div className="py-16 text-center text-sm font-bold text-[var(--np-text-secondary)]">Загрузка...</div>
      ) : visible.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {visible.map((bet) => (
            <BetHistoryCard
              key={bet.id}
              bet={bet}
              onOpen={() => onNavigate({ name: 'bet-details', betId: bet.id })}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          onNavigate={onNavigate}
          supportingText={
            filteredEmpty
              ? 'За выбранный период ставок нет.'
              : 'Вы ещё не сделали ни одной ставки. Выберите матч и сделайте свой первый прогноз!'
          }
        />
      )}

      <HistoryPeriodSheet
        open={periodOpen}
        value={period}
        onApply={setHistoryPeriodSelection}
        onClose={() => setPeriodOpen(false)}
      />
    </div>
  );
}

function EmptyState({
  onNavigate,
  supportingText,
}: {
  onNavigate: (screen: Screen) => void;
  supportingText: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="np-card mb-5 flex h-20 w-20 items-center justify-center">
        <Ticket className="h-10 w-10 text-[var(--np-text-muted)]" strokeWidth={1.5} />
      </div>
      <h3 className="mb-1.5 text-base font-bold text-[var(--np-text)]">История ставок пуста</h3>
      <p className="mb-6 max-w-xs text-sm font-semibold text-[var(--np-text-secondary)]">
        {supportingText}
      </p>
      <button
        type="button"
        onClick={() => onNavigate({ name: 'home' })}
        className="np-press flex items-center gap-2 rounded-xl bg-[var(--np-accent)] px-6 py-3 text-sm font-bold text-[var(--np-accent-ink)]"
      >
        <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
        Сделать ставку
      </button>
    </div>
  );
}
