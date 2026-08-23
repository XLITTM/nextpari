import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  CircleHelp,
  History,
  Pencil,
  Coins,
  RefreshCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { Card } from './Card';
import { calculateHandScore, freshShuffledDeck, isBust, isGoldenOchko } from './deck';
import {
  CHIP_VALUES,
  DEALER_DRAW_DELAY_MS,
  MIN_STAKE,
  dealInitialHands,
  dealerShouldHit,
  hitHand,
  payoutAmount,
  resolveResult,
  resultCopy,
  revealDealer,
} from './engine';
import type { CardType, GameResult, GameStage } from './types';
import { persistWalletBalance } from './wallet';

interface BlackjackGameProps {
  onBack: () => void;
}

interface RoundRecord {
  id: number;
  result: Exclude<GameResult, null>;
  stake: number;
  payout: number;
  playerScore: number;
  dealerScore: number;
}

const CHIP_STYLES: Record<number, string> = {
  1: 'from-slate-100 to-white text-slate-800 ring-[#e4c56a]',
  5: 'from-rose-500 to-red-700 text-white ring-[#e4c56a]',
  10: 'from-sky-500 to-blue-700 text-white ring-[#e4c56a]',
  25: 'from-emerald-500 to-green-800 text-white ring-[#e4c56a]',
  50: 'from-orange-400 to-amber-700 text-white ring-[#e4c56a]',
  100: 'from-zinc-800 to-black text-amber-300 ring-[#e4c56a]',
};

const FAN_CARDS = [
  { rot: -46, x: -62, y: 22, rank: 'A', suit: '♥', red: true },
  { rot: -28, x: -38, y: 6, rank: 'K', suit: '♠', red: false },
  { rot: -12, x: -16, y: -2, rank: 'Q', suit: '♦', red: true },
  { rot: 12, x: 16, y: -2, rank: 'J', suit: '♣', red: false },
  { rot: 28, x: 38, y: 6, rank: '10', suit: '♥', red: true },
  { rot: 46, x: 62, y: 22, rank: 'A', suit: '♠', red: false },
] as const;

