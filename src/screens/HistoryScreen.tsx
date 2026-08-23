import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Filter, Calendar, Tag, Plus,
  Bell, MoreHorizontal, Layers, Ticket, TrendingUp,
} from 'lucide-react';
import type { BetHistoryEntry, Screen } from '../types';
import { useBetHistory } from '../BetHistoryContext';
import { SportIcon } from '../components/SportIcon';
import { betStatusLabel, couponNumber } from '../lib/betTicket';

interface HistoryScreenProps {
  onNavigate: (screen: Screen) => void;
  balance: number;
}

function statusClass(status: BetHistoryEntry['status']) {
  if (status === 'lost') return 'text-red-500';
  if (status === 'won') return 'text-green-500';
  return 'text-gray-500';
}

export function HistoryScreen({ onNavigate, balance }: HistoryScreenProps) {
  const { entries, loading } = useBetHistory();
  const [monthOpen, setMonthOpen] = useState(false);
  const [saleOnly, setSaleOnly] = useState(false);

  const visible = saleOnly
    ? entries.filter((b) => b.status === 'in_progress' && b.cashout)
    : entries;

  const periodSum = visible.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-28">
      <header className="bg-white dark:bg-[#1e293b] px-4 h-14 flex items-center justify-between">
        <button type="button" className="flex items-center gap-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">История ставок</h1>
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
        </button>
        <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-700 dark:text-gray-200" aria-label="Фильтр">
          <Filter className="w-5 h-5" strokeWidth={1.8} />
        </button>
      </header>

      <div className="bg-white dark:bg-[#1e293b] px-4 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-medium">Основной</p>
            <button type="button" className="flex items-center gap-1 mt-0.5">
              <span className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums leading-none">
                {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'wallet' })}
            className="shrink-0 bg-gray-800 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
            Пополнить
          </button>
        </div>

        <div className="flex gap-2 mt-4">
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

      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Статистика за период</p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
            Сумма ставок: {periodSum.toLocaleString('ru-RU')} TMTM
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {loading && visible.length === 0 ? (
        <div className="text-center py-16 text-sm font-bold text-gray-500">Загрузка...</div>
      ) : visible.length > 0 ? (
        <div className="px-4">
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

function HistoryItem({ bet, onOpen }: { bet: BetHistoryEntry; onOpen: () => void }) {
  const eventCount = bet.events.length;
  const isExpress = eventCount > 1 || bet.type === 'express';
  const typeLabel = isExpress ? `Экспресс (${eventCount} событий)` : 'Одинар';
  const receipt = couponNumber(bet.id, bet.ticketCode);
  const possibleWin = bet.payout || bet.amount * bet.totalOdds;
  const isLive = bet.status === 'in_progress' && bet.events.some((event) => event.isLive);

  return (
    <article
      className="bg-white dark:bg-[#1e293b] rounded-3xl p-4 shadow-sm mb-3 flex flex-col gap-2 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {isExpress ? (
            <Layers className="w-6 h-6 text-[#4ade80] shrink-0 mt-0.5" strokeWidth={1.5} />
          ) : (
            <SportIcon sport="football" className="w-6 h-6 text-[#4ade80] shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 leading-tight">
              {bet.date} · № {receipt}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-sm font-bold text-gray-900 dark:text-white">{typeLabel}</p>
              {isLive && (
                <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded leading-none">
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ChevronRight className="w-5 h-5 text-gray-400" strokeWidth={1.8} />
          <span
            role="button"
            tabIndex={0}
            className="w-8 h-8 flex items-center justify-center text-gray-400"
            aria-label="Уведомления"
            onClick={(e) => e.stopPropagation()}
          >
            <Bell className="w-4 h-4" strokeWidth={1.8} />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="w-8 h-8 flex items-center justify-center text-gray-400"
            aria-label="Ещё"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-1.5 mt-1">
        <Row label="Коэффициент:" value={bet.totalOdds.toFixed(2)} />
        <Row label="Ставка:" value={`${bet.amount.toLocaleString('ru-RU')} TMTM`} />
        <Row
          label="Возможный выигрыш:"
          value={bet.status === 'lost' ? '0 TMTM' : `${Number(possibleWin.toFixed(2)).toLocaleString('ru-RU')} TMTM`}
        />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-gray-400">Статус:</dt>
          <dd className={`text-sm font-semibold ${statusClass(bet.status)}`}>{betStatusLabel(bet.status)}</dd>
        </div>
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-400">{label}</dt>
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
