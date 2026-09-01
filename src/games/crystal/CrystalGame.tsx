import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, Settings, Zap, X } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { blockedGamesWager } from '@/lib/playerMoneyGate';
import { PlayerGameError, startGame } from '@/lib/playerGames';
import { GameWalletBadge } from '@/components/games/GameWalletBadge';
import { CrystalBoard } from './CrystalBoard';
import { CRYSTAL_BG, GEM_SRC } from './crystalAssets';
import {
  idleBoard,
  PAYTABLE,
  CELL_COUNT,
  type CrystalCell,
  type GemKind,
} from './crystalMath';

interface CrystalGameProps {
  onBack: () => void;
}

interface WinLine {
  id: string;
  kind: GemKind;
  clusterMult: number;
  comboMult: number;
  amount: number;
}

const MIN_BET = 6;
const DEFAULT_BET = '6';
const EMPTY_BOOM = new Array<boolean>(CELL_COUNT).fill(false);
const GOLD_BTN =
  'bg-[#c88d3e] hover:bg-[#b57d34] text-white font-bold py-2.5 rounded-xl text-sm shadow-md disabled:opacity-40 active:scale-[0.98]';

function parseAmount(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

interface ServerStep {
  board: CrystalCell[];
  clusters: { kind: GemKind; multiplier: number }[];
  exploding: boolean[];
  combo: number;
  stepWin: number;
  nextBoard: CrystalCell[];
}

function parseBoard(value: unknown): CrystalCell[] {
  if (!Array.isArray(value)) return idleBoard();
  return value.map((raw, index) => {
    const cell = raw as { id?: string; kind?: GemKind };
    return { id: String(cell.id ?? `c${index}`), kind: (cell.kind ?? 'green') as GemKind };
  });
}

function parseSteps(value: unknown): ServerStep[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const step = raw as Record<string, unknown>;
    const clusters = Array.isArray(step.clusters) ? step.clusters as { kind: GemKind; multiplier: number }[] : [];
    const exploding = Array.isArray(step.exploding)
      ? step.exploding.map((flag) => flag === true)
      : EMPTY_BOOM;
    return {
      board: parseBoard(step.board),
      clusters,
      exploding: exploding.length === CELL_COUNT ? exploding : EMPTY_BOOM,
      combo: Number(step.combo ?? 1),
      stepWin: Number(step.stepWin ?? 0),
      nextBoard: parseBoard(step.nextBoard),
    };
  });
}

function winLinesFromSteps(stake: number, steps: ServerStep[]): WinLine[] {
  const lines: WinLine[] = [];
  steps.forEach((step, stepIndex) => {
    step.clusters.forEach((cluster, clusterIndex) => {
      lines.push({
        id: `${stepIndex}-${clusterIndex}-${cluster.kind}`,
        kind: cluster.kind,
        clusterMult: cluster.multiplier,
        comboMult: step.combo,
        amount: Number((stake * cluster.multiplier * step.combo).toFixed(2)),
      });
    });
  });
  return lines;
}

