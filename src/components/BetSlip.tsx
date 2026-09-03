import { useState } from 'react';
import { X, Trash2, Plus, Minus, TrendingUp } from 'lucide-react';
import type { BetSelection } from '../types';
import { formatOdds } from '../lib/matchOdds';
import { placeModeFromCount, placeModeLabel } from '../lib/sportsPlaceMode';

interface BetSlipProps {
  selections: BetSelection[];
  onRemove: (matchId: string, outcome: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function BetSlip({ selections, onRemove, onClear, onClose }: BetSlipProps) {
  const [stake, setStake] = useState<number>(500);
  const mode = placeModeFromCount(selections.length);

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const expressWin = stake * totalOdds;
  const singleWin = selections.reduce((acc, s) => acc + stake * s.odds, 0);
  const potentialWin = mode === 'express' ? expressWin : singleWin;

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
        <span className="font-bold text-gray-900 dark:text-white text-base">Купон</span>
        <div className="flex items-center gap-1">
          {selections.length > 0 && (
            <button
              onClick={onClear}
              className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-200 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {selections.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center mb-3">
            <TrendingUp className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Купон пуст</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">Выберите коэффициенты, чтобы сделать ставку</p>
        </div>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="flex bg-gray-100 dark:bg-[#1e293b] p-1 mx-3 mt-3 rounded-xl shrink-0 transition-colors">
            <div
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
                mode === 'express' ? 'bg-brand-600 text-white' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {mode === 'express' ? <TrendingUp className="w-3.5 h-3.5" /> : null}
              {placeModeLabel(mode)}
            </div>
          </div>

          {/* Selections */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2">
            {selections.map((s) => (
              <div
                key={`${s.matchId}-${s.outcome}`}
                className="bg-gray-100 dark:bg-[#1e293b] rounded-xl p-3 border border-gray-200 dark:border-gray-700 animate-slide-up transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-1 truncate font-bold">{s.matchLabel}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-white font-bold">{s.market}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">→</span>
                      <span className="text-sm text-brand-600 font-bold">{s.outcome}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatOdds(s.odds)}</span>
                    <button
                      onClick={() => onRemove(s.matchId, s.outcome)}
                      className="w-6 h-6 flex items-center justify-center text-gray-500 dark:text-gray-200 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stake input + summary */}
          <div className="shrink-0 bg-white dark:bg-[#1e293b] border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-3 transition-colors">
            {mode === 'express' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-200 font-bold">Общий коэффициент</span>
                <span className="font-extrabold text-brand-600 text-lg tabular-nums">{formatOdds(totalOdds)}</span>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-700 dark:text-gray-200 mb-1.5 block font-bold">Сумма ставки</label>
              <div className="flex items-center gap-2">
                <div className="flex items-center flex-1 bg-gray-100 dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-600 focus-within:border-brand-600 transition-colors">
                  <button
                    onClick={() => setStake(Math.max(50, stake - 100))}
                    className="px-3 py-2.5 text-gray-700 dark:text-gray-200 hover:text-gray-800 dark:hover:text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
                    className="flex-1 bg-transparent text-gray-800 dark:text-white text-sm font-bold text-center outline-none tabular-nums w-full"
                  />
                  <button
                    onClick={() => setStake(stake + 100)}
                    className="px-3 py-2.5 text-gray-700 dark:text-gray-200 hover:text-gray-800 dark:hover:text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-200 font-bold">TMTM</span>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[100, 500, 1000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setStake(amt)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:border-brand-700 transition-colors"
                  >
                    {amt.toLocaleString('ru-RU')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-100 dark:bg-[#1e293b] rounded-xl px-3 py-2.5 transition-colors">
              <span className="text-xs text-gray-700 dark:text-gray-200 font-bold">Возможный выигрыш</span>
              <span className="text-lg font-extrabold text-brand-600 tabular-nums">
                {Math.round(potentialWin).toLocaleString('ru-RU')} TMTM
              </span>
            </div>

            <button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-brand-900/30">
              Сделать ставку
            </button>
          </div>
        </>
      )}
    </div>
  );
}
