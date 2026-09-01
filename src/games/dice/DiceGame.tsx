import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Info, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { blockedGamesWager } from '@/lib/playerMoneyGate';
import { PlayerGameError, startGame } from '@/lib/playerGames';
import './dice.css';

export const DICE_BG = '/images/26164.png';
export const DICE_WIN_MULTIPLIER = 2;
export const DICE_DRAW_MULTIPLIER = 1;
export const DICE_ROLL_MS = 800;

interface DiceGameProps {
  onBack: () => void;
}

const MIN_STAKE = 6;
const DEFAULT_STAKE = 12;
const IDLE_STATUS = "Для начала игры нажмите 'Play'";

type Outcome = 'idle' | 'rolling' | 'win' | 'draw' | 'lose';

const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function roundMoney(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function parseStake(raw: string): number {
  const n = Number(String(raw).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

function DieFace({
  value,
  tone,
  rolling,
}: {
  value: number;
  tone: 'red' | 'black';
  rolling: boolean;
}) {
  const pips = PIP_MAP[value] ?? PIP_MAP[1];
  return (
    <div
      className={`dice-cube grid h-14 w-14 grid-cols-3 grid-rows-3 gap-[3px] rounded-xl p-[0.42rem] shadow-[0_10px_18px_rgba(0,0,0,0.55)] ring-2 ${
        rolling ? 'is-rolling' : ''
      } ${
        tone === 'red'
          ? 'bg-gradient-to-br from-rose-500 to-red-800 ring-red-200/70'
          : 'bg-gradient-to-br from-zinc-700 to-black ring-emerald-300/50'
      }`}
      style={{
        filter:
          tone === 'black'
            ? 'drop-shadow(0 0 10px rgba(50,205,50,0.45))'
            : 'drop-shadow(0 0 10px rgba(225,29,72,0.5))',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`h-full w-full rounded-full ${pips.includes(i) ? 'bg-white shadow-sm' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
}

export function DiceGame({ onBack }: DiceGameProps) {
  const { applyServerBalance, balance, refresh } = useWallet();
  const { showToast } = useToast();
  const [stakeInput, setStakeInput] = useState(String(DEFAULT_STAKE));
  const [playerDice, setPlayerDice] = useState<[number, number]>([5, 3]);
  const [rivalDice, setRivalDice] = useState<[number, number]>([4, 2]);
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [status, setStatus] = useState(IDLE_STATUS);
  const [resultView, setResultView] = useState<{
    outcome: 'win' | 'draw' | 'lose';
    playerTotal: number;
    rivalTotal: number;
    payout: number;
    stake: number;
  } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const rollingRef = useRef(false);
  const timers = useRef<number[]>([]);

  const maxStake = useMemo(() => roundMoney(balance), [balance]);
  const locked = outcome === 'rolling';
  const playerSum = playerDice[0] + playerDice[1];
  const rivalSum = rivalDice[0] + rivalDice[1];
  const stakeValue = parseStake(stakeInput) || DEFAULT_STAKE;

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => {
        window.clearInterval(id);
        window.clearTimeout(id);
      });
    };
  }, []);

  const play = async () => {
    if (rollingRef.current) return;
    const stake = parseStake(stakeInput);
    if (stake < MIN_STAKE) {
      showToast(`Минимум ${MIN_STAKE} TMTM`);
      return;
    }
    const blocked = blockedGamesWager();
    if (blocked) {
      showToast(blocked);
      return;
    }
    if (stake > balance) {
      showToast('Недостаточно средств');
      return;
    }

    rollingRef.current = true;
    setOutcome('rolling');
    setStatus('Идёт бросок...');
    setResultView(null);

    const startedAt = performance.now();
    try {
      const round = await startGame({ gameCode: 'dice', stake });
      applyServerBalance(round.balanceAfter);
      const player = Array.isArray(round.publicResult.playerDice)
        ? round.publicResult.playerDice.map((n) => Number(n))
        : [1, 1];
      const rival = Array.isArray(round.publicResult.rivalDice)
        ? round.publicResult.rivalDice.map((n) => Number(n))
        : [1, 1];
      const remain = Math.max(0, DICE_ROLL_MS - (performance.now() - startedAt));
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, remain);
        timers.current.push(id);
      });
      setPlayerDice([player[0] ?? 1, player[1] ?? 1]);
      setRivalDice([rival[0] ?? 1, rival[1] ?? 1]);
      const nextOutcome = String(round.publicResult.outcome ?? 'lose');
      const playerTotal = Number(player[0] ?? 1) + Number(player[1] ?? 1);
      const rivalTotal = Number(rival[0] ?? 1) + Number(rival[1] ?? 1);
      const payout = Number(round.payout) || 0;
      if (nextOutcome === 'win') {
        setOutcome('win');
        setResultView({ outcome: 'win', playerTotal, rivalTotal, payout, stake });
      } else if (nextOutcome === 'draw') {
        setOutcome('draw');
        setResultView({ outcome: 'draw', playerTotal, rivalTotal, payout, stake });
      } else {
        setOutcome('lose');
        setResultView({ outcome: 'lose', playerTotal, rivalTotal, payout, stake });
      }
      setStatus(IDLE_STATUS);
      rollingRef.current = false;
    } catch (error) {
      rollingRef.current = false;
      setOutcome('idle');
      setStatus(IDLE_STATUS);
      setResultView(null);
      const code = error instanceof PlayerGameError ? error.code : '';
      showToast(code === 'INSUFFICIENT_AVAILABLE_BALANCE' ? 'Недостаточно средств' : 'Не удалось списать ставку');
      await refresh();
    }
  };

  const setStakeValue = (value: number) => {
    if (locked) return;
    const ceiling = Math.max(MIN_STAKE, maxStake);
    const capped = roundMoney(Math.min(Math.max(value, MIN_STAKE), ceiling));
    setStakeInput(String(capped));
  };

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-transparent text-white">
      <div className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden">
        <img src={DICE_BG} alt="" className="fixed inset-0 h-full w-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 to-transparent" />
      </div>

      <div className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full flex-col justify-between overflow-hidden pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <header className="flex shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/20 active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-lime-300 ring-1 ring-white/20 active:scale-90"
            aria-label="Правила"
          >
            <Info className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 rounded-xl bg-black/55 px-2 py-1.5 text-center backdrop-blur-sm ring-1 ring-white/10">
            <p className="truncate text-[11px] font-semibold leading-snug text-white/95">{status}</p>
          </div>
          <div className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-right ring-1 ring-white/10">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-white/55">Баланс</p>
            <p className="text-[11px] font-black tabular-nums text-lime-300">{balance.toFixed(2)}</p>
          </div>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-lime-300 ring-1 ring-white/20 active:scale-90"
            aria-label={muted ? 'Звук выключен' : 'Звук'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex gap-2">
              <DieFace value={playerDice[0]} tone="red" rolling={locked} />
              <DieFace value={playerDice[1]} tone="red" rolling={locked} />
            </div>
            <div className="flex gap-2">
              <DieFace value={rivalDice[0]} tone="black" rolling={locked} />
              <DieFace value={rivalDice[1]} tone="black" rolling={locked} />
            </div>
          </div>
          {resultView ? (
            <DiceResultPanel result={resultView} />
          ) : null}
        </div>

        <div className="z-20 flex w-full flex-col gap-2 bg-transparent p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {resultView ? null : (
            <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wide">
              <p className="text-rose-100 drop-shadow-md">
                Вы <span className="tabular-nums text-white">{playerSum}</span>
              </p>
              <p className="text-lime-100 drop-shadow-md">
                Соперник <span className="tabular-nums text-white">{rivalSum}</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              disabled={locked}
              onClick={() => setStakeValue(MIN_STAKE)}
              className="rounded-xl border border-white/15 bg-black/40 py-2 text-[11px] font-bold text-white shadow-md backdrop-blur-sm active:scale-95 disabled:opacity-40"
            >
              MIN
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setStakeValue(stakeValue * 2)}
              className="rounded-xl border border-white/15 bg-black/40 py-2 text-[11px] font-bold text-white shadow-md backdrop-blur-sm active:scale-95 disabled:opacity-40"
            >
              X2
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setStakeValue(stakeValue / 2)}
              className="rounded-xl border border-white/15 bg-black/40 py-2 text-[11px] font-bold text-white shadow-md backdrop-blur-sm active:scale-95 disabled:opacity-40"
            >
              X/2
            </button>
            <button
              type="button"
              disabled={locked || maxStake < MIN_STAKE}
              onClick={() => setStakeValue(maxStake)}
              className="rounded-xl border border-white/15 bg-black/40 py-2 text-[11px] font-bold text-white shadow-md backdrop-blur-sm active:scale-95 disabled:opacity-40"
            >
              MAX
            </button>
          </div>

          <input
            inputMode="decimal"
            disabled={locked}
            value={stakeInput}
            onChange={(event) => setStakeInput(event.target.value)}
            onBlur={() => setStakeValue(parseStake(stakeInput) || MIN_STAKE)}
            className="w-full rounded-xl border border-white/15 bg-black/40 py-2 text-center text-[16px] font-bold text-white shadow-md outline-none backdrop-blur-sm disabled:opacity-60"
            aria-label="Сумма ставки"
          />

          <button
            type="button"
            disabled={locked}
            onClick={play}
            aria-label="Сделать ставку"
            className="w-full rounded-xl bg-green-500 py-3.5 text-base font-bold text-white shadow-lg hover:bg-green-600 active:scale-95 disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Play className="h-5 w-5 fill-current" />
              {locked ? 'Идёт бросок...' : 'Play'}
            </span>
          </button>
        </div>
      </div>

      {rulesOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-5" onClick={() => setRulesOpen(false)}>
          <div
            role="dialog"
            aria-label="Правила Dice"
            onClick={(event) => event.stopPropagation()}
            className="relative max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-2xl px-5 py-6 text-[#3b2a14]"
            style={{
              background: 'linear-gradient(180deg, #f4e1b8 0%, #e4c98a 40%, #d7b56a 100%)',
              boxShadow: 'inset 0 0 0 3px #c4a15a, 0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={() => setRulesOpen(false)}
              className="absolute right-3 top-3 rounded-full bg-black/10 p-1 text-[#3b2a14]"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="mb-3 text-center text-xl font-black tracking-wide text-[#5b3210]">DICE GAME</h2>
            <p className="mb-3 text-[13px] font-medium leading-relaxed">
              Самая простая игра. Нужно лишь выбросить больше очков, чем противник.
            </p>
            <ol className="space-y-2 text-[13px] font-semibold leading-snug">
              <li>1. Сделайте ставку.</li>
              <li>2. Мин. ставка 6 TMTM.</li>
              <li>3. Ваши кубики красного цвета, противника — чёрного.</li>
              <li>4. Ваша задача выбросить больше очков.</li>
              <li>5. Вы побеждаете при большем количестве очков. Выигрыш — ставка × {DICE_WIN_MULTIPLIER.toFixed(2)}.</li>
              <li>6. При ничьей ставка возвращается (×{DICE_DRAW_MULTIPLIER}).</li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DiceResultPanel({
  result,
}: {
  result: {
    outcome: 'win' | 'draw' | 'lose';
    playerTotal: number;
    rivalTotal: number;
    payout: number;
    stake: number;
  };
}) {
  const title = result.outcome === 'win' ? 'ПОБЕДА' : result.outcome === 'draw' ? 'НИЧЬЯ' : 'ПОРАЖЕНИЕ';
  const moneyLabel = result.outcome === 'win' ? 'Выигрыш' : result.outcome === 'draw' ? 'Возврат' : 'Проигрыш';
  const moneyValue = result.outcome === 'lose' ? result.stake : result.payout;
  return (
    <div
      data-dice-result={result.outcome}
      className="dice-result w-full max-w-sm rounded-2xl px-4 py-3 text-center"
    >
      <p data-dice-outcome={result.outcome} className="text-lg font-black tracking-[0.14em] text-[#f5e6a8]">
        {title}
      </p>
      <p className="mt-1 text-sm font-bold text-white/90">
        Вы: <span className="tabular-nums">{result.playerTotal}</span>
      </p>
      <p className="text-sm font-bold text-white/90">
        Соперник: <span className="tabular-nums">{result.rivalTotal}</span>
      </p>
      <p data-dice-money={moneyValue.toFixed(2)} className="mt-1 text-base font-black tabular-nums text-lime-300">
        {moneyLabel}: {moneyValue.toFixed(2)} TMTM
      </p>
    </div>
  );
}