function formatStake(value: number): string {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${shown} TMTM`;
}

export function BlackjackGame({ onBack }: BlackjackGameProps) {
  const { balance, applyBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [deck, setDeck] = useState<CardType[]>(() => freshShuffledDeck());
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [stage, setStage] = useState<GameStage>('betting');
  const [result, setResult] = useState<GameResult>(null);
  const [stake, setStake] = useState(0);
  const [lockedStake, setLockedStake] = useState(0);
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [isCustomBetModalOpen, setIsCustomBetModalOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const paidRef = useRef(false);
  const balanceRef = useRef(balance);
  const deckRef = useRef(deck);
  const playerRef = useRef(playerHand);
  const dealerRef = useRef(dealerHand);
  const stakeRef = useRef(lockedStake);
  const stageRef = useRef(stage);
  const lastStakeRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  useEffect(() => {
    playerRef.current = playerHand;
  }, [playerHand]);
  useEffect(() => {
    dealerRef.current = dealerHand;
  }, [dealerHand]);
  useEffect(() => {
    stakeRef.current = lockedStake;
  }, [lockedStake]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const playerScore = useMemo(() => calculateHandScore(playerHand), [playerHand]);
  const dealerScore = useMemo(() => calculateHandScore(dealerHand), [dealerHand]);
  const playerBust = playerHand.length > 0 && isBust(playerHand);
  const inHand = stage === 'playerTurn' || stage === 'dealerTurn';
  const canBet = stage === 'betting' || stage === 'gameOver';
  const displayStake = stage === 'betting' ? stake : lockedStake || stake;
  const canDoubleDown = stage === 'playerTurn' && playerHand.length === 2 && lockedStake <= balance;

  const beep = useCallback((freq: number, dur = 0.09) => {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioRef.current ??= new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      /* ignore autoplay limits */
    }
  }, [soundOn]);

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

  const settle = useCallback(
    async (player: CardType[], dealer: CardType[], stakeValue: number) => {
      if (paidRef.current) return;
      paidRef.current = true;
      const outcome = resolveResult(player, dealer);
      if (!outcome) return;
      const payout = payoutAmount(stakeValue, outcome);
      setResult(outcome);
      setStage('gameOver');
      setHistory((prev) => [
        {
          id: Date.now(),
          result: outcome,
          stake: stakeValue,
          payout,
          playerScore: calculateHandScore(player),
          dealerScore: calculateHandScore(dealer),
        },
        ...prev,
      ].slice(0, 20));
      if (payout > 0) await setBalance(balanceRef.current + payout);
    },
    [setBalance],
  );

  useEffect(() => {
    if (stage !== 'dealerTurn') return;

    if (dealerHand.some((card) => card.isHidden)) {
      const id = window.setTimeout(() => {
        setDealerHand((prev) => revealDealer(prev));
      }, 280);
      return () => window.clearTimeout(id);
    }

    const playerNatural = isGoldenOchko(playerHand);
    if (playerNatural || !dealerShouldHit(dealerHand)) {
      const id = window.setTimeout(() => {
        void settle(playerRef.current, dealerRef.current, stakeRef.current);
      }, DEALER_DRAW_DELAY_MS);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      const next = hitHand(deckRef.current, dealerRef.current);
      deckRef.current = next.deck;
      setDeck(next.deck);
      setDealerHand(next.hand);
    }, DEALER_DRAW_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [dealerHand, playerHand, settle, stage]);

  const setStakeSafe = (next: number) => {
    if (!canBet) return;
    const capped = Math.min(Math.max(0, Number(next.toFixed(2))), balanceRef.current);
    setStake(capped);
  };

  const addChip = (value: number) => {
    if (!canBet) return;
    if (stake + value > balance) {
      showToast('Недостаточно средств');
      return;
    }
    beep(740);
    setStake((prev) => Number((prev + value).toFixed(2)));
  };

  const openStakeModal = () => {
    if (!canBet) return;
    setChipsOpen(false);
    setIsCustomBetModalOpen(true);
  };

  const applyManualStake = (amount: number) => {
    setStakeSafe(amount);
    setIsCustomBetModalOpen(false);
    beep(700);
  };

  const betMin = () => {
    if (!canBet) return;
    if (balance < MIN_STAKE) {
      showToast(`Минимальная ставка — ${MIN_STAKE} TMTM`);
      return;
    }
    beep(620);
    setStakeSafe(MIN_STAKE);
  };

  const betDouble = () => {
    if (!canBet) return;
    const base = stake > 0 ? stake * 2 : MIN_STAKE;
    if (base > balance) {
      showToast('Недостаточно средств');
      return;
    }
    beep(680);
    setStakeSafe(base);
  };

  const betHalf = () => {
    if (!canBet || stake <= 0) return;
    beep(560);
    const next = stake / 2;
    setStakeSafe(next > 0 && next < MIN_STAKE ? MIN_STAKE : next);
  };

  const betMax = () => {
    if (!canBet) return;
    beep(800);
    setStakeSafe(balance);
  };

  const beginRound = async (amount: number) => {
    const now = stageRef.current;
    if (now === 'playerTurn' || now === 'dealerTurn') return;
    if (amount < MIN_STAKE) {
      showToast(`Минимальная ставка — ${MIN_STAKE} TMTM`);
      return;
    }
    if (amount > balanceRef.current) {
      showToast('Недостаточно средств');
      return;
    }

    beep(420, 0.12);
    paidRef.current = false;
    setResult(null);
    setChipsOpen(false);
    setIsCustomBetModalOpen(false);
    setPlayerHand([]);
    setDealerHand([]);

    const debited = await setBalance(balanceRef.current - amount);
    if (!debited) {
      showToast('Не удалось списать ставку');
      setStage('betting');
      return;
    }

    setLockedStake(amount);
    setStake(amount);
    stakeRef.current = amount;
    lastStakeRef.current = amount;

    const dealt = dealInitialHands(deckRef.current);
    deckRef.current = dealt.deck;
    setDeck(dealt.deck);
    setPlayerHand(dealt.playerHand);
    setDealerHand(dealt.dealerHand);

    const playerGolden = isGoldenOchko(dealt.playerHand);
    if (playerGolden) {
      const revealed = revealDealer(dealt.dealerHand);
      setDealerHand(revealed);
      void settle(dealt.playerHand, revealed, amount);
      return;
    }
    setStage(calculateHandScore(dealt.playerHand) >= 21 ? 'dealerTurn' : 'playerTurn');
  };

  const play = () => {
    if (stage === 'dealerTurn') return;
    if (stage === 'playerTurn') {
      hit();
      return;
    }
    void beginRound(stake);
  };

  const hit = () => {
    if (stage !== 'playerTurn') return;
    beep(500);
    const next = hitHand(deckRef.current, playerHand);
    deckRef.current = next.deck;
    setDeck(next.deck);
    setPlayerHand(next.hand);
    if (isBust(next.hand)) {
      setDealerHand((prev) => revealDealer(prev));
      void settle(next.hand, revealDealer(dealerHand), lockedStake);
    }
  };

  const stand = () => {
    if (stage !== 'playerTurn') return;
    beep(360);
    setStage('dealerTurn');
  };

  const doubleDown = async () => {
    if (stage !== 'playerTurn' || playerHand.length !== 2) return;
    if (lockedStake > balanceRef.current) {
      showToast('Недостаточно средств для удвоения');
      return;
    }
    const debited = await setBalance(balanceRef.current - lockedStake);
    if (!debited) {
      showToast('Недостаточно средств для удвоения');
      return;
    }
    beep(640);
    const nextStake = lockedStake * 2;
    setLockedStake(nextStake);
    stakeRef.current = nextStake;
    const next = hitHand(deckRef.current, playerHand);
    deckRef.current = next.deck;
    setDeck(next.deck);
    setPlayerHand(next.hand);
    if (isBust(next.hand)) {
      setDealerHand((prev) => revealDealer(prev));
      void settle(next.hand, revealDealer(dealerHand), nextStake);
      return;
    }
    setStage('dealerTurn');
  };

  const repeatBet = () => {
    if (inHand) return;
    const amount = lastStakeRef.current || stake;
    if (amount < 1) {
      showToast('Нет предыдущей ставки');
      return;
    }
    const next = Math.min(amount, balanceRef.current);
    setStake(next);
    beep(700);
    if (stage === 'gameOver') void beginRound(next);
  };

  const banner = resultCopy(result, playerBust);
  const playLabel = stage === 'playerTurn' ? 'ЕЩЁ' : 'PLAY';
  const rowButtons = stage === 'playerTurn'
    ? [
        { id: 'hit', label: 'ЕЩЁ', onClick: hit, disabled: false },
        { id: 'stand', label: 'СТОП', onClick: stand, disabled: false },
        { id: 'dbl', label: 'X2', onClick: () => void doubleDown(), disabled: !canDoubleDown },
        { id: 'max', label: 'MAX', onClick: () => undefined, disabled: true },
      ]
    : [
        { id: 'min', label: 'MIN', onClick: betMin, disabled: !canBet || balance < MIN_STAKE },
        { id: 'x2', label: 'X2', onClick: betDouble, disabled: !canBet },
        { id: 'half', label: 'X/2', onClick: betHalf, disabled: !canBet || stake <= 0 },
        { id: 'max', label: 'MAX', onClick: betMax, disabled: !canBet || balance < MIN_STAKE },
      ];

  return (
    <div className="bj-felt relative mx-auto flex h-[100dvh] w-full max-w-md flex-col justify-between overflow-hidden overscroll-none text-white shadow-2xl max-md:max-w-none">
      <div className="relative z-20 flex shrink-0 flex-col pt-[env(safe-area-inset-top,16px)]">
        <header className="flex h-11 shrink-0 items-center justify-between px-2 sm:h-12">
          <button
            type="button"
            onClick={onBack}
            className="bj-glass flex h-9 w-9 items-center justify-center rounded-full text-[#f5e6a8] active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-[11px] font-black tracking-[0.22em] text-[#f5e6a8]">NEXTPARI · 21</p>
          <div className="bj-glass min-w-[4.75rem] rounded-full px-3 py-1 text-right">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-[#f5e6a8]/70">Баланс</p>
            <p className="text-[11px] font-black tabular-nums text-white">{formatStake(balance)}</p>
          </div>
        </header>
        <section className="flex flex-col items-center px-2 pb-1">
          <ScoreBadge
            label="Дилер"
            score={dealerHand.length ? dealerScore : null}
            golden={isGoldenOchko(dealerHand) && stage !== 'playerTurn'}
          />
          <HandRow cards={dealerHand} />
        </section>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center">
        <aside className="absolute left-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 sm:gap-3">
          <RailButton label="История" onClick={() => setHistoryOpen(true)}>
            <History className="h-5 w-5" />
          </RailButton>
          <RailButton label="Помощь" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="h-5 w-5" />
          </RailButton>
          <RailButton label={soundOn ? 'Звук' : 'Без звука'} onClick={() => setSoundOn((v) => !v)}>
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </RailButton>
        </aside>
        <div className="flex min-h-0 flex-col items-center justify-center px-12">
          <CenterEmblem dimmed={playerHand.length > 0} />
          {stage === 'gameOver' && result ? (
            <div className="mt-1">
              <ResultBanner
                title={banner.title}
                subtitle={banner.subtitle}
                result={result}
                payout={payoutAmount(lockedStake, result)}
              />
            </div>
          ) : (
            <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-[#f5e6a8]/55">
              {stage === 'betting' ? 'Сделайте ставку' : stage === 'dealerTurn' ? 'Ход дилера' : 'Ваш ход'}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-20 flex shrink-0 flex-col pb-[env(safe-area-inset-bottom,16px)]">
        <section className="flex flex-col items-center px-2 pt-1">
          <HandRow cards={playerHand} />
          <ScoreBadge
            label="Вы"
            score={playerHand.length ? playerScore : null}
            golden={isGoldenOchko(playerHand)}
          />
        </section>

        <div className="px-3 pt-1">
          {chipsOpen && canBet && (
            <div className="mb-2 grid grid-cols-6 gap-1.5">
              {CHIP_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => addChip(value)}
                  disabled={stake + value > balance}
                  className={`flex h-10 flex-col items-center justify-center rounded-full bg-gradient-to-b text-[11px] font-black shadow-lg ring-2 disabled:opacity-35 sm:h-11 ${CHIP_STYLES[value] ?? ''}`}
                >
                  {value}
                  <span className="text-[7px] font-bold opacity-80">TMTM</span>
                </button>
              ))}
            </div>
          )}

          <div className="mx-auto mb-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={openStakeModal}
              disabled={!canBet}
              className="bj-bet-pill flex min-w-[7.5rem] items-center justify-center gap-2 rounded-full px-5 py-1.5 text-sm font-black tabular-nums text-white active:scale-[0.98] disabled:opacity-40"
              aria-label="Изменить ставку"
            >
              {formatStake(displayStake)}
            </button>
            <button
              type="button"
              onClick={openStakeModal}
              disabled={!canBet}
              className="bj-round flex h-9 w-9 items-center justify-center rounded-full text-[#f5e6a8] active:scale-95 disabled:opacity-40"
              aria-label="Ручной ввод ставки"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-4 gap-2 sm:mb-3">
            {rowButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={btn.onClick}
                disabled={btn.disabled || stage === 'dealerTurn'}
                className="bj-ctrl h-9 rounded-xl text-[10px] font-black tracking-wide active:translate-y-[1px] disabled:opacity-40 sm:h-10 sm:text-[11px]"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-6 sm:gap-7">
            <button
              type="button"
              onClick={() => canBet && setIsCustomBetModalOpen(true)}
              disabled={!canBet}
              className="bj-round flex h-11 w-11 items-center justify-center rounded-full text-[#f5e6a8] active:scale-95 disabled:opacity-40 sm:h-12 sm:w-12"
              aria-label="Ручной ввод ставки"
            >
              <Coins className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={play}
              disabled={stage === 'dealerTurn'}
              className="bj-play flex h-14 w-14 items-center justify-center rounded-full text-base font-black tracking-[0.14em] active:scale-95 disabled:opacity-50 sm:h-[4.6rem] sm:w-[4.6rem] sm:text-lg"
              aria-label={playLabel}
            >
              {playLabel}
            </button>
            <button
              type="button"
              onClick={repeatBet}
              disabled={inHand}
              className="bj-round flex h-11 w-11 items-center justify-center rounded-full text-[#f5e6a8] active:scale-95 disabled:opacity-40 sm:h-12 sm:w-12"
              aria-label="Повторить ставку"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {historyOpen && (
        <Drawer title="История раздач" onClose={() => setHistoryOpen(false)}>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/60">Пока нет раздач</p>
          ) : (
            <div className="space-y-2">
              {history.map((row) => (
                <div key={row.id} className="bj-glass rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-[#f5e6a8]">{resultLabel(row.result)}</p>
                    <p className={`text-sm font-black tabular-nums ${row.payout > 0 ? 'text-emerald-300' : 'text-white/80'}`}>
                      {row.payout > 0 ? `+${formatStake(row.payout)}` : `−${formatStake(row.stake)}`}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-white/65">
                    Вы {row.playerScore} · Дилер {row.dealerScore} · ставка {formatStake(row.stake)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Drawer>
      )}

      {helpOpen && (
        <Drawer title="Правила 21 / Очко" onClose={() => setHelpOpen(false)}>
          <ul className="space-y-2 text-sm leading-relaxed text-white/80">
            <li>Цель — набрать 21 очко или больше, чем у дилера, без перебора.</li>
            <li>Туз считается за 11. Картинки — 10. Остальные карты — по номиналу.</li>
            <li>Два туза — золотое очко, мгновенная победа.</li>
            <li>Дилер останавливается на 17 и выше.</li>
            <li>Выплата при победе — 1:1 от ставки.</li>
          </ul>
        </Drawer>
      )}

      <StakeInputModal
        open={isCustomBetModalOpen}
        current={stake}
        balance={balance}
        onClose={() => setIsCustomBetModalOpen(false)}
        onApply={applyManualStake}
      />
    </div>
  );
}

function resultLabel(result: Exclude<GameResult, null>): string {
  if (result === 'golden') return 'Золотое очко';
  if (result === 'win' || result === 'blackjack') return 'Победа';
  if (result === 'push') return 'Ничья';
  return 'Проигрыш';
}

function CenterEmblem({ dimmed }: { dimmed: boolean }) {
  const rawId = useId().replace(/:/g, '');
  const fill = `spadeFill-${rawId}`;
  const gold = `spadeGold-${rawId}`;
  const glow = `spadeGlow-${rawId}`;

  return (
    <div className={`bj-emblem ${dimmed ? 'opacity-55' : 'opacity-95'}`} aria-hidden>
      <div className="bj-fan">
        {FAN_CARDS.map((card) => (
          <div
            key={`${card.rank}${card.suit}${card.rot}`}
            className="bj-fan-card"
            style={{ transform: `translate(${card.x}px, ${card.y}px) rotate(${card.rot}deg)` }}
          >
            <span className={`text-[10px] ${card.red ? 'text-red-600' : 'text-slate-900'}`}>{card.rank}</span>
            <span className={`text-sm ${card.red ? 'text-red-600' : 'text-slate-900'}`}>{card.suit}</span>
          </div>
        ))}
      </div>
      <svg className="bj-spade" viewBox="0 0 200 230" fill="none">
        <defs>
          <radialGradient id={fill} cx="50%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#145c52" />
            <stop offset="55%" stopColor="#072422" />
            <stop offset="100%" stopColor="#020908" />
          </radialGradient>
          <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="45%" stopColor="#e4c56a" />
            <stop offset="100%" stopColor="#8a6a12" />
          </linearGradient>
          <filter id={glow} x="-30%" y="-20%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#f5e6a8" floodOpacity="0.55" />
            <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#d4af37" floodOpacity="0.35" />
            <feDropShadow dx="0" dy="16" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>
        <path
          filter={`url(#${glow})`}
          fill={`url(#${fill})`}
          stroke={`url(#${gold})`}
          strokeWidth="5"
          d="M100 14C58 68 24 102 24 142c0 34 26 56 60 56 8 0 14-1 16-8 2 7 8 8 16 8 34 0 60-22 60-56 0-40-34-74-76-128Z"
        />
        <path fill={`url(#${gold})`} d="M88 186c2-8 6-12 12-16 6 4 10 8 12 16l-8 32H96l-8-32Z" />
        <text
          x="100"
          y="128"
          textAnchor="middle"
          fill="#e8cc76"
          fontSize="64"
          fontWeight="900"
          letterSpacing="2"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
        >
          21
        </text>
      </svg>
    </div>
  );
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="bj-glass flex h-11 w-11 items-center justify-center rounded-full text-[#f5e6a8] active:scale-90"
    >
      {children}
    </button>
  );
}

