import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, Settings, Zap, X } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { persistWalletBalance } from '@/games/blackjack/wallet';
import { CrystalBoard } from './CrystalBoard';
import { CRYSTAL_BG } from './crystalAssets';
import { createBoard, PAYTABLE, resolveSpin, CELL_COUNT, type CrystalCell } from './crystalMath';

interface CrystalGameProps {
  onBack: () => void;
}

const MIN_BET = 1;
const DEFAULT_BET = '10';
const EMPTY_BOOM = new Array<boolean>(CELL_COUNT).fill(false);
const BANNER_MS = 1500;

function parseAmount(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type RoundBanner = { kind: 'win'; amount: number; multiplier: number } | { kind: 'lose' };

export function CrystalGame({ onBack }: CrystalGameProps) {
  const { balance, applyBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [betInput, setBetInput] = useState(DEFAULT_BET);
  const [board, setBoard] = useState<CrystalCell[]>(() => createBoard());
  const [exploding, setExploding] = useState<boolean[]>(EMPTY_BOOM);
  const [combo, setCombo] = useState(1);
  const [roundAccum, setRoundAccum] = useState(0);
  const [cascading, setCascading] = useState(false);
  const [banner, setBanner] = useState<RoundBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [instant, setInstant] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoMode, setAutoMode] = useState<0 | 5 | 10>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const balanceRef = useRef(balance);
  const busyRef = useRef(false);
  const instantRef = useRef(false);
  const autoLeftRef = useRef(0);
  const bannerTimer = useRef<number>(0);
  balanceRef.current = balance;
  instantRef.current = instant;

  const clearBannerTimer = () => {
    if (bannerTimer.current) {
      window.clearTimeout(bannerTimer.current);
      bannerTimer.current = 0;
    }
  };

  const showRoundBanner = (next: RoundBanner) => {
    clearBannerTimer();
    setBanner(next);
    bannerTimer.current = window.setTimeout(() => {
      setBanner(null);
      bannerTimer.current = 0;
    }, BANNER_MS);
  };

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

  const setBet = (value: number) => {
    if (busyRef.current) return;
    setBetInput(String(Math.max(MIN_BET, Number(value.toFixed(2)))));
  };

  const stopAuto = () => {
    autoLeftRef.current = 0;
    setAutoLeft(0);
    setAutoMode(0);
  };

  const runSpin = useCallback(async () => {
    if (busyRef.current) return;
    const amount = parseAmount(betInput);
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

    busyRef.current = true;
    setBusy(true);
    clearBannerTimer();
    setBanner(null);
    const ok = await setBalance(balanceRef.current - amount);
    if (!ok) {
      showToast('Не удалось списать ставку');
      busyRef.current = false;
      setBusy(false);
      stopAuto();
      return;
    }

    const result = resolveSpin(amount);
    setCombo(1);
    setRoundAccum(0);
    setCascading(true);
    setBoard(result.startBoard);
    setExploding(EMPTY_BOOM);

    let accum = 0;
    if (!instantRef.current && result.steps.length > 0) {
      for (const step of result.steps) {
        accum = Number((accum + step.stepWin).toFixed(2));
        setBoard(step.board);
        setExploding(step.exploding);
        setCombo(step.combo);
        setRoundAccum(accum);
        await wait(460);
        setExploding(EMPTY_BOOM);
        setBoard(step.nextBoard);
        await wait(300);
      }
    } else if (result.steps.length > 0) {
      const last = result.steps[result.steps.length - 1];
      setBoard(last.nextBoard);
      setCombo(last.combo);
      setRoundAccum(result.totalWin);
    }

    setCascading(false);
    setExploding(EMPTY_BOOM);

    if (result.totalWin > 0) {
      const credited = await setBalance(balanceRef.current + result.totalWin);
      if (!credited) showToast('Не удалось зачислить выигрыш');
      showRoundBanner({ kind: 'win', amount: result.totalWin, multiplier: result.totalMultiplier });
    } else {
      setRoundAccum(0);
      showRoundBanner({ kind: 'lose' });
    }

    busyRef.current = false;
    setBusy(false);

    if (autoLeftRef.current > 0) {
      autoLeftRef.current -= 1;
      setAutoLeft(autoLeftRef.current);
      if (autoLeftRef.current > 0) {
        await wait(instantRef.current ? 700 : BANNER_MS);
        void runSpin();
      } else {
        setAutoMode(0);
      }
    }
  }, [betInput, setBalance, showToast]);

  const startAuto = (count: 5 | 10) => {
    if (autoMode === count && autoLeftRef.current > 0) {
      stopAuto();
      return;
    }
    autoLeftRef.current = count;
    setAutoLeft(count);
    setAutoMode(count);
    if (!busyRef.current) void runSpin();
  };

  const maxBet = Math.max(MIN_BET, Number(balance.toFixed(2)));
  const locked = busy;

  return (
    <div
      className="relative mx-auto flex h-[100dvh] min-h-screen w-full max-w-md flex-col justify-between overflow-hidden bg-cover bg-center bg-no-repeat text-white max-md:max-w-none"
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
        <h1 className="min-w-0 flex-1 text-center text-[13px] font-black tracking-[0.14em] text-cyan-100">
          CRYSTAL
        </h1>
        <div className="shrink-0 rounded-full bg-black/40 px-2.5 py-1 text-right ring-1 ring-amber-300/25">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-amber-200/70">Баланс</p>
          <p className="text-[11px] font-black tabular-nums">{balance.toFixed(2)}</p>
        </div>
      </header>

      {banner && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,8px)+3.1rem)] z-50 w-[min(92%,340px)] -translate-x-1/2">
          {banner.kind === 'win' ? (
            <div className="crystal-banner flex items-center gap-3 rounded-2xl border border-emerald-400/60 bg-gradient-to-r from-emerald-950/90 via-emerald-800/80 to-amber-900/70 px-5 py-2.5 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/80">Вы выиграли</p>
                <p className="truncate text-base font-black tabular-nums text-amber-300">
                  +{banner.amount.toFixed(2)} TMTM
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-amber-400 px-2 py-1 text-sm font-black text-emerald-950 shadow-[0_0_12px_rgba(251,191,36,0.55)]">
                x{banner.multiplier.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="crystal-banner rounded-2xl border border-rose-400/50 bg-black/80 px-5 py-2.5 text-center shadow-[0_0_16px_rgba(244,63,94,0.28)]">
              <p className="text-[12px] font-black uppercase tracking-wide text-rose-200">Нет выигрышных комбинаций</p>
              <p className="text-[10px] font-semibold text-slate-400">Раунд завершён</p>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-3 pb-4">
        {cascading && (combo > 1 || roundAccum > 0) && (
          <div className="mb-2 flex items-center gap-2">
            {combo > 1 && (
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-950 shadow-[0_0_14px_rgba(251,191,36,0.55)]">
                Комбо x{combo}
              </span>
            )}
            {roundAccum > 0 && (
              <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-black tabular-nums text-amber-200 ring-1 ring-amber-300/30">
                +{roundAccum.toFixed(2)} TMTM
              </span>
            )}
          </div>
        )}
        <CrystalBoard board={board} exploding={exploding} />
      </div>

      <div className="relative z-20 shrink-0 space-y-2 rounded-t-2xl bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))] backdrop-blur-md ring-1 ring-amber-500/15">
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'MIN', onClick: () => setBet(MIN_BET) },
            { label: 'X2', onClick: () => setBet(parseAmount(betInput) * 2) },
            { label: 'X/2', onClick: () => setBet(parseAmount(betInput) / 2) },
            { label: 'MAX', onClick: () => setBet(maxBet) },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={locked}
              onClick={item.onClick}
              className="h-10 rounded-lg bg-[#c89247] text-[11px] font-bold text-[#2c1a06] disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={betInput}
            disabled={locked}
            onChange={(event) => setBetInput(event.target.value.replace(/[^\d.,]/g, ''))}
            className="h-12 min-w-0 flex-1 rounded-xl bg-black/45 text-center text-sm font-black tabular-nums outline-none ring-1 ring-white/10 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void runSpin()}
            disabled={locked}
            className="h-12 min-w-[42%] rounded-xl bg-gradient-to-b from-[#e2b366] to-[#c89247] px-4 text-sm font-black uppercase tracking-wide text-[#2c1a06] shadow-lg shadow-amber-900/30 active:scale-[0.98] disabled:opacity-50"
          >
            {autoLeft > 0 ? `AUTO ${autoLeft}` : 'СТАВКА'}
          </button>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-300"
          >
            <Settings className="h-3.5 w-3.5" />
            Настройки
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-black/35 p-0.5 ring-1 ring-white/10">
            <span className="px-1.5 text-[9px] font-black uppercase text-slate-400">Auto</span>
            {([5, 10] as const).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => startAuto(count)}
                className={`h-7 min-w-8 rounded-md px-1.5 text-[10px] font-black ${
                  autoMode === count ? 'bg-[#c89247] text-[#2c1a06]' : 'text-slate-300'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setInstant((value) => !value)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide ring-1 ${
              instant
                ? 'bg-amber-400/20 text-amber-200 ring-amber-300/40'
                : 'text-slate-400 ring-white/10'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            В один клик
          </button>
        </div>
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
