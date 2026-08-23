import { useState, useEffect } from 'react';
import {
  X, Trash2, ChevronDown, CheckCircle, Plus,
  Search, Layers, SlidersHorizontal, Upload, MoreVertical,
  Download, Copy, Check, Loader2,
} from 'lucide-react';
import { useBetSlip } from '../BetSlipContext';
import { useBetHistory } from '../BetHistoryContext';
import { useWallet } from '../WalletContext';
import { useToast } from '../ToastContext';
import { placeBet } from '../lib/bets';
import type { OddsUpdate } from '../lib/liveBetGuard';
import { couponHasLive, LIVE_BET_DELAY_MS, waitLiveBetDelay } from '../lib/liveBetGuard';
import { buildPlacedBet } from '../betslipLogic';
import { SportIcon } from '../components/SportIcon';
import type { BetSelection, Screen } from '../types';

interface BetSlipScreenProps {
  balance: number;
  onClose: () => void;
  onNavigateHome: () => void;
  onNavigate: (screen: Screen) => void;
}

const QUICK_ADDS = [10, 50, 100];

function formatStartTime(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} (${hh}:${min})`;
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const MOCK_SELECTIONS: Omit<BetSelection, 'id'>[] = [
  {
    matchId: 'mock-1',
    matchLabel: 'Реал Мадрид — Барселона',
    market: 'Исход',
    outcome: 'П1',
    odds: 2.15,
    sport: 'football',
    startTime: Date.now() + 3600000,
  },
  {
    matchId: 'mock-2',
    matchLabel: 'Манчестер Сити — Ливерпуль',
    market: 'Тотал',
    outcome: 'ТБ 2.5',
    odds: 1.85,
    sport: 'football',
    startTime: Date.now() + 7200000,
  },
];

function SelectionMeta({ s }: { s: BetSelection }) {
  return (
    <div className="flex items-center text-xs text-gray-400 dark:text-gray-200 mt-1 ml-[30px]">
      {s.isLive ? (
        <>
          <span className="text-red-500 font-bold bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded text-[10px] mr-1.5 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
          {s.liveStatus && (
            <span className="text-red-500 font-semibold mr-1.5">{s.liveStatus}</span>
          )}
        </>
      ) : (
        s.startTime != null && (
          <span className="text-gray-400 dark:text-gray-200 mr-1.5">
            {formatStartTime(s.startTime)}
          </span>
        )
      )}
      <span className="text-gray-400 dark:text-gray-200">· {s.market}</span>
    </div>
  );
}

export function BetSlipScreen({ balance, onClose, onNavigateHome, onNavigate }: BetSlipScreenProps) {
  const { selections, removeSelection, clearAll, addSelection, applyOddsUpdates } = useBetSlip();
  const { addBet, refresh: refreshHistory } = useBetHistory();
  const { applyBalance } = useWallet();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'express' | 'single'>('express');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [placedTicketCode, setPlacedTicketCode] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<{ count: number; odds: number; win: number } | null>(null);
  const [stake, setStake] = useState<number>(10);
  const [sheetAnim, setSheetAnim] = useState(false);
  const [confirmAnim, setConfirmAnim] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveAcceptMs, setLiveAcceptMs] = useState<number | null>(null);
  const [oddsPrompt, setOddsPrompt] = useState<OddsUpdate[] | null>(null);

  // Action sheet (three-dot menu)
  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  // Save coupon modal
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load coupon modal
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [loadCode, setLoadCode] = useState('');
  const [loadError, setLoadError] = useState('');

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const potentialWin = mode === 'express'
    ? stake * totalOdds
    : selections.reduce((acc, s) => acc + stake * s.odds, 0);

  useEffect(() => {
    if (actionSheetOpen || savedCode || loadModalOpen) {
      setSheetAnim(false);
      const t = requestAnimationFrame(() => setSheetAnim(true));
      return () => cancelAnimationFrame(t);
    }
  }, [actionSheetOpen, savedCode, loadModalOpen]);

  useEffect(() => {
    if (showSuccess) {
      setConfirmAnim(false);
      const t = requestAnimationFrame(() => setConfirmAnim(true));
      return () => cancelAnimationFrame(t);
    }
  }, [showSuccess]);

  const submitCoupon = async (skipDelay = false, overrideSelections?: BetSelection[]) => {
    if (submitting) return;
    const slip = overrideSelections ?? selections;
    setSubmitting(true);
    setOddsPrompt(null);
    try {
      if (!skipDelay && couponHasLive(slip)) {
        await waitLiveBetDelay(LIVE_BET_DELAY_MS, setLiveAcceptMs);
        setLiveAcceptMs(null);
      }
      const result = await placeBet({ selections: slip, stake, mode });
      if (!result.ok) {
        if (result.reason === 'odds_changed' && result.updates?.length) {
          setOddsPrompt(result.updates);
          showToast(result.error);
          return;
        }
        showToast(result.error);
        return;
      }

      applyBalance(result.newBalance);
      void refreshHistory();
      const entry = buildPlacedBet({
        type: mode,
        selections: slip,
        stake,
        totalOdds,
        potentialWin,
      });
      addBet(entry);
      setSuccessSummary({ count: slip.length, odds: totalOdds, win: potentialWin });
      setPlacedTicketCode(entry.ticketCode ?? null);
      clearAll();
      setShowSuccess(true);
      showToast('Ставка принята!');
    } finally {
      setLiveAcceptMs(null);
      setSubmitting(false);
    }
  };

  const handleConfirmBet = () => {
    void submitCoupon(false);
  };

  const acceptNewOdds = () => {
    if (!oddsPrompt) return;
    const next = selections.map((row) => {
      const update = oddsPrompt.find((item) => item.id === row.id);
      return update ? { ...row, odds: update.odds } : row;
    });
    applyOddsUpdates(oddsPrompt.map((row) => ({ id: row.id, odds: row.odds })));
    setOddsPrompt(null);
    void submitCoupon(true, next);
  };

  const handleSuccessDone = () => {
    setShowSuccess(false);
    setPlacedTicketCode(null);
    setSuccessSummary(null);
    onNavigateHome();
  };

  const handleQuickAdd = (amt: number) => {
    setStake(amt);
  };

  const handleMax = () => setStake(balance);

  const handleSaveCoupon = () => {
    setActionSheetOpen(false);
    const code = generateCode();
    setSavedCode(code);
    setCopied(false);
  };

  const handleCopyCode = () => {
    if (savedCode) {
      navigator.clipboard?.writeText(savedCode).catch(() => {});
      setCopied(true);
    }
  };

  const handleLoadCoupon = () => {
    if (loadCode.trim().length === 0) {
      setLoadError('Введите код купона');
      return;
    }
    setLoadError('');
    setLoadModalOpen(false);
    setLoadCode('');
    MOCK_SELECTIONS.forEach((sel) => {
      addSelection({ ...sel, id: `${sel.matchId}-${sel.outcome}-${Date.now()}` });
    });
  };

  // Success screen
  if (showSuccess) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center px-4 py-16 transition-colors">
        <div
          className={`flex flex-col items-center transition-all duration-500 ${confirmAnim ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
        >
          <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white mb-1">Ставка принята!</p>
          <p className="text-sm text-gray-400 dark:text-gray-200 text-center mb-1">
            {successSummary?.count ?? 0} {(successSummary?.count ?? 0) === 1 ? 'событие' : 'событий'} · коэф.{' '}
            {(successSummary?.odds ?? 0).toFixed(2)}
          </p>
          <p className="text-sm font-bold text-green-600 mb-2">
            Возможный выигрыш: {Math.round(successSummary?.win ?? 0)} TMTM
          </p>
          {placedTicketCode && (
            <p className="text-sm font-bold text-brand-600 mb-6 tabular-nums">
              Код «Непобедимый»: {placedTicketCode}
            </p>
          )}
          {!placedTicketCode && <div className="mb-6" />}
          <button
            onClick={handleSuccessDone}
            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm px-10 py-3.5 rounded-xl active:scale-95 transition-transform"
          >
            Готово
          </button>
        </div>
      </div>
    );
  }

  // === EMPTY STATE ===
  if (selections.length === 0) {
    return (
      <>
        <div className="min-h-full bg-gray-100 dark:bg-gray-900 flex flex-col transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-200">
              <X className="w-5 h-5" />
            </button>
            <span className="font-bold text-gray-900 dark:text-white">Купон</span>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
            {/* Empty message */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-[#1e293b] flex items-center justify-center mb-3 transition-colors">
                <CheckCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mb-1">Ваш купон ставок пуст</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[240px]">
                Выберите события и нажмите на коэффициент, чтобы добавить ставку
              </p>
            </div>

            {/* Action cards */}
            <EmptyCard
              icon={<Plus className="w-5 h-5" />}
              title="Пополнить счет"
              subtitle={`${balance.toFixed(2)} TMTM`}
              onClick={() => onNavigate({ name: 'wallet' })}
            />
            <EmptyCard
              icon={<Search className="w-5 h-5" />}
              title="Поиск событий"
              onClick={onNavigateHome}
            />
            <EmptyCard
              icon={<Layers className="w-5 h-5" />}
              title="Экспресс дня"
              onClick={onNavigateHome}
            />
            <EmptyCard
              icon={<SlidersHorizontal className="w-5 h-5" />}
              title="Генерация купона"
              onClick={() => {
                MOCK_SELECTIONS.forEach((sel) => {
                  addSelection({ ...sel, id: `${sel.matchId}-${sel.outcome}-${Date.now()}` });
                });
              }}
            />
            <EmptyCard
              icon={<Upload className="w-5 h-5" />}
              title="Загрузить купон"
              onClick={() => setLoadModalOpen(true)}
            />
          </div>
        </div>

        {/* Load coupon modal (from empty state) */}
        {loadModalOpen && (
          <CouponCodeModal
            value={loadCode}
            onChange={setLoadCode}
            error={loadError}
            onClose={() => { setLoadModalOpen(false); setLoadCode(''); setLoadError(''); }}
            onSubmit={handleLoadCoupon}
            sheetAnim={sheetAnim}
          />
        )}
      </>
    );
  }

  // === FILLED STATE ===
  return (
    <>
      <div className="min-h-full bg-gray-100 dark:bg-gray-900 flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-200">
            <X className="w-5 h-5" />
          </button>

          {/* Mode dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white text-base"
            >
              {mode === 'express' ? 'Экспресс' : 'Ординар'}
              <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-gray-200 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-9 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-600 shadow-xl py-1 w-40 transition-colors">
                  <button
                    onClick={() => { setMode('express'); setDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                      mode === 'express' ? 'text-brand-600 font-bold' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Экспресс
                    {mode === 'express' && <CheckCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => { setMode('single'); setDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                      mode === 'single' ? 'text-brand-600 font-bold' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Ординар
                    {mode === 'single' && <CheckCircle className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Trash + three-dot menu */}
          <div className="flex items-center gap-1">
            <button
              onClick={clearAll}
              className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-200 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActionSheetOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Selections list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 pb-64">
          {selections.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-[#1e293b] rounded-xl shadow-sm p-4 animate-slide-up transition-colors relative"
            >
              <button
                onClick={() => removeSelection(s.matchId, s.outcome)}
                className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-2.5 pr-8">
                <div className="shrink-0 mt-0.5">
                  <SportIcon sport={s.sport ?? 'all'} className="w-6 h-6 text-[#4ade80]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{s.matchLabel}</p>
                </div>
              </div>

              <SelectionMeta s={s} />

              <div className="mt-2.5 bg-gray-50 dark:bg-[#1e293b] border border-gray-100 dark:border-gray-600 rounded-lg p-2.5 flex justify-between items-center">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{s.market}:</span>
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400 truncate">{s.outcome}</span>
                </div>
                <span className="text-lg font-extrabold text-gray-900 dark:text-white tabular-nums shrink-0">
                  {s.odds.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Fixed bottom bar */}
        <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-[#1e293b] border-t border-gray-200 dark:border-gray-700 px-4 pt-3 pb-3 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-700 dark:text-gray-200 font-bold">
              События: <span className="font-bold text-gray-900 dark:text-white">{selections.length}</span>
            </span>
            <span className="text-xs text-gray-700 dark:text-gray-200 font-bold">
              {mode === 'express' ? 'Коэффициент' : 'Сумма коэф.'}:{' '}
              <span className="font-bold text-brand-600 tabular-nums">{totalOdds.toFixed(3)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
              className="flex-1 bg-gray-100 dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2.5 text-center text-base font-extrabold text-gray-900 dark:text-white outline-none tabular-nums"
            />
            <span className="text-xs font-bold text-gray-500 shrink-0">TMTM</span>
          </div>
          <div className="flex gap-2 mb-2">
            {QUICK_ADDS.map((amt) => (
              <button
                key={`bar-${amt}`}
                onClick={() => handleQuickAdd(amt)}
                className={`flex-1 font-bold text-xs rounded-lg py-2 active:scale-95 transition-transform border ${
                  stake === amt
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-gray-100 dark:bg-[#0f172a] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                }`}
              >
                {amt}
              </button>
            ))}
            <button
              onClick={handleMax}
              className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-xs rounded-lg py-2 active:scale-95 transition-transform"
            >
              MAX
            </button>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-700 dark:text-gray-200 font-bold">
              Возможный выигрыш:{' '}
              <span className="font-bold text-gray-900 dark:text-white tabular-nums">
                {potentialWin.toFixed(2)} TMTM
              </span>
            </span>
          </div>
          <button
            onClick={() => void handleConfirmBet()}
            disabled={submitting}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-base py-4 rounded-xl active:scale-[0.98] transition-transform shadow-lg disabled:opacity-60"
          >
            {liveAcceptMs != null ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Приём ставки... {Math.max(1, Math.ceil(liveAcceptMs / 1000))}
              </span>
            ) : submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Проверка котировок...
              </span>
            ) : (
              'Сделать ставку'
            )}
          </button>
        </div>

        {oddsPrompt && (
          <div className="fixed inset-0 z-[140] max-w-lg mx-auto flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOddsPrompt(null)} />
            <div className="relative m-4 w-full rounded-2xl bg-white dark:bg-[#1e293b] p-4 shadow-2xl">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                Коэффициент изменился. Принять новые условия?
              </h3>
              <ul className="mt-3 space-y-2">
                {oddsPrompt.map((row) => (
                  <li key={row.id} className="rounded-xl bg-gray-50 dark:bg-[#0f172a] px-3 py-2 text-sm">
                    <p className="font-bold text-gray-900 dark:text-white truncate">{row.matchLabel}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{row.outcome}</p>
                    <p className="mt-1 font-extrabold tabular-nums text-amber-600">
                      {row.previousOdds.toFixed(2)} → {row.odds.toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOddsPrompt(null)}
                  className="rounded-xl border border-gray-200 dark:border-gray-600 py-3 text-sm font-bold text-gray-700 dark:text-gray-200"
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  onClick={acceptNewOdds}
                  className="rounded-xl bg-brand-600 py-3 text-sm font-bold text-white"
                >
                  Принять
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action sheet (three-dot menu) */}
        {actionSheetOpen && (
          <div className="fixed inset-0 z-[120] max-w-lg mx-auto flex flex-col justify-end">
            <div
              className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${sheetAnim ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setActionSheetOpen(false)}
            />
            <div
              className={`relative bg-white dark:bg-[#1e293b] rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
                sheetAnim ? 'translate-y-0' : 'translate-y-full'
              }`}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Выберите действие</h3>
                <button
                  onClick={() => setActionSheetOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 pb-6 space-y-2">
                <ActionSheetItem
                  icon={<Download className="w-5 h-5" />}
                  label="Сохранить купон"
                  onClick={handleSaveCoupon}
                />
                <ActionSheetItem
                  icon={<Upload className="w-5 h-5" />}
                  label="Загрузить купон"
                  onClick={() => { setActionSheetOpen(false); setLoadModalOpen(true); }}
                />
                <ActionSheetItem
                  icon={<SlidersHorizontal className="w-5 h-5" />}
                  label="Генерация купона"
                  onClick={() => {
                    setActionSheetOpen(false);
                    clearAll();
                    MOCK_SELECTIONS.forEach((sel) => {
                      addSelection({ ...sel, id: `${sel.matchId}-${sel.outcome}-${Date.now()}` });
                    });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Save coupon modal */}
        {savedCode && (
          <div className="fixed inset-0 z-[130] max-w-lg mx-auto flex flex-col justify-end">
            <div
              className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${sheetAnim ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setSavedCode(null)}
            />
            <div
              className={`relative bg-white dark:bg-[#1e293b] rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
                sheetAnim ? 'translate-y-0' : 'translate-y-full'
              }`}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Код вашего купона</h3>
                <button
                  onClick={() => setSavedCode(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 pb-6">
                <div className="bg-gray-50 dark:bg-[#0f172a] rounded-2xl p-6 flex flex-col items-center mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-2">Сохраните этот код</p>
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-[0.3em] tabular-nums">
                    {savedCode}
                  </p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className={`w-full font-bold text-base py-4 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  }`}
                >
                  {copied ? (
                    <><Check className="w-5 h-5" /> Скопировано</>
                  ) : (
                    <><Copy className="w-5 h-5" /> Скопировать</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Load coupon modal */}
        {loadModalOpen && (
          <CouponCodeModal
            value={loadCode}
            onChange={setLoadCode}
            error={loadError}
            onClose={() => { setLoadModalOpen(false); setLoadCode(''); setLoadError(''); }}
            onSubmit={handleLoadCoupon}
            sheetAnim={sheetAnim}
          />
        )}
      </div>
    </>
  );
}

// === Sub-components ===

function EmptyCard({
  icon, title, subtitle, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 text-gray-600 dark:text-gray-200">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <ChevronDown className="w-5 h-5 text-gray-300 dark:text-gray-600 -rotate-90 shrink-0" />
    </button>
  );
}

function ActionSheetItem({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-gray-50 dark:bg-[#0f172a] rounded-xl p-3.5 active:scale-[0.98] transition-transform text-left"
    >
      <div className="w-9 h-9 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center shrink-0 text-gray-600 dark:text-gray-200 shadow-sm">
        {icon}
      </div>
      <span className="text-sm font-bold text-gray-900 dark:text-white">{label}</span>
    </button>
  );
}

function CouponCodeModal({
  value, onChange, error, onClose, onSubmit, sheetAnim,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  sheetAnim: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[130] max-w-lg mx-auto flex flex-col justify-end">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${sheetAnim ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative bg-white dark:bg-[#1e293b] rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          sheetAnim ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Введите код купона</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pb-6">
          {error && (
            <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="Например, 7X9K2"
            maxLength={10}
            className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3.5 text-center text-xl font-extrabold tracking-[0.2em] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-brand-600 transition-colors mb-4"
          />
          <button
            onClick={onSubmit}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-base py-4 rounded-xl active:scale-[0.98] transition-transform"
          >
            Загрузить
          </button>
        </div>
      </div>
    </div>
  );
}
