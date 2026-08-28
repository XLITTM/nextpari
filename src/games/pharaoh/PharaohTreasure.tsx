import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Coins, HelpCircle, Play, Plus, RefreshCw, Volume2, VolumeX, X,
} from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { persistWalletBalance } from '@/games/blackjack/wallet';
import { DepositModal } from '@/components/games/DepositModal';
import './pharaoh.css';

export const PHARAOH_SYMBOLS = [
  { id: 'cat', name: 'Статуэтка Анубиса', mult: 10000, color: 'border-red-600 bg-red-950/80', img: '/assets/games/pharaoh/cat_10000.png' },
  { id: 'scroll', name: 'Золотой свиток', mult: 1000, color: 'border-red-500 bg-red-900/80', img: '/assets/games/pharaoh/scroll_1000.png' },
  { id: 'nemes', name: 'Убор Фараона', mult: 200, color: 'border-fuchsia-600 bg-fuchsia-950/80', img: '/assets/games/pharaoh/nemes_200.png' },
  { id: 'pyramid', name: 'Золотая пирамида', mult: 100, color: 'border-pink-500 bg-pink-950/80', img: '/assets/games/pharaoh/pyramid_100.png' },
  { id: 'ring', name: 'Кольцо со скарабеем', mult: 50, color: 'border-purple-600 bg-purple-950/80', img: '/assets/games/pharaoh/ring_50.png' },
  { id: 'ankh', name: 'Крест Анкх', mult: 20, color: 'border-purple-500 bg-purple-900/80', img: '/assets/games/pharaoh/ankh_20.png' },
  { id: 'canopic', name: 'Сосуд Канопа', mult: 10, color: 'border-cyan-500 bg-cyan-950/80', img: '/assets/games/pharaoh/canopic_10.png' },
  { id: 'lotus', name: 'Священный лотос', mult: 5, color: 'border-blue-500 bg-blue-950/80', img: '/assets/games/pharaoh/lotus_5.png' },
  { id: 'cylinder', name: 'Цилиндр власти', mult: 4, color: 'border-sky-500 bg-sky-950/80', img: '/assets/games/pharaoh/cylinder_4.png' },
  { id: 'harp', name: 'Египетская арфа', mult: 2, color: 'border-emerald-500 bg-emerald-950/80', img: '/assets/games/pharaoh/harp_2.png' },
  { id: 'sistrum', name: 'Золотой систр', mult: 1, color: 'border-emerald-600 bg-emerald-900/80', img: '/assets/games/pharaoh/sistrum_1.png' },
] as const;

export const SYMBOLS = PHARAOH_SYMBOLS;

type SymbolId = (typeof PHARAOH_SYMBOLS)[number]['id'];
type SymbolDef = (typeof PHARAOH_SYMBOLS)[number];
type Phase = 'idle' | 'opening' | 'won' | 'lost';

const MIN_BET = 6;
const MAX_BET = 2293.67;
const DEFAULT_BET = 10;
const BET_STEPS = [6, 10, 20, 50, 100, 250, 500, 1000, 2293.67];

const WEIGHTS: Record<SymbolId, number> = {
  cat: 1,
  scroll: 2,
  nemes: 3,
  pyramid: 5,
  ring: 8,
  ankh: 12,
  canopic: 16,
  lotus: 20,
  cylinder: 24,
  harp: 28,
  sistrum: 32,
};

interface PharaohTreasureProps {
  onBack: () => void;
}