export function CrystalGame({ onBack }: CrystalGameProps) {
  const { balance, applyServerBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [betInput, setBetInput] = useState(DEFAULT_BET);
  const [board, setBoard] = useState<CrystalCell[]>(() => idleBoard());
  const [exploding, setExploding] = useState<boolean[]>(EMPTY_BOOM);
  const [roundAccum, setRoundAccum] = useState(0);
  const [winLines, setWinLines] = useState<WinLine[]>([]);
  const [wonRound, setWonRound] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const [lastStake, setLastStake] = useState(MIN_BET);
  const [busy, setBusy] = useState(false);
  const [instant, setInstant] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const balanceRef = useRef(balance);
  const busyRef = useRef(false);
  const instantRef = useRef(false);
  const autoLeftRef = useRef(0);
  balanceRef.current = balance;
  instantRef.current = instant;

  const setBet = (value: number) => {
    if (busyRef.current) return;
    const cap = Math.max(MIN_BET, Number(balanceRef.current.toFixed(2)));
    setBetInput(String(Math.min(cap, Math.max(MIN_BET, Number(value.toFixed(2))))));
  };

  const stopAuto = () => {
    autoLeftRef.current = 0;
    setAutoLeft(0);
  };

  const finishRound = () => {
    if (autoLeftRef.current > 0) {
      autoLeftRef.current -= 1;
      setAutoLeft(autoLeftRef.current);
      if (autoLeftRef.current > 0) {
        return true;
      }
    }
    setRoundOver(true);
    return false;
  };

  const runSpin = useCallback(async (forcedAmount?: number) => {
    if (busyRef.current) return;
    const amount = forcedAmount ?? parseAmount(betInput);
    if (amount < MIN_BET) {
      showToast(`Минимум ${MIN_BET} TMTM`);
      stopAuto();
      return;
    }
    if (amount > balanceRef.current) {
      showToast('Недостаточно средств');
      stopAuto();
      return;
    }
    const blocked = blockedGamesWager();
    if (blocked) {
      showToast(blocked);
      stopAuto();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setRoundOver(false);
    setWonRound(false);
    setWinLines([]);
    setRoundAccum(0);
    setLastStake(amount);

    try {
      const round = await startGame({ gameCode: 'crystal', stake: amount });
      applyServerBalance(round.balanceAfter);
      const steps = parseSteps(round.publicResult.steps);
      const startBoard = parseBoard(round.publicResult.startBoard);
      const allLines = winLinesFromSteps(amount, steps);
      setBoard(startBoard);
      setExploding(EMPTY_BOOM);

      let accum = 0;
      let revealed = 0;
      if (!instantRef.current && steps.length > 0) {
        for (const step of steps) {
          accum = Number((accum + step.stepWin).toFixed(2));
          revealed += step.clusters.length;
          setBoard(step.board);
          setExploding(step.exploding);
          setRoundAccum(accum);
          setWinLines(allLines.slice(0, revealed));
          if (accum > 0) setWonRound(true);
          await wait(460);
          setExploding(EMPTY_BOOM);
          setBoard(step.nextBoard);
          await wait(300);
        }
      } else if (steps.length > 0) {
        const last = steps[steps.length - 1];
        setBoard(last.nextBoard);
        setRoundAccum(round.payout);
        setWinLines(allLines);
        if (round.payout > 0) setWonRound(true);
      }

      setExploding(EMPTY_BOOM);
      if (round.payout > 0) {
        setWonRound(true);
        setRoundAccum(round.payout);
        setWinLines(allLines);
      } else {
        setRoundAccum(0);
        setWinLines([]);
        setWonRound(false);
      }
    } catch (error) {
      const code = error instanceof PlayerGameError ? error.code : '';
      showToast(code === 'INSUFFICIENT_AVAILABLE_BALANCE' ? 'Недостаточно средств' : 'Не удалось списать ставку');
      stopAuto();
      await refresh();
    }

    busyRef.current = false;
    setBusy(false);

    const continueAuto = finishRound();
    if (continueAuto) {
      await wait(instantRef.current ? 700 : 1100);
      void runSpin();
    }
  }, [applyServerBalance, betInput, refresh, showToast]);

  const startAuto5 = () => {
    if (autoLeftRef.current > 0) {
      stopAuto();
      return;
    }
    autoLeftRef.current = 5;
    setAutoLeft(5);
    if (!busyRef.current) void runSpin();
  };

  const playAgain = () => {
    void runSpin(lastStake);
  };

  const newBet = () => {
    stopAuto();
    setRoundOver(false);
    setWonRound(false);
    setWinLines([]);
    setRoundAccum(0);
  };

  const maxBet = Math.max(MIN_BET, Number(balance.toFixed(2)));
  const locked = busy;
  const showResultButtons = roundOver && !busy && autoLeft === 0;

  return (
    <div
      className="relative mx-auto flex h-[100dvh] min-h-screen w-full max-w-md flex-col overflow-hidden bg-cover bg-center bg-no-repeat text-white max-md:max-w-none"
      style={{ backgroundImage: `url('${CRYSTAL_BG}')` }}
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
        <div className="shrink-0 rounded-full bg-black/40 px-2.5 py-1 text-right ring-1 ring-amber-300/25">
          <GameWalletBadge
            labelClassName="text-[8px] font-semibold uppercase tracking-wide text-amber-200/70"
            valueClassName="text-[11px] font-black tabular-nums"
          />
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <h1 className="shrink-0 text-center text-lg font-black tracking-[0.22em] text-white">CRYSTAL</h1>

        {wonRound && (
          <div className="relative z-20 shrink-0 py-1 text-center">
            <p className="text-2xl font-black text-green-400 drop-shadow-lg">Победа!</p>
            <p className="text-lg font-black tabular-nums text-green-300 drop-shadow-lg">
              {formatMoney(roundAccum)} TMTM
            </p>
          </div>
        )}

        <div className="relative shrink-0">
          <CrystalBoard board={board} exploding={exploding} />
        </div>

        <div className="my-3 flex min-h-[140px] w-full flex-col justify-center rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-md">
          {winLines.length > 0 ? (
            <>
              <p className="mb-2 text-center text-sm font-semibold text-zinc-300">
                Текущий выигрыш: {formatMoney(roundAccum)} TMTM
              </p>
              <div className="max-h-[7.5rem] space-y-1.5 overflow-y-auto">
                {winLines.map((line) => (
                  <div key={line.id} className="flex items-center gap-2 text-sm">
                    <img src={GEM_SRC[line.kind]} alt="" className="h-6 w-6 object-contain" />
                    <span className="font-bold tabular-nums text-amber-200">
                      x{line.clusterMult.toFixed(1)} / x{line.comboMult.toFixed(1)}
                    </span>
                    <span className="ml-auto font-black tabular-nums text-white">
                      {formatMoney(line.amount)} TMTM
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="relative z-20 shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))] pt-1">
        {showResultButtons ? (
          <>
            <button
              type="button"
              onClick={playAgain}
              className="w-full rounded-xl bg-[#c88d3e] py-3.5 font-black text-white shadow-lg hover:bg-[#b57d34]"
            >
              ИГРАТЬ ЕЩЕ РАЗ ({formatMoney(lastStake)} TMTM)
            </button>
            <button
              type="button"
              onClick={newBet}
              className="mt-2 w-full rounded-xl border border-white/20 bg-black/80 py-3.5 font-bold text-white"
            >
              НОВАЯ СТАВКА
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'MIN', onClick: () => setBet(MIN_BET) },
                { label: 'X2', onClick: () => setBet(Math.min(maxBet, parseAmount(betInput) * 2)) },
                { label: 'X/2', onClick: () => setBet(parseAmount(betInput) / 2) },
                { label: 'MAX', onClick: () => setBet(maxBet) },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={locked}
                  onClick={item.onClick}
                  className={GOLD_BTN}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <input
                  inputMode="decimal"
                  value={betInput}
                  disabled={locked}
                  aria-label="Сумма ставки"
                  onChange={(event) => setBetInput(event.target.value.replace(/[^\d.,]/g, ''))}
                  className="w-full border-b border-white/30 bg-black/60 px-3 py-2 text-lg font-bold text-white outline-none disabled:opacity-50"
                />
                <p className="mt-1 text-[10px] font-semibold text-zinc-400">
                  min {MIN_BET} TMTM - max {formatMoney(maxBet)} TMTM
                </p>
              </div>
              <button
                type="button"
                onClick={() => void runSpin()}
                disabled={locked}
                className="rounded-xl bg-[#c88d3e] px-6 py-3 font-black text-white shadow-lg hover:bg-[#b57d34] disabled:opacity-50"
              >
                СТАВКА
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1 px-1 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-200"
              >
                <Settings className="h-3.5 w-3.5" />
                Настройки
              </button>
              <button
                type="button"
                onClick={startAuto5}
                aria-label="5 AUTO"
                className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/55 text-[10px] font-black uppercase tracking-wide ${
                  autoLeft > 0 ? 'text-amber-200' : 'text-white'
                }`}
              >
                <span className="absolute -right-1 -top-1 rounded-full bg-[#c88d3e] px-1.5 py-0.5 text-[8px] font-black leading-none text-white shadow-md">
                  {autoLeft > 0 ? autoLeft : 5} AUTO
                </span>
                AUTO
              </button>
              <button
                type="button"
                onClick={() => setInstant((value) => !value)}
                className={`flex items-center gap-1 px-1 py-1.5 text-[11px] font-black uppercase tracking-wide ${
                  instant ? 'text-amber-200' : 'text-slate-200'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                В один клик
              </button>
            </div>
          </>
        )}
      </div>

      {settingsOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/65 p-3 sm:items-center">
          <div className="w-full rounded-2xl bg-[#101816] p-4 ring-1 ring-emerald-500/20">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wide">Таблица выплат</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] font-semibold text-slate-400">
              Кластер из 5+ одинаковых камней по горизонтали и вертикали. Каскады дают комбо ×2 / ×3 / ×5.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <PayColumn title="Кристаллы" rows={PAYTABLE.gems} />
              <PayColumn title="Монеты 🟡" rows={PAYTABLE.coins} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayColumn({ title, rows }: { title: string; rows: readonly { size: string; mult: string }[] }) {
  return (
    <div className="rounded-xl bg-black/35 p-2 ring-1 ring-white/10">
      <p className="mb-1 font-black text-amber-200">{title}</p>
      {rows.map((row) => (
        <div key={row.size} className="flex justify-between py-0.5 font-semibold text-slate-200">
          <span>{row.size}</span>
          <span className="text-yellow-300">{row.mult}</span>
        </div>
      ))}
    </div>
  );
}
