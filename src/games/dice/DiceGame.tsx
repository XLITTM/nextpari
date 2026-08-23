import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Info, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { persistWalletBalance } from '@/games/blackjack/wallet';
import { useUserStore } from '@/stores/userStore';
import './dice.css';

export const DICE_BG = '/images/26164.png';

interface DiceGameProps {
  onBack: () => void;
}

const MIN_STAKE = 6;
const DEFAULT_STAKE = 12;
const ROLL_MS = 1600;
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

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

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
      className={`dice-cube grid h-[4.4rem] w-[4.4rem] grid-cols-3 grid-rows-3 gap-[3px] rounded-[0.85rem] p-[0.55rem] shadow-[0_10px_18px_rgba(0,0,0,0.55)] ring-2 ${
        rolling ? 'is-rolling' : ''
      } ${
        tone === 'red'
          ? 'bg-gradient-to-br from-rose-500 to-red-800 ring-red-200/70'
          : 'bg-gradient-to-br from-zinc-700 to-black ring-emerald-300/50'
      }`}
      style={{
        filter:
          tone === 'black'
            ? 'drop-shadow(0 0 10px rgba(50,205,50,0.35))'
            : 'drop-shadow(0 0 10px rgba(225,29,72,0.45))',
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
  const { applyBalance, balance } = useWallet();
  const debit = useUserStore((state) => state.debit);
  const credit = useUserStore((state) => state.credit);
  const { showToast } = useToast();
  const [stakeInput, setStakeInput] = useState(String(DEFAULT_STAKE));
  const [playerDice, setPlayerDice] = useState<[number, number]>([5, 3]);
  const [rivalDice, setRivalDice] = useState<[number, number]>([4, 2]);
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [status, setStatus] = useState(IDLE_STATUS);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const rollingRef = useRef(false);
  const timers = useRef<number[]>([]);

  const maxStake = useMemo(() => roundMoney(balance), [balance]);
  const locked = outcome === 'rolling';

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearInterval(id));
    };
  }, []);

  const syncWallet = () => {
    const next = useUserStore.getState().balance;
    applyBalance(next);
    void persistWalletBalance(next);
  };

  const setStakeValue = (value: number) => {
    if (locked) return;
    const ceiling = Math.max(MIN_STAKE, maxStake);
    const capped = roundMoney(Math.min(Math.max(value, MIN_STAKE), ceiling));
    setStakeInput(String(capped));
  };

  const play = () => {
    if (rollingRef.current) return;
    const stake = parseStake(stakeInput);
    if (stake < MIN_STAKE) {
      showToast(`Минимум ${MIN_STAKE} TMTM`);
      return;
    }
    if (stake > useUserStore.getState().balance) {
      showToast('Недостаточно средств');
      return;
    }
    if (!debit(stake)) {
      showToast('Недостаточно средств');
      return;
    }
    syncWallet();

    rollingRef.current = true;
    setOutcome('rolling');
    setStatus('Идёт бросок...');

    const tick = window.setInterval(() => {
      setPlayerDice([rollDie(), rollDie()]);
      setRivalDice([rollDie(), rollDie()]);
    }, 80);
    timers.current.push(tick);

    window.setTimeout(() => {
      window.clearInterval(tick);
      timers.current = timers.current.filter((id) => id !== tick);
      const red: [number, number] = [rollDie(), rollDie()];
      const black: [number, number] = [rollDie(), rollDie()];
      setPlayerDice(red);
      setRivalDice(black);
      const playerSum = red[0] + red[1];
      const rivalSum = black[0] + black[1];

      if (playerSum > rivalSum) {
        credit(roundMoney(stake * 2));
        syncWallet();
        setOutcome('win');
        setStatus('Вы победили!');
      } else if (playerSum === rivalSum) {
        credit(roundMoney(stake));
        syncWallet();
        setOutcome('draw');
        setStatus('Ничья');
      } else {
        setOutcome('lose');
        setStatus('Вы проиграли');
      }
      rollingRef.current = false;
    }, ROLL_MS);
  };

  return (
    <div
      className="relative mx-auto flex h-[100dvh] min-h-screen w-full max-w-md flex-col overflow-hidden bg-cover bg-[center_top] bg-no-repeat text-white max-md:max-w-none"
      style={{
        backgroundImage: `url('${DICE_BG}')`,
        backgroundColor: '#062c1e',
        backgroundPosition: 'center 4.5rem',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/25" />

      <header className="relative z-20 flex items-start justify-between gap-2 px-2 pt-[max(0.4rem,env(safe-area-inset-top))]">
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 ring-1 ring-lime-400/40 active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14532d] text-lime-300 ring-2 ring-lime-400/80 active:scale-90"
            aria-label="Правила"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1 px-0.5">
          <div
            className="relative overflow-hidden rounded-md px-2 py-2 text-center"
            style={{
              background: 'linear-gradient(180deg, #6b4423 0%, #3f2a14 55%, #2a1b0c 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,220,160,0.25), 0 4px 0 #1a0f0a',
            }}
          >
            <span className="absolute left-4 top-0 h-2.5 w-[2px] bg-lime-400/80" />
            <span className="absolute right-4 top-0 h-2.5 w-[2px] bg-lime-400/80" />
            <p className="text-[12px] font-semibold leading-snug text-amber-50">{status}</p>
            {outcome !== 'idle' && outcome !== 'rolling' ? (
              <p className="mt-0.5 text-[10px] font-bold text-lime-300">
                Вы {playerDice[0] + playerDice[1]} : {rivalDice[0] + rivalDice[1]} соперник
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <div className="rounded-full bg-black/50 px-2.5 py-1 text-right ring-1 ring-lime-400/25">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-lime-200/70">Баланс</p>
            <p className="text-[11px] font-black tabular-nums text-lime-300">{balance.toFixed(2)}</p>
          </div>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14532d] text-lime-300 ring-2 ring-lime-400/80 active:scale-90"
            aria-label={muted ? 'Звук выключен' : 'Звук'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="relative z-20 mt-auto flex flex-col items-center px-3 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        <div className="mb-1.5 flex w-full items-end justify-between px-5">
          <div className="flex gap-2">
            <DieFace value={playerDice[0]} tone="red" rolling={locked} />
            <DieFace value={playerDice[1]} tone="red" rolling={locked} />
          </div>
          <div className="flex gap-2">
            <DieFace value={rivalDice[0]} tone="black" rolling={locked} />
            <DieFace value={rivalDice[1]} tone="black" rolling={locked} />
          </div>
        </div>

        <div className="w-full max-w-[22rem]">
          <div className="mb-1 flex h-8 items-center justify-center rounded-lg bg-black/40 ring-1 ring-lime-400/50">
            <input
              inputMode="decimal"
              disabled={locked}
              value={stakeInput}
              onChange={(event) => setStakeInput(event.target.value)}
              onBlur={() => setStakeValue(parseStake(stakeInput) || MIN_STAKE)}
              className="w-full bg-transparent text-center text-[15px] font-black tracking-wide text-lime-400 outline-none disabled:opacity-60"
              aria-label="Ставка"
            />
          </div>
          <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-lime-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {(parseStake(stakeInput) || DEFAULT_STAKE).toFixed(2)} TMTM
          </p>

          <div className="mb-1.5 grid grid-cols-4 gap-1.5">
            <button type="button" disabled={locked} onClick={() => setStakeValue(MIN_STAKE)} className="h-8 rounded-md border border-lime-400/80 bg-black/40 text-[11px] font-black tracking-wide text-lime-300 active:scale-95 disabled:opacity-40">
              MIN
            </button>
            <button type="button" disabled={locked} onClick={() => setStakeValue((parseStake(stakeInput) || DEFAULT_STAKE) * 2)} className="h-8 rounded-md border border-lime-400/80 bg-black/40 text-[11px] font-black tracking-wide text-lime-300 active:scale-95 disabled:opacity-40">
              X2
            </button>
            <button type="button" disabled={locked} onClick={() => setStakeValue((parseStake(stakeInput) || DEFAULT_STAKE) / 2)} className="h-8 rounded-md border border-lime-400/80 bg-black/40 text-[11px] font-black tracking-wide text-lime-300 active:scale-95 disabled:opacity-40">
              X/2
            </button>
            <button type="button" disabled={locked || maxStake < MIN_STAKE} onClick={() => setStakeValue(maxStake)} className="h-8 rounded-md border border-lime-400/80 bg-black/40 text-[11px] font-black tracking-wide text-lime-300 active:scale-95 disabled:opacity-40">
              MAX
            </button>
          </div>

          <div className="flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 ring-1 ring-lime-400/50">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-yellow-300 to-amber-600 text-[9px] font-black text-amber-950 shadow-inner">
                N
              </span>
            </div>
            <button
              type="button"
              disabled={locked}
              onClick={play}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 ring-[3px] ring-lime-400 shadow-[0_0_16px_rgba(74,222,128,0.45)] active:scale-95 disabled:opacity-50"
              aria-label="Play"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-500 text-black">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 ring-1 ring-lime-400/50">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 12a8 8 0 0 1 13.2-6.1M20 12a8 8 0 0 1-13.2 6.1" />
                <path d="M17 3v4h-4M7 21v-4h4" />
              </svg>
            </div>
          </div>
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
              <li>5. Вы побеждаете при большем количестве очков. Выигрыш — ставка × 2.</li>
              <li>6. При ничьей ставка возвращается.</li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