function roundMoney(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function clampBet(value: number): number {
  return roundMoney(Math.min(MAX_BET, Math.max(MIN_BET, value)));
}

function pickWeighted(): SymbolDef {
  const total = PHARAOH_SYMBOLS.reduce((sum, s) => sum + WEIGHTS[s.id], 0);
  let roll = Math.random() * total;
  for (const symbol of PHARAOH_SYMBOLS) {
    roll -= WEIGHTS[symbol.id];
    if (roll <= 0) return symbol;
  }
  return PHARAOH_SYMBOLS[PHARAOH_SYMBOLS.length - 1];
}

function formatTmtm(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function TileFace({
  symbol,
  size = 'md',
}: {
  symbol: SymbolDef | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const iconSize = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-2xl' : 'text-3xl';
  const pad = size === 'lg' ? 'p-2' : size === 'sm' ? 'p-1' : 'p-1.5';
  if (!symbol) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#3a2818] to-[#1a1008]">
        <span className={`${iconSize} leading-none text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]`}>
          𓂀
        </span>
        <span className="mt-0.5 text-[10px] text-cyan-300/90">◆</span>
      </div>
    );
  }
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center border-2 ${symbol.color} ${pad}`}>
      <div className="min-h-0 w-full flex-1">
        <img
          src={symbol.img}
          alt={symbol.name}
          className="h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          draggable={false}
        />
      </div>
      <span className="mt-0.5 shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-100/90">
        x{symbol.mult}
      </span>
    </div>
  );
}

function FlipTile({
  flipped,
  symbol,
  matched,
  size = 'md',
  className = '',
}: {
  flipped: boolean;
  symbol: SymbolDef | null;
  matched?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} style={{ perspective: 800 }}>
      <div className={`pharaoh-tile relative h-full w-full ${flipped ? 'is-flipped' : ''} ${matched ? 'pharaoh-match-glow rounded-xl' : ''}`}>
        <div className="pharaoh-tile-face absolute inset-0 overflow-hidden rounded-xl ring-2 ring-amber-600/80">
          <TileFace symbol={null} size={size} />
        </div>
        <div className="pharaoh-tile-face pharaoh-tile-back absolute inset-0 overflow-hidden rounded-xl ring-2 ring-amber-500/90">
          <TileFace symbol={symbol} size={size} />
        </div>
      </div>
    </div>
  );
}

export function PharaohTreasure({ onBack }: PharaohTreasureProps) {
  const { balance, applyBalance, refresh, publicId } = useWallet();
  const { showToast } = useToast();
  const [bet, setBet] = useState(DEFAULT_BET);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('СДЕЛАЙТЕ СТАВКУ');
  const [prize, setPrize] = useState<SymbolDef | null>(null);
  const [board, setBoard] = useState<(SymbolDef | null)[]>(() => Array(6).fill(null));
  const [prizeFlipped, setPrizeFlipped] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState<boolean[]>(() => Array(6).fill(false));
  const [matched, setMatched] = useState<boolean[]>(() => Array(6).fill(false));
  const [muted, setMuted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [betSheetOpen, setBetSheetOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const setBalance = useCallback(
    async (next: number) => {
      const safe = roundMoney(next);
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

  const resetBoardVisual = () => {
    setPrize(null);
    setBoard(Array(6).fill(null));
    setPrizeFlipped(false);
    setBoardFlipped(Array(6).fill(false));
    setMatched(Array(6).fill(false));
    setWinAmount(0);
  };

  const finishRound = useCallback(
    async (prizeSymbol: SymbolDef, tiles: SymbolDef[], stake: number) => {
      const hits = tiles.map((tile) => tile.id === prizeSymbol.id);
      const anyHit = hits.some(Boolean);
      setMatched(hits);

      if (anyHit) {
        const payout = roundMoney(stake * prizeSymbol.mult);
        setWinAmount(payout);
        setPhase('won');
        setStatus(`ВЫИГРЫШ: ${formatTmtm(payout)} TMTM!`);
        await setBalance(balanceRef.current + payout);
        if (!muted) showToast(`Выигрыш ${formatTmtm(payout)} TMTM`);
      } else {
        setPhase('lost');
        setStatus('ВЫ ПРОИГРАЛИ');
      }

      busyRef.current = false;

      if (autoplayRef.current) {
        const id = window.setTimeout(() => {
          void startRoundRef.current();
        }, 1600);
        timersRef.current.push(id);
      }
    },
    [muted, setBalance, showToast],
  );

  const startRoundRef = useRef<() => Promise<void>>(async () => undefined);

  const startRound = useCallback(async () => {
    if (busyRef.current) return;
    const stake = clampBet(bet);
    if (stake < MIN_BET) {
      showToast(`Минимум ${MIN_BET} TMTM`);
      return;
    }
    if (stake > balanceRef.current) {
      showToast('Недостаточно средств');
      setAutoplay(false);
      return;
    }

    busyRef.current = true;
    clearTimers();
    resetBoardVisual();
    setPhase('opening');
    setStatus('ОТКРЫВАЕМ...');

    const ok = await setBalance(balanceRef.current - stake);
    if (!ok) {
      busyRef.current = false;
      setPhase('idle');
      setStatus('СДЕЛАЙТЕ СТАВКУ');
      showToast('Не удалось списать ставку');
      setAutoplay(false);
      return;
    }

    const prizeSymbol = pickWeighted();
    const tiles = Array.from({ length: 6 }, () => pickWeighted());
    setPrize(prizeSymbol);
    setBoard(tiles);

    const prizeTimer = window.setTimeout(() => setPrizeFlipped(true), 280);
    timersRef.current.push(prizeTimer);

    tiles.forEach((_, index) => {
      const t = window.setTimeout(() => {
        setBoardFlipped((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
        if (index === tiles.length - 1) {
          const done = window.setTimeout(() => {
            void finishRound(prizeSymbol, tiles, stake);
          }, 450);
          timersRef.current.push(done);
        }
      }, 700 + index * 420);
      timersRef.current.push(t);
    });
  }, [bet, finishRound, setBalance, showToast]);

  startRoundRef.current = startRound;

  const cycleBet = () => {
    if (busyRef.current) return;
    const idx = BET_STEPS.findIndex((step) => step >= bet);
    const next = BET_STEPS[(idx + 1) % BET_STEPS.length] ?? DEFAULT_BET;
    setBet(clampBet(Math.min(next, balanceRef.current || next)));
  };

  const statusTone = useMemo(() => {
    if (phase === 'won') return 'from-emerald-400 to-lime-500 text-emerald-950';
    if (phase === 'lost') return 'from-rose-400 to-red-500 text-white';
    if (phase === 'opening') return 'from-amber-300 to-yellow-500 text-amber-950';
    return 'from-[#f0d080] to-[#d4a017] text-[#3b2a14]';
  }, [phase]);

  return (
    <div className="pharaoh-root relative h-[100dvh] max-h-[100dvh] w-full overflow-hidden text-white">
      <div className="pharaoh-bg pharaoh-columns pointer-events-none absolute inset-0" />
      <div className="pharaoh-sand" />

      <div className="relative z-10 flex h-full flex-col pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),8px)]">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 ring-1 ring-amber-500/40 active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-3 pr-1 ring-1 ring-amber-500/30">
            <span className="text-sm font-black tabular-nums text-amber-200">
              {formatTmtm(balance)} TMTM
            </span>
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white active:scale-90"
              aria-label="Пополнить"
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
        </header>

        {/* Status row */}
        <div className="mt-3 flex shrink-0 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-amber-600 to-amber-900 ring-2 ring-amber-400/50 active:scale-90"
            aria-label={muted ? 'Звук выключен' : 'Звук'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>

          <div
            className={`pharaoh-banner flex min-h-[40px] flex-1 items-center justify-center rounded-xl px-3 py-2 text-center text-[13px] font-black uppercase tracking-wide bg-gradient-to-b ${statusTone}`}
          >
            {status}
          </div>

          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-amber-500 to-amber-800 text-amber-50 ring-2 ring-amber-300/60 active:scale-90"
            aria-label="Правила"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Board */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="pharaoh-wings relative">
            <div className="pharaoh-frame rounded-2xl p-[3px]">
              <FlipTile
                flipped={prizeFlipped}
                symbol={prize}
                matched={phase === 'won'}
                size="lg"
                className="h-[5.5rem] w-[5.5rem]"
              />
            </div>
          </div>

          <div className="pharaoh-frame w-full max-w-[320px] rounded-2xl p-2.5">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#1a1008]/90 p-2">
              {board.map((symbol, index) => (
                <FlipTile
                  key={index}
                  flipped={boardFlipped[index]}
                  symbol={symbol}
                  matched={matched[index]}
                  size="md"
                  className="aspect-square w-full"
                />
              ))}
            </div>
          </div>

          {phase === 'won' && winAmount > 0 && (
            <p className="text-center text-sm font-bold text-amber-200 drop-shadow">
              ×{prize?.mult} · +{formatTmtm(winAmount)} TMTM
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="z-20 flex shrink-0 flex-col items-center gap-3 px-4 pb-2">
          <button
            type="button"
            disabled={busyRef.current && phase === 'opening'}
            onClick={() => setBetSheetOpen(true)}
            className="rounded-xl border-2 border-amber-600/80 bg-gradient-to-b from-[#3a2818] to-[#1a1008] px-5 py-1.5 text-sm font-black tabular-nums text-amber-100 shadow-lg active:scale-95 disabled:opacity-60"
          >
            {formatTmtm(bet)} TMTM
          </button>

          <div className="flex w-full max-w-sm items-center justify-between gap-4 px-2">
            <button
              type="button"
              disabled={phase === 'opening'}
              onClick={cycleBet}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-500 to-fuchsia-800 ring-2 ring-violet-300/40 active:scale-90 disabled:opacity-50"
              aria-label="Изменить ставку"
            >
              <Coins className="h-7 w-7 text-amber-200" />
            </button>

            <button
              type="button"
              disabled={phase === 'opening'}
              onClick={() => void startRound()}
              className="pharaoh-play flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-gradient-to-b from-lime-400 to-green-600 active:scale-95 disabled:opacity-60"
              aria-label="Старт"
            >
              <Play className="h-9 w-9 fill-white text-white" />
            </button>

            <button
              type="button"
              disabled={phase === 'opening'}
              onClick={() => {
                setAutoplay((v) => {
                  const next = !v;
                  if (next && phase !== 'opening') {
                    window.setTimeout(() => void startRoundRef.current(), 0);
                  }
                  return next;
                });
              }}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-500 to-fuchsia-800 ring-2 active:scale-90 disabled:opacity-50 ${
                autoplay ? 'ring-lime-300/80' : 'ring-violet-300/40'
              }`}
              aria-label="Автоигра"
            >
              <RefreshCw className={`h-7 w-7 text-amber-200 ${autoplay ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Rules modal */}
      {rulesOpen && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-6 sm:items-center"
          onClick={() => setRulesOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Как играть"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl px-4 pb-5 pt-4 text-[#3b2a14]"
            style={{
              background: 'linear-gradient(180deg, #f4e1b8 0%, #e4c98a 40%, #d7b56a 100%)',
              boxShadow: 'inset 0 0 0 3px #c4a15a, 0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={() => setRulesOpen(false)}
              className="absolute right-3 top-3 rounded-full bg-black/10 p-1"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-700/30 text-2xl ring-2 ring-amber-700/40">
              𓂀
            </div>
            <h2 className="mb-3 text-center text-xl font-black tracking-wide text-[#5b3210]">
              КАК ИГРАТЬ?
            </h2>

            <ol className="mb-4 space-y-2 text-[13px] font-semibold leading-snug">
              <li>1. Игровое поле состоит из 6 символов, которые скрыты под изображениями плиток.</li>
              <li>
                2. Минимальная сумма ставки составляет {MIN_BET} TMTM, максимальная — {formatTmtm(MAX_BET)} TMTM.
                Размер начальной ставки определяется до начала игры.
              </li>
              <li>
                3. Вы получите выигрыш, если призовой символ совпадает с любым из шести символов на игровом поле.
              </li>
              <li>4. Призовой символ определяется случайным образом в каждом раунде.</li>
              <li>5. Если нет совпадения — вы проиграли и игра заканчивается.</li>
            </ol>

            <p className="mb-2 text-center text-xs font-black uppercase tracking-[0.2em] text-[#5b3210]">
              Коэффициенты
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PHARAOH_SYMBOLS.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col items-center rounded-xl border-2 px-1 py-2 ${item.color} text-white`}
                >
                  <img src={item.img} alt={item.name} className="h-8 w-8 object-contain" draggable={false} />
                  <span className="mt-1 text-[11px] font-black">x{item.mult}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-sm font-black uppercase tracking-wide text-[#5b3210]">
              Отзыщи сокровища фараона!
            </p>
          </div>
        </div>
      )}

      {/* Bet sheet */}
      {betSheetOpen && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setBetSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-[#1a1008] px-4 pb-6 pt-4 ring-1 ring-amber-600/40"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-center text-sm font-bold text-amber-100">Сумма ставки</p>
            <div className="grid grid-cols-3 gap-2">
              {BET_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    setBet(clampBet(step));
                    setBetSheetOpen(false);
                  }}
                  className={`rounded-xl py-2.5 text-sm font-bold active:scale-95 ${
                    bet === step
                      ? 'bg-amber-500 text-amber-950'
                      : 'bg-white/10 text-amber-50 ring-1 ring-white/10'
                  }`}
                >
                  {formatTmtm(step)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {depositOpen && (
        <DepositModal
          publicId={publicId}
          onClose={() => setDepositOpen(false)}
          onWallet={() => setDepositOpen(false)}
        />
      )}
    </div>
  );
}
