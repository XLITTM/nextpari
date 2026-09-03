import { useState, useEffect } from 'react';
import { X, Plus, Minus, Loader2 } from 'lucide-react';
import { useQuickBet } from '../QuickBetContext';
import { useToast } from '../ToastContext';
import { useWallet } from '../WalletContext';
import { useBetHistory } from '../BetHistoryContext';
import { placeBet } from '../lib/bets';
import { acceptLsportsSelection } from '../lib/sportsOddGuard';
import { formatOdds } from '../lib/matchOdds';
import { formatPlayerMoney } from '../WalletContext';

const QUICK_AMOUNTS = [4, 40, 100];

export function QuickBetSheet() {
  const { pendingSelection, closeQuickBet } = useQuickBet();
  const { toast } = useToast();
  const { balance, available, applyServerBalance, refresh } = useWallet();
  const { refresh: refreshHistory } = useBetHistory();
  const [stake, setStake] = useState<number>(20);
  const [animateIn, setAnimateIn] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);

  useEffect(() => {
    if (pendingSelection) {
      setStake(20);
      setIsPlacing(false);
      setAnimateIn(false);
      const t = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(t);
    }
  }, [pendingSelection]);

  if (!pendingSelection) return null;
  const selection = acceptLsportsSelection(pendingSelection);
  if (!selection) return null;

  const potentialWin = stake * selection.odds;

  const handlePlaceBet = async () => {
    if (isPlacing) return;
    setIsPlacing(true);
    try {
      const result = await placeBet({
        selections: [selection],
        stake,
        mode: 'single',
        skipLiveCheck: true,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      applyServerBalance(result.newBalance);
      void refresh();
      void refreshHistory();
      toast.success('Ставка успешно принята!');
      closeQuickBet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось принять ставку');
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] max-w-lg mx-auto flex flex-col justify-end">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeQuickBet}
      />

      <div
        className={`relative bg-white dark:bg-[#1e293b] rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          animateIn ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-[#1e293b]" />
        </div>

        <div className="flex items-start justify-between px-4 pt-2 pb-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-200">
                {selection.market}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-200">→</span>
              <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
                {selection.outcome}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums mt-1">
              {formatOdds(selection.odds)}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-200 mt-1 truncate">
              {selection.matchLabel}
            </p>
          </div>
          <button
            onClick={closeQuickBet}
            className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-white dark:text-gray-900" strokeWidth={2.5} />
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-200">
            Баланс{' '}
            <span className="font-bold text-gray-900 dark:text-white">
              {formatPlayerMoney(balance, available)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <div className="flex items-center flex-1 bg-gray-100 dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setStake((s) => Math.max(1, s - 1))}
              className="px-3 py-3 text-gray-600 dark:text-gray-200 active:scale-90 transition-transform"
            >
              <Minus className="w-4 h-4" strokeWidth={2.2} />
            </button>
            <input
              type="number"
              value={stake}
              onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
              className="flex-1 bg-transparent text-gray-900 dark:text-white text-base font-bold text-center outline-none tabular-nums w-full min-w-0"
            />
            <button
              onClick={() => setStake((s) => s + 1)}
              className="px-3 py-3 text-gray-600 dark:text-gray-200 active:scale-90 transition-transform"
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>
          <button
            onClick={() => void handlePlaceBet()}
            disabled={isPlacing}
            className="bg-gray-200 dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 font-bold text-sm rounded-xl px-5 py-3 active:scale-95 transition-transform shrink-0 disabled:opacity-60"
          >
            {isPlacing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Поставить'}
          </button>
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs text-gray-600 dark:text-gray-200">
            Возможный выигрыш:{' '}
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">
              {Math.round(potentialWin)} TMTM
            </span>
          </p>
        </div>

        <div className="flex gap-2 px-4 pb-6">
          {QUICK_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => setStake(amt)}
              className="flex-1 bg-amber-500 text-white font-bold text-sm rounded-lg py-2.5 active:scale-95 transition-transform"
            >
              {amt} TMTM
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
