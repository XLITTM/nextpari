import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { blockedGamesWager } from '@/lib/playerMoneyGate';
import { gameAction, PlayerGameError, startGame } from '@/lib/playerGames';
import { GameWalletBadge } from '@/components/games/GameWalletBadge';
import { Card, type CardScale } from './Card';
import { calculateHandScore, isBust, isGoldenOchko } from './deck';
import {
  CHIP_VALUES,
  MIN_STAKE,
  payoutAmount,
  resultCopy,
} from './engine';
import type { CardType, GameResult, GameStage } from './types';

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

function formatStake(value: number): string {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${shown} TMTM`;
}

function parseCards(value: unknown): CardType[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const card = raw as { suit?: string; rank?: string; value?: number; isHidden?: boolean };
    return {
      suit: (card.suit ?? '♠') as CardType['suit'],
      rank: (card.rank ?? 'A') as CardType['rank'],
      value: Number(card.value ?? 11),
      isHidden: card.isHidden === true,
    };
  });
}

function stageFromRound(state: string, publicResult: Record<string, unknown>): GameStage {
  if (state === 'settled' || state === 'cancelled') return 'gameOver';
  const stage = String(publicResult.stage ?? '');
  if (stage === 'playerTurn' || stage === 'dealerTurn' || stage === 'gameOver' || stage === 'betting') {
    return stage;
  }
  return 'playerTurn';
}

export function BlackjackGame({ onBack }: BlackjackGameProps) {
  const { balance, applyServerBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [roundId, setRoundId] = useState<string | null>(null);
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
  const busyRef = useRef(false);
  const balanceRef = useRef(balance);
  const stageRef = useRef(stage);
  const lastStakeRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const playerScore = useMemo(() => calculateHandScore(playerHand), [playerHand]);
  const dealerScore = useMemo(() => calculateHandScore(dealerHand), [dealerHand]);
  const playerBust = playerHand.length > 0 && isBust(playerHand);
  const inHand = stage === 'playerTurn' || stage === 'dealerTurn';
  const canBet = stage === 'betting' || stage === 'gameOver';
  const displayStake = stage === 'betting' ? stake : lockedStake || stake;

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

  const applyRound = useCallback((
    round: { roundId: string; state: string; payout: number; balanceAfter: number; publicResult: Record<string, unknown> },
    stakeValue: number,
  ) => {
    setRoundId(round.roundId);
    applyServerBalance(round.balanceAfter);
    const player = parseCards(round.publicResult.playerHand);
    const dealer = parseCards(round.publicResult.dealerHand);
    setPlayerHand(player);
    setDealerHand(dealer);
    const nextStage = stageFromRound(round.state, round.publicResult);
    setStage(nextStage);
    const outcome = (round.publicResult.result as GameResult) ?? (nextStage === 'gameOver' ? 'lose' : null);
    setResult(outcome);
    if (nextStage === 'gameOver' && outcome) {
      setHistory((prev) => [
        {
          id: Date.now(),
          result: outcome === 'blackjack' ? 'win' : outcome,
          stake: stakeValue,
          payout: round.payout,
          playerScore: calculateHandScore(player),
          dealerScore: calculateHandScore(dealer.map((card) => ({ ...card, isHidden: false }))),
        },
        ...prev,
      ].slice(0, 20));
    }
  }, [applyServerBalance]);

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
    if (now === 'playerTurn' || now === 'dealerTurn' || busyRef.current) return;
    if (amount < MIN_STAKE) {
      showToast(`Минимальная ставка — ${MIN_STAKE} TMTM`);
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

    beep(420, 0.12);
    setResult(null);
    setChipsOpen(false);
    setIsCustomBetModalOpen(false);
    setPlayerHand([]);
    setDealerHand([]);
    busyRef.current = true;
    try {
      const round = await startGame({ gameCode: 'blackjack', stake: amount });
      setLockedStake(amount);
      setStake(amount);
      lastStakeRef.current = amount;
      applyRound(round, amount);
    } catch (error) {
      setStage('betting');
      const code = error instanceof PlayerGameError ? error.code : '';
      showToast(code === 'INSUFFICIENT_AVAILABLE_BALANCE' ? 'Недостаточно средств' : 'Не удалось списать ставку');
      await refresh();
    } finally {
      busyRef.current = false;
    }
  };

  const play = () => {
    if (stage === 'dealerTurn' || stage === 'playerTurn') return;
    void beginRound(stake);
  };

  const hit = async () => {
    if (stage !== 'playerTurn' || !roundId || busyRef.current) return;
    beep(500);
    busyRef.current = true;
    try {
      const round = await gameAction({ roundId, action: 'hit' });
      applyRound(round, lockedStake);
    } catch (error) {
      const code = error instanceof PlayerGameError ? error.code : '';
      showToast(code || 'Действие недоступно');
      await refresh();
    } finally {
      busyRef.current = false;
    }
  };

  const stand = async () => {
    if (stage !== 'playerTurn' || !roundId || busyRef.current) return;
    beep(360);
    busyRef.current = true;
    try {
      const round = await gameAction({ roundId, action: 'stand' });
      applyRound(round, lockedStake);
    } catch (error) {
      const code = error instanceof PlayerGameError ? error.code : '';
      showToast(code || 'Действие недоступно');
      await refresh();
    } finally {
      busyRef.current = false;
    }
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
  const statusLabel = stage === 'playerTurn'
    ? 'ВЫБЕРИТЕ ДЕЙСТВИЕ'
    : stage === 'dealerTurn'
      ? 'ХОД ДИЛЕРА'
      : stage === 'gameOver'
        ? banner.title.toUpperCase()
        : 'СДЕЛАЙТЕ СТАВКУ';
  const rowButtons = [
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
            <GameWalletBadge
              format={formatStake}
              labelClassName="text-[8px] font-semibold uppercase tracking-wide text-[#f5e6a8]/70"
              valueClassName="text-[11px] font-black tabular-nums text-white"
            />
          </div>
        </header>
        <div className="mx-3 mb-2 rounded-lg bg-white px-3 py-2 text-center shadow-md">
          <p className="text-[12px] font-black tracking-[0.16em] text-slate-800">{statusLabel}</p>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between py-2">
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

        <HandStrip
          cards={dealerHand}
          score={dealerScore}
          golden={isGoldenOchko(dealerHand)}
        />

        <div className="flex min-h-[4.5rem] items-center justify-center px-10">
          {stage === 'gameOver' && result ? (
            <ResultBanner
              title={banner.title}
              subtitle={banner.subtitle}
              result={result}
              payout={payoutAmount(lockedStake, result)}
            />
          ) : null}
        </div>

        <HandStrip
          cards={playerHand}
          score={playerScore}
          golden={isGoldenOchko(playerHand)}
        />
      </div>

      <div className="relative z-20 flex shrink-0 flex-col pb-[env(safe-area-inset-bottom,16px)]">
        <div className="px-3 pt-1">
          {stage === 'playerTurn' || stage === 'dealerTurn' ? (
            <>
              <div className="mb-3 flex justify-center">
                <div className="rounded-xl border border-white/20 bg-[#8b2cf5] px-6 py-2 font-bold text-white">
                  {formatStake(displayStake)}
                </div>
              </div>
              {stage === 'playerTurn' && (
                <div className="mb-3 flex gap-3">
                  <button
                    type="button"
                    onClick={stand}
                    className="flex-1 rounded-xl border border-red-400/30 bg-gradient-to-b from-red-600 to-rose-900 py-3.5 font-black text-white shadow-lg active:translate-y-[1px]"
                  >
                    СТОП
                  </button>
                  <button
                    type="button"
                    onClick={hit}
                    className="flex-1 rounded-xl border border-cyan-300/40 bg-gradient-to-b from-cyan-400 to-teal-600 py-3.5 font-black text-white shadow-lg active:translate-y-[1px]"
                  >
                    ЕЩЕ
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
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
                    disabled={btn.disabled || inHand}
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
                  disabled={inHand}
                  className="bj-play flex h-14 w-14 items-center justify-center rounded-full text-base font-black tracking-[0.14em] active:scale-95 disabled:opacity-50 sm:h-[4.6rem] sm:w-[4.6rem] sm:text-lg"
                  aria-label="PLAY"
                >
                  PLAY
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
            </>
          )}
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
                    <p className={`text-sm font-black tabular-nums ${
                      row.result === 'push'
                        ? 'text-white/80'
                        : row.payout > 0
                          ? 'text-emerald-300'
                          : 'text-white/80'
                    }`}>
                      {row.result === 'push'
                        ? `возврат ${formatStake(row.stake)}`
                        : row.payout > 0
                          ? `+${formatStake(row.payout)}`
                          : `−${formatStake(row.stake)}`}
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
            <li>Туз — 11, валет — 2, дама — 3, король — 4, остальные карты — по номиналу.</li>
            <li>Две карты дилера открыты с начала раунда, очки считаются сразу по обеим.</li>
            <li>Два туза — золотое очко, мгновенная победа.</li>
            <li>Дилер останавливается на 17 и выше.</li>
            <li>Равный счёт с дилером — ничья, ставка возвращается.</li>
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

function handLayout(count: number): { scale: CardScale; gap: string } {
  if (count >= 4) return { scale: 'sm', gap: 'gap-1.5' };
  if (count === 3) return { scale: 'md', gap: 'gap-2' };
  return { scale: 'lg', gap: 'gap-3' };
}

function HandStrip({
  cards,
  score,
}: {
  cards: CardType[];
  score: number;
  golden?: boolean;
}) {
  const { scale, gap } = handLayout(cards.length);

  return (
    <div className="flex min-h-[8.5rem] w-full flex-nowrap items-center justify-center gap-3 px-10 sm:min-h-[10rem]">
      <div className={`flex flex-row flex-nowrap items-center justify-center transition-all duration-300 ${gap}`}>
        {cards.map((card, index) => (
          <Card
            key={`${card.rank}${card.suit}-${index}`}
            card={card}
            delay={index * 90}
            scale={scale}
          />
        ))}
      </div>
      {cards.length > 0 && (
        <div className="min-w-[48px] shrink-0 rounded-xl border border-white/10 bg-[#182333]/90 px-3.5 py-2 text-center text-xl font-bold text-white shadow-lg">
          {score}
        </div>
      )}
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
      {win && payout > 0 && <p className="mt-1 text-sm font-black">+{formatStake(payout)}</p>}
      {result === 'push' && payout > 0 && (
        <p className="mt-1 text-sm font-black">Возврат {formatStake(payout)}</p>
      )}
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