function HandRow({ cards }: { cards: CardType[] }) {
  if (!cards.length) {
    return <div className="relative z-10 h-[clamp(3.4rem,11vh,5.4rem)]" />;
  }
  return (
    <div className="relative z-10 flex items-end justify-center pl-6">
      {cards.map((card, index) => (
        <div key={`${card.rank}${card.suit}-${index}`} className="-ml-6">
          <Card card={card} delay={index * 90} />
        </div>
      ))}
    </div>
  );
}

function ScoreBadge({ label, score, golden }: { label: string; score: number | null; golden?: boolean }) {
  return (
    <div className="bj-glass relative z-10 mb-1 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide text-[#f5e6a8]">
      {label}: {score == null ? '—' : golden ? `Золотое очко (${score})` : score}
    </div>
  );
}

function ResultBanner({
  title,
  subtitle,
  result,
  payout,
}: {
  title: string;
  subtitle: string;
  result: Exclude<GameResult, null>;
  payout: number;
}) {
  const win = result === 'win' || result === 'blackjack' || result === 'golden';
  return (
    <div
      className={`w-full max-w-[13.5rem] rounded-2xl px-4 py-3 text-center shadow-xl ring-1 ${
        win
          ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-emerald-950 ring-amber-200'
          : result === 'push'
            ? 'bg-white/90 text-slate-900 ring-white/70'
            : 'bg-rose-700 text-white ring-rose-300/40'
      }`}
    >
      <p className="text-lg font-black tracking-wide">{title}</p>
      <p className="text-xs font-semibold opacity-80">{subtitle}</p>
      {payout > 0 && <p className="mt-1 text-sm font-black">+{formatStake(payout)}</p>}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex bg-black/55" onClick={onClose}>
      <div
        className="mt-auto w-full rounded-t-3xl bg-[#071e1c] px-4 pb-6 pt-3 shadow-2xl ring-1 ring-[#e4c56a]/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black tracking-wide text-[#f5e6a8]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="bj-glass flex h-8 w-8 items-center justify-center rounded-full text-[#f5e6a8]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function StakeInputModal({
  open,
  current,
  balance,
  onClose,
  onApply,
}: {
  open: boolean;
  current: number;
  balance: number;
  onClose: () => void;
  onApply: (amount: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const maxStake = Number(Math.max(0, balance).toFixed(2));

  useEffect(() => {
    if (!open) return;
    setRaw(current > 0 ? String(current) : '');
    setError('');
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(id);
  }, [open, current]);

  if (!open) return null;

  const handleChange = (value: string) => {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '.') {
      setRaw(cleaned === '.' ? '0.' : '');
      setError('');
      return;
    }
    if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return;
    if (n > maxStake) {
      setRaw(maxStake > 0 ? String(maxStake) : '');
      setError(`Максимум — ${formatStake(maxStake)}`);
      return;
    }
    setRaw(cleaned);
    setError(n > 0 && n < MIN_STAKE ? `Минимальная ставка — ${MIN_STAKE} TMTM` : '');
  };

  const apply = () => {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw === '') {
      setError(`Минимальная ставка — ${MIN_STAKE} TMTM`);
      return;
    }
    if (n < MIN_STAKE) {
      setError(`Минимальная ставка — ${MIN_STAKE} TMTM`);
      return;
    }
    if (n > maxStake) {
      setError(`Максимум — ${formatStake(maxStake)}`);
      return;
    }
    onApply(Number(n.toFixed(2)));
  };

  return (
    <div
      className="bj-stake-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border-2 border-[#d4af37] bg-[#4c1d63] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-xl font-black text-[#d4af37] active:scale-90"
          aria-label="Закрыть"
        >
          ✕
        </button>
        <h2 className="mb-4 pr-8 text-center text-base font-black tracking-wide text-[#f5e6a8]">
          Ручной ввод ставки
        </h2>
        <p className="mb-2 text-center text-[11px] font-semibold text-white/70">
          Мин. {MIN_STAKE} TMTM · Макс. {formatStake(maxStake)}
        </p>
        <div className="relative mb-3">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoFocus
            value={raw}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply();
              if (event.key === 'Escape') onClose();
            }}
            placeholder={`${MIN_STAKE}`}
            aria-label="Сумма ставки"
            className="bj-stake-input w-full rounded-xl border-2 border-[#d4af37] bg-[#3b1650] py-3 pl-4 pr-11 text-center text-lg font-black tabular-nums text-white outline-none placeholder:text-white/30"
          />
          {raw !== '' && (
            <button
              type="button"
              onClick={() => {
                setRaw('');
                setError('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[#d4af37]"
              aria-label="Очистить"
            >
              ✕
            </button>
          )}
        </div>
        {error && <p className="mb-3 text-center text-xs font-bold text-amber-200">{error}</p>}
        <button
          type="button"
          onClick={apply}
          className="w-full rounded-xl border-2 border-[#d4af37] bg-gradient-to-b from-[#7a5cff] via-[#4c2d9e] to-[#2a1068] py-3.5 text-sm font-black tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_5px_0_#1a0a33,0_12px_22px_rgba(0,0,0,0.45)] active:translate-y-[1px]"
        >
          СДЕЛАТЬ СТАВКУ
        </button>
      </div>
    </div>
  );
}
