import { useCallback, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { persistWalletBalance } from '@/games/blackjack/wallet';
import { blockedGamesWager } from '@/lib/playerMoneyGate';
import { GameWalletBadge } from '@/components/games/GameWalletBadge';
import { APPLE_CLOVER_PNG, APPLE_RED_PNG } from './appleAssets';
import { APPLE_LEVELS } from './appleConfig';
import { buildBoard, formatMult, revealBoard } from './board';
import type { AppleCell, ApplePhase, AppleRow } from './types';

interface ApplesGameProps {
  onBack: () => void;
}

const MIN_BET = 1;
const DEFAULT_BET = '10';

function parseAmount(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

export function ApplesGame({ onBack }: ApplesGameProps) {
  const { balance, applyBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<ApplePhase>('betting');
  const [betInput, setBetInput] = useState(DEFAULT_BET);
  const [stake, setStake] = useState(0);
  const [rows, setRows] = useState<AppleRow[]>(() => buildBoard());
  const [activeLevel, setActiveLevel] = useState(1);
  const [lastWonLevel, setLastWonLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const cashoutValue = lastWonLevel > 0
    ? Number((stake * (APPLE_LEVELS[lastWonLevel - 1]?.multiplier ?? 1)).toFixed(2))
    : 0;

  const setBalance = useCallback(
    async (next: number) => {
      const safe = Number(Math.max(0, next).toFixed(2));
      const previous = balanceRef.current;
      balanceRef.current = safe;
      applyBalance(safe);
      const saved = await persistWalletBalance(safe);
      if (!saved.ok) {
        balanceRef.current = previous;
        applyBalance(previous);
        await refresh();
        return false;
      }
      balanceRef.current = saved.balance;
      applyBalance(saved.balance);
      return true;
    },
    [applyBalance, refresh],
  );

  const startRound = async () => {
    if (phase === 'playing' || busy) return;
    const amount = parseAmount(betInput);
    if (amount < MIN_BET) {
      showToast(`Минимум ${MIN_BET} TMTM`);
      return;
    }
    if (amount > balanceRef.current) {
      showToast('Недостаточно средств');
      return;
    }
    const blocked = blockedGamesWager();
    if (blocked) {
      showToast(blocked);
      return;
    }
    setBusy(true);
    const ok = await setBalance(balanceRef.current - amount);
    setBusy(false);
    if (!ok) {
      showToast('Не удалось списать ставку');
      return;
    }
    setStake(amount);
    setRows(buildBoard());
    setActiveLevel(1);
    setLastWonLevel(0);
    setPhase('playing');
  };

  const handleSelectCell = (colIndex: number) => {
    const rowIndex = activeLevel - 1;
    const level = activeLevel;
    if (phase !== 'playing' || busy) return;
    const cell = rows[rowIndex]?.cells[colIndex];
    if (!cell || cell.revealed) return;

    if (cell.kind === 'bad') {
      setRows((prev) =>
        revealBoard(prev).map((item, index) =>
          index !== rowIndex
            ? item
            : {
                ...item,
                cells: item.cells.map((entry, col) =>
                  col === colIndex ? { ...entry, revealed: true, picked: true } : { ...entry, revealed: true },
                ),
              },
        ),
      );
      setPhase('lost');
      setLastWonLevel(0);
      return;
    }

    setRows((prev) =>
      prev.map((item, index) =>
        index !== rowIndex
          ? item
          : {
              ...item,
              cells: item.cells.map((entry, col) =>
                col === colIndex ? { ...entry, revealed: true, picked: true } : entry,
              ),
            },
      ),
    );
    setLastWonLevel(level);
    if (level >= APPLE_LEVELS.length) {
      setPhase('cleared');
      return;
    }
    setActiveLevel(level + 1);
  };

  const cashOut = async () => {
    if (busy || cashoutValue <= 0) return;
    if (phase !== 'playing' && phase !== 'cleared') return;
    setBusy(true);
    const ok = await setBalance(balanceRef.current + cashoutValue);
    setBusy(false);
    if (!ok) {
      showToast('Не удалось зачислить выигрыш');
      return;
    }
    showToast(`Забрано ${cashoutValue.toFixed(2)} TMTM`);
    setPhase('betting');
    setStake(0);
    setLastWonLevel(0);
    setActiveLevel(1);
    setRows(buildBoard());
  };

  const resetAfterLoss = () => {
    setPhase('betting');
    setStake(0);
    setLastWonLevel(0);
    setActiveLevel(1);
    setRows(buildBoard());
  };

  const setBet = (value: number) => {
    if (phase === 'playing' || phase === 'cleared') return;
    setBetInput(String(Math.max(MIN_BET, Number(value.toFixed(2)))));
  };

  const canPlay = phase === 'playing';
  const canCash = cashoutValue > 0 && (phase === 'playing' || phase === 'cleared');
  const maxBet = Math.max(MIN_BET, Number(balance.toFixed(2)));
  const lockedBet = phase === 'playing' || phase === 'cleared';

  return (
    <div
      className="aof-screen relative mx-auto flex h-[100dvh] min-h-screen w-full max-w-md flex-col overflow-hidden bg-cover bg-center bg-no-repeat text-white max-md:max-w-none"
      style={{ backgroundImage: "url('/images/games/apple_forest_bg.png')" }}
    >
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top,8px)]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/35 ring-1 ring-white/15 active:scale-90"
          aria-label="Назад"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1" />
        <div className="shrink-0 rounded-full bg-black/40 px-2.5 py-1 text-right ring-1 ring-lime-300/20">
          <GameWalletBadge
            labelClassName="text-[8px] font-semibold uppercase tracking-wide text-lime-200/70"
            valueClassName="text-[11px] font-black tabular-nums"
          />
        </div>
      </header>

      <div className={`relative z-10 mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-end overflow-y-auto px-2 pb-3 ${phase === 'lost' ? 'aof-shake' : ''}`}>
        <div className="flex flex-col-reverse">
          {rows.map((row) => {
            const isActiveRow = row.level === activeLevel;
            const clickable = canPlay && isActiveRow;
            return (
              <div key={row.level} className="my-0.5 flex items-center justify-between gap-1.5">
                <span
                  className={`pointer-events-none w-12 shrink-0 rounded-full border py-0.5 text-center text-[11px] tabular-nums ${
                    isActiveRow
                      ? 'animate-pulse border-transparent bg-gradient-to-r from-green-400 to-emerald-300 font-black text-black shadow-[0_0_10px_#22c55e]'
                      : 'border-emerald-800/40 bg-black/40 font-bold text-emerald-400/70'
                  }`}
                >
                  {formatMult(row.multiplier)}
                </span>
                <div className="flex items-center gap-1.5">
                  {row.cells.map((cell, colIndex) => (
                    <AppleButton
                      key={cell.id}
                      cell={cell}
                      clover={isActiveRow && !cell.revealed}
                      inactive={!isActiveRow && !cell.revealed}
                      clickable={clickable && !cell.revealed}
                      onClick={() => handleSelectCell(colIndex)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="aof-panel relative z-20 shrink-0 space-y-2 rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))]">
        <input
          inputMode="decimal"
          value={betInput}
          disabled={lockedBet}
          onChange={(event) => setBetInput(event.target.value.replace(/[^\d.,]/g, ''))}
          className="h-10 w-full rounded-xl bg-black/45 text-center text-sm font-black tabular-nums outline-none ring-1 ring-white/10 disabled:opacity-50"
        />
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" disabled={lockedBet} onClick={() => setBet(MIN_BET)} className="h-10 rounded-xl bg-black/40 text-[10px] font-black ring-1 ring-white/10 disabled:opacity-40">
            MIN
          </button>
          <button type="button" disabled={lockedBet} onClick={() => setBet(parseAmount(betInput) * 2)} className="h-10 rounded-xl bg-black/40 text-[10px] font-black ring-1 ring-white/10 disabled:opacity-40">
            X2
          </button>
          <button type="button" disabled={lockedBet} onClick={() => setBet(parseAmount(betInput) / 2)} className="h-10 rounded-xl bg-black/40 text-[10px] font-black ring-1 ring-white/10 disabled:opacity-40">
            X/2
          </button>
          <button type="button" disabled={lockedBet} onClick={() => setBet(maxBet)} className="h-10 rounded-xl bg-black/40 text-[10px] font-black ring-1 ring-white/10 disabled:opacity-40">
            MAX
          </button>
        </div>

        {canCash ? (
          <button
            type="button"
            onClick={() => void cashOut()}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 py-3 text-sm font-black uppercase tracking-wide text-emerald-950 shadow-lg shadow-orange-900/30 active:scale-[0.98]"
          >
            ЗАБРАТЬ {cashoutValue.toFixed(2)} TMTM
          </button>
        ) : phase === 'lost' ? (
          <button
            type="button"
            onClick={resetAfterLoss}
            className="w-full rounded-2xl bg-black/45 py-3 text-sm font-black uppercase tracking-wide ring-1 ring-white/15 active:scale-[0.98]"
          >
            Новая игра
          </button>
        ) : phase === 'playing' ? (
          <button
            type="button"
            disabled
            className="w-full rounded-2xl bg-black/40 py-3 text-sm font-black uppercase tracking-wide text-lime-200 ring-1 ring-lime-400/25"
          >
            Выберите яблоко
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRound()}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-b from-lime-400 to-emerald-600 py-3 text-sm font-black uppercase tracking-wide text-emerald-950 shadow-lg shadow-emerald-900/30 active:scale-[0.98]"
          >
            СТАВКА
          </button>
        )}
      </div>
    </div>
  );
}

function AppleButton({
  cell,
  clover,
  inactive,
  clickable,
  onClick,
}: {
  cell: AppleCell;
  clover: boolean;
  inactive: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const openedGood = cell.revealed && cell.kind === 'good';
  const openedBad = cell.revealed && cell.kind === 'bad';

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`relative z-20 flex h-11 w-11 shrink-0 items-center justify-center bg-transparent p-0 ${
        clickable ? 'cursor-pointer' : 'pointer-events-none cursor-default'
      }`}
    >
      {openedGood ? (
        <span className="flex h-9 w-9 animate-bounce items-center justify-center text-[22px] leading-none">🍏</span>
      ) : openedBad ? (
        <span className="flex h-9 w-9 items-center justify-center text-[18px] leading-none">🍎💀</span>
      ) : clover ? (
        <img
          src={APPLE_CLOVER_PNG}
          alt=""
          draggable={false}
          className="h-full w-full object-contain transition-transform hover:scale-105"
        />
      ) : (
        <img
          src={APPLE_RED_PNG}
          alt=""
          draggable={false}
          className={`h-full w-full object-contain ${inactive ? 'opacity-40' : ''}`}
        />
      )}
    </button>
  );
}
