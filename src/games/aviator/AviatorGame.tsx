import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, History, X } from 'lucide-react';
import { useToast } from '@/ToastContext';
import { useWallet } from '@/WalletContext';
import { persistWalletBalance } from '@/games/blackjack/wallet';
import { blockedGamesWager } from '@/lib/playerMoneyGate';
import { GameWalletBadge } from '@/components/games/GameWalletBadge';
import { AviatorCanvas, WAITING_TIME, type FlightPhase } from './AviatorCanvas';
import {
  formatMultiplier,
  historyTone,
  multiplierAt,
  randomHex,
  resolveCrashRound,
  timeToReach,
  type CrashRound,
  type FairSeeds,
} from './crashMath';
import {
  applyCashouts,
  createBotField,
  playerLiveRow,
  roundBank,
  type LiveBetRow,
  type MyBetRecord,
} from './liveBets';

interface AviatorGameProps {
  onBack: () => void;
}

type PanelStatus = 'idle' | 'queued' | 'live' | 'won' | 'lost';

interface BetPanelState {
  amount: string;
  auto: boolean;
  autoAt: string;
  status: PanelStatus;
  cashedAt: number | null;
  payout: number;
}

interface WinAlert {
  amount: number;
  multiplier: number;
}

const MIN_BET = 1;
const DEFAULT_AMOUNT = '10';
const CLIENT_SEED_KEY = 'nextpari-aviator-client-seed';
const MY_BETS_KEY = 'nextpari-aviator-my-bets';

function emptyPanel(): BetPanelState {
  return {
    amount: DEFAULT_AMOUNT,
    auto: false,
    autoAt: '2.00',
    status: 'idle',
    cashedAt: null,
    payout: 0,
  };
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function toneClass(value: number): string {
  const tone = historyTone(value);
  if (tone === 'gold') return 'bg-amber-400 text-emerald-950';
  if (tone === 'purple') return 'bg-violet-500 text-white';
  return 'bg-sky-500 text-white';
}

function formatUsdt(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loadMyBets(): MyBetRecord[] {
  try {
    const raw = localStorage.getItem(MY_BETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MyBetRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function saveMyBets(rows: MyBetRecord[]) {
  localStorage.setItem(MY_BETS_KEY, JSON.stringify(rows.slice(0, 40)));
}

export function AviatorGame({ onBack }: AviatorGameProps) {
  const { balance, applyBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<FlightPhase>('waiting');
  const [countdown, setCountdown] = useState(WAITING_TIME);
  const [multiplier, setMultiplier] = useState(1);
  const [history, setHistory] = useState<number[]>([]);
  const [round, setRound] = useState<CrashRound | null>(null);
  const [panels, setPanels] = useState<[BetPanelState, BetPanelState]>([emptyPanel(), emptyPanel()]);
  const [winAlert, setWinAlert] = useState<WinAlert | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [myBets, setMyBets] = useState<MyBetRecord[]>(loadMyBets);
  const [liveBets, setLiveBets] = useState<LiveBetRow[]>(() => createBotField(42));
  const [liveTab, setLiveTab] = useState<'all' | 'mine'>('all');
  const balanceRef = useRef(balance);
  const phaseRef = useRef(phase);
  const multiplierRef = useRef(1);
  const panelsRef = useRef(panels);
  const liveRef = useRef(liveBets);
  const roundRef = useRef<CrashRound | null>(null);
  const nonceRef = useRef(1);
  const clientSeedRef = useRef('');
  const paidRef = useRef(false);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);
  useEffect(() => {
    liveRef.current = liveBets;
  }, [liveBets]);

  useEffect(() => {
    const saved = sessionStorage.getItem(CLIENT_SEED_KEY);
    clientSeedRef.current = saved || randomHex(16);
    sessionStorage.setItem(CLIENT_SEED_KEY, clientSeedRef.current);
  }, []);

  useEffect(() => {
    if (!winAlert) return;
    const id = window.setTimeout(() => setWinAlert(null), 3000);
    return () => window.clearTimeout(id);
  }, [winAlert]);

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

  const updatePanel = (index: 0 | 1, patch: Partial<BetPanelState>) => {
    setPanels((prev) => {
      const next: [BetPanelState, BetPanelState] = [{ ...prev[0] }, { ...prev[1] }];
      next[index] = { ...next[index], ...patch };
      panelsRef.current = next;
      return next;
    });
  };

  const pushMyBet = useCallback((record: MyBetRecord) => {
    setMyBets((prev) => {
      const next = [record, ...prev].slice(0, 40);
      saveMyBets(next);
      return next;
    });
  }, []);

  const cashOut = useCallback(
    async (index: 0 | 1, at: number) => {
      const panel = panelsRef.current[index];
      if (panel.status !== 'live') return;
      const stake = parseAmount(panel.amount);
      const payout = Number((stake * at).toFixed(2));
      updatePanel(index, { status: 'won', cashedAt: at, payout });
      setLiveBets((prev) => {
        const next = prev.map((row) =>
          row.id === `me-${index}` ? { ...row, cashedAt: at, payout } : row,
        );
        liveRef.current = next;
        return next;
      });
      pushMyBet({
        id: `${Date.now()}-${index}`,
        at: Date.now(),
        stake,
        multiplier: at,
        result: 'win',
        payout,
      });
      setWinAlert({ amount: payout, multiplier: at });
      await setBalance(balanceRef.current + payout);
    },
    [pushMyBet, setBalance],
  );

  const startRoundRef = useRef<() => Promise<void>>(async () => {});
  const startRound = useCallback(async () => {
    const seeds: FairSeeds = {
      serverSeed: randomHex(32),
      clientSeed: clientSeedRef.current || randomHex(16),
      nonce: nonceRef.current,
    };
    nonceRef.current += 1;
    const nextRound = await resolveCrashRound(seeds);
    roundRef.current = nextRound;
    setRound(nextRound);
    paidRef.current = false;

    const queued = panelsRef.current
      .map((panel, index) => ({ panel, index: index as 0 | 1 }))
      .filter(({ panel }) => panel.status === 'queued');
    const total = queued.reduce((sum, row) => sum + parseAmount(row.panel.amount), 0);
    if (total > 0) {
      const blocked = blockedGamesWager();
      if (blocked) {
        showToast(blocked);
        queued.forEach(({ index }) => updatePanel(index, { status: 'idle' }));
      } else if (total > balanceRef.current) {
        showToast('Недостаточно средств');
        queued.forEach(({ index }) => updatePanel(index, { status: 'idle' }));
      } else {
        const ok = await setBalance(balanceRef.current - total);
        if (!ok) {
          showToast('Не удалось списать ставку');
          queued.forEach(({ index }) => updatePanel(index, { status: 'idle' }));
        } else {
          queued.forEach(({ index }) => updatePanel(index, { status: 'live', cashedAt: null, payout: 0 }));
        }
      }
    }

    setMultiplier(1);
    multiplierRef.current = 1;
    setPhase('flying');
  }, [setBalance, showToast]);
  startRoundRef.current = startRound;

  useEffect(() => {
    if (phase !== 'waiting') return;
    const bots = createBotField(38 + Math.floor(Math.random() * 8));
    const mine = panelsRef.current.flatMap((panel, index) =>
      panel.status === 'queued' ? [playerLiveRow(index, parseAmount(panel.amount))] : [],
    );
    const field = [...mine, ...bots];
    liveRef.current = field;
    setLiveBets(field);
    const began = performance.now();
    setCountdown(WAITING_TIME);
    let raf = 0;
    let launched = false;
    const tick = (now: number) => {
      const left = Math.max(0, WAITING_TIME - (now - began) / 1000);
      setCountdown(left);
      if (left <= 0) {
        if (!launched) {
          launched = true;
          void startRoundRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'flying' || !round) return;
    const crashAt = round.crashPoint;
    const duration = timeToReach(crashAt);
    const began = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = (now - began) / 1000;
      const current = t >= duration ? crashAt : multiplierAt(t);
      multiplierRef.current = current;
      setMultiplier(current);

      const resolved = applyCashouts(liveRef.current, current, crashAt);
      if (resolved !== liveRef.current) {
        liveRef.current = resolved;
        setLiveBets(resolved);
      }

      panelsRef.current.forEach((panel, index) => {
        if (panel.status !== 'live' || !panel.auto) return;
        const target = parseAmount(panel.autoAt);
        if (target >= 1.01 && current >= target && current < crashAt) {
          void cashOut(index as 0 | 1, target);
        }
      });

      if (current >= crashAt) {
        setMultiplier(crashAt);
        setPhase('crashed');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, round, cashOut]);

  useEffect(() => {
    if (phase !== 'crashed' || paidRef.current) return;
    paidRef.current = true;
    const crashAt = roundRef.current?.crashPoint ?? multiplierRef.current;
    setHistory((prev) => [crashAt, ...prev].slice(0, 24));
    panelsRef.current.forEach((panel, index) => {
      if (panel.status !== 'live') return;
      const stake = parseAmount(panel.amount);
      updatePanel(index as 0 | 1, { status: 'lost', cashedAt: null, payout: 0 });
      pushMyBet({
        id: `${Date.now()}-loss-${index}`,
        at: Date.now(),
        stake,
        multiplier: crashAt,
        result: 'loss',
        payout: 0,
      });
    });
    const id = window.setTimeout(() => {
      setPanels((prev) => {
        const reset = prev.map((panel) => ({
          ...panel,
          status: 'idle' as const,
          cashedAt: null,
          payout: 0,
        })) as [BetPanelState, BetPanelState];
        panelsRef.current = reset;
        return reset;
      });
      setPhase('waiting');
    }, 2800);
    return () => window.clearTimeout(id);
  }, [phase, pushMyBet]);

  const queueBet = (index: 0 | 1) => {
    if (phase !== 'waiting') {
      showToast('Ставка принимается до вылета');
      return;
    }
    const amount = parseAmount(panels[index].amount);
    if (amount < MIN_BET) {
      showToast(`Минимум ${MIN_BET} USDT`);
      return;
    }
    const already = panels.reduce((sum, panel, i) => {
      if (i === index) return sum;
      return sum + (panel.status === 'queued' ? parseAmount(panel.amount) : 0);
    }, 0);
    if (amount + already > balance) {
      showToast('Недостаточно средств');
      return;
    }
    updatePanel(index, { status: 'queued' });
    setLiveBets((prev) => {
      const row = playerLiveRow(index, amount);
      const next = [row, ...prev.filter((item) => item.id !== row.id)];
      liveRef.current = next;
      return next;
    });
  };

  const cancelBet = (index: 0 | 1) => {
    if (panels[index].status !== 'queued') return;
    updatePanel(index, { status: 'idle' });
    setLiveBets((prev) => {
      const next = prev.filter((row) => row.id !== `me-${index}`);
      liveRef.current = next;
      return next;
    });
  };

  const adjustAmount = (index: 0 | 1, fn: (n: number) => number) => {
    if (panels[index].status === 'queued' || panels[index].status === 'live') return;
    const next = Math.max(MIN_BET, Number(fn(parseAmount(panels[index].amount) || MIN_BET).toFixed(2)));
    updatePanel(index, { amount: String(next) });
  };

  const visibleLive = liveTab === 'mine' ? liveBets.filter((row) => row.isMe) : liveBets;
  const bank = roundBank(liveBets);

  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#14021f] text-white max-md:max-w-none">
      {winAlert && (
        <div className="av-win-toast pointer-events-none absolute left-1/2 top-14 z-30 w-[min(92%,22rem)] -translate-x-1/2 rounded-2xl px-4 py-3 text-center">
          <p className="text-[12px] font-black leading-snug text-white">
            ВЫ ЗАБРАЛИ: +{formatUsdt(winAlert.amount)} USDT
            <span className="mt-0.5 block text-[11px] font-bold text-amber-200">
              (на коэффициенте {winAlert.multiplier.toFixed(2)}x)
            </span>
          </p>
        </div>
      )}

      <header className="flex h-12 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top,8px)]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 active:scale-90"
          aria-label="Назад"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-rose-300/80">Nextpari Originals</p>
          <p className="text-sm font-black tracking-wide">AVIATOR</p>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 active:scale-90"
          aria-label="История моих ставок"
        >
          <History className="h-4 w-4" />
        </button>
        <div className="min-w-[4.75rem] rounded-full bg-white/5 px-2.5 py-1 text-right ring-1 ring-rose-400/20">
          <GameWalletBadge
            labelClassName="text-[8px] font-semibold uppercase tracking-wide text-rose-200/70"
            valueClassName="text-[11px] font-black tabular-nums"
          />
        </div>
      </header>

      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2">
        {history.length === 0 ? (
          <span className="text-[11px] font-semibold text-white/40">История раундов появится после вылета</span>
        ) : (
          history.map((value, index) => (
            <span
              key={`${value}-${index}`}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${toneClass(value)}`}
            >
              {formatMultiplier(value)}
            </span>
          ))
        )}
      </div>

      <div className="min-h-0 flex-1 px-3">
        <AviatorCanvas
          phase={phase}
          multiplier={multiplier}
          countdown={countdown}
          crashPoint={round?.crashPoint ?? null}
        />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 pt-2">
        {panels.map((panel, index) => (
          <BetPanel
            key={index}
            panel={panel}
            phase={phase}
            multiplier={multiplier}
            onAmount={(value) => updatePanel(index as 0 | 1, { amount: value })}
            onAuto={(value) => updatePanel(index as 0 | 1, { auto: value })}
            onAutoAt={(value) => updatePanel(index as 0 | 1, { autoAt: value })}
            onPlus={(n) => adjustAmount(index as 0 | 1, (v) => v + n)}
            onMul={(n) => adjustAmount(index as 0 | 1, (v) => (n < 1 ? Math.max(MIN_BET, v * n) : v * n))}
            onBet={() => queueBet(index as 0 | 1)}
            onCancel={() => cancelBet(index as 0 | 1)}
            onCashOut={() => void cashOut(index as 0 | 1, multiplierRef.current)}
          />
        ))}
      </div>

      <section className="mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom,8px))] mt-2 shrink-0 overflow-hidden rounded-2xl bg-[#0b1220] ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <div className="flex rounded-lg bg-black/30 p-0.5">
            <button
              type="button"
              onClick={() => setLiveTab('all')}
              className={`rounded-md px-2.5 py-1 text-[10px] font-black ${liveTab === 'all' ? 'bg-white/10 text-white' : 'text-white/45'}`}
            >
              Все ставки
            </button>
            <button
              type="button"
              onClick={() => setLiveTab('mine')}
              className={`rounded-md px-2.5 py-1 text-[10px] font-black ${liveTab === 'mine' ? 'bg-white/10 text-white' : 'text-white/45'}`}
            >
              Мои ставки
            </button>
          </div>
          <p className="truncate text-[9px] font-bold text-white/50">
            Всего игроков: {liveBets.length} | Банк: {formatUsdt(bank)} USDT
          </p>
        </div>
        <div className="no-scrollbar mt-1 max-h-[7.5rem] overflow-y-auto px-2 pb-2">
          {visibleLive.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] font-semibold text-white/35">Нет ставок в этом раунде</p>
          ) : (
            visibleLive.map((row) => (
              <div key={row.id} className="grid grid-cols-[1.2rem_1fr_auto_auto_auto] items-center gap-2 border-b border-white/5 py-1.5 last:border-0">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white"
                  style={{ background: row.color }}
                >
                  {row.initial}
                </span>
                <span className="truncate text-[11px] font-bold text-white/80">{row.name}</span>
                <span className="text-[10px] font-bold tabular-nums text-white/55">{row.stake.toFixed(0)}</span>
                <span className={`min-w-[2.6rem] text-right text-[10px] font-black tabular-nums ${row.cashedAt ? 'text-emerald-400' : 'text-white/30'}`}>
                  {row.cashedAt ? formatMultiplier(row.cashedAt) : '—'}
                </span>
                <span className={`min-w-[3.4rem] text-right text-[10px] font-black tabular-nums ${row.payout > 0 ? 'text-emerald-300' : 'text-white/30'}`}>
                  {row.payout > 0 ? formatUsdt(row.payout) : '0.00'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {historyOpen && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/55 sm:items-center sm:justify-center">
          <div className="flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-[#0f1724] p-4 ring-1 ring-white/10 sm:max-w-sm sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black">История моих ставок</h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="no-scrollbar space-y-2 overflow-y-auto">
              {myBets.length === 0 ? (
                <p className="py-8 text-center text-sm font-semibold text-white/40">Ставок пока нет</p>
              ) : (
                myBets.map((bet) => (
                      <div key={bet.id} className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold text-white/45">
                        {new Date(bet.at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <span className={`text-[11px] font-black ${bet.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {bet.result === 'win' ? 'Выигрыш' : 'Проигрыш'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[12px] font-bold">
                      <span>{formatUsdt(bet.stake)} USDT</span>
                      <span className="tabular-nums text-amber-200">{formatMultiplier(bet.multiplier)}</span>
                      <span className={bet.result === 'win' ? 'text-emerald-300' : 'text-rose-300'}>
                        {bet.result === 'win' ? `+${formatUsdt(bet.payout)}` : '0.00'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BetPanel({
  panel,
  phase,
  multiplier,
  onAmount,
  onAuto,
  onAutoAt,
  onPlus,
  onMul,
  onBet,
  onCancel,
  onCashOut,
}: {
  panel: BetPanelState;
  phase: FlightPhase;
  multiplier: number;
  onAmount: (value: string) => void;
  onAuto: (value: boolean) => void;
  onAutoAt: (value: string) => void;
  onPlus: (n: number) => void;
  onMul: (n: number) => void;
  onBet: () => void;
  onCancel: () => void;
  onCashOut: () => void;
}) {
  const livePayout = Number((parseAmount(panel.amount) * multiplier).toFixed(2));
  const locked = panel.status === 'queued' || panel.status === 'live';

  return (
    <section className="rounded-2xl bg-[#0f1724] p-2 ring-1 ring-white/10">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Ставка</p>
        {panel.status === 'won' && (
          <span className="text-[10px] font-black text-emerald-400">+{panel.payout.toFixed(2)}</span>
        )}
        {panel.status === 'lost' && (
          <span className="text-[10px] font-black text-rose-400">проигрыш</span>
        )}
      </div>
      <input
        inputMode="decimal"
        value={panel.amount}
        disabled={locked}
        onChange={(event) => onAmount(event.target.value.replace(/[^\d.,]/g, ''))}
        className="mb-1.5 w-full rounded-lg bg-black/40 px-2 py-1.5 text-center text-sm font-black tabular-nums text-white outline-none ring-1 ring-white/10 disabled:opacity-60"
      />
      <div className="mb-1.5 grid grid-cols-4 gap-1">
        {[
          { label: '+1', fn: () => onPlus(1) },
          { label: '+5', fn: () => onPlus(5) },
          { label: 'X2', fn: () => onMul(2) },
          { label: '/2', fn: () => onMul(0.5) },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            disabled={locked}
            onClick={btn.fn}
            className="rounded-md bg-white/5 py-1 text-[10px] font-black text-white/80 ring-1 ring-white/10 disabled:opacity-40"
          >
            {btn.label}
          </button>
        ))}
      </div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-white/70">
        <input
          type="checkbox"
          checked={panel.auto}
          disabled={panel.status === 'live'}
          onChange={(event) => onAuto(event.target.checked)}
          className="accent-emerald-500"
        />
        Авто-вывод
        <input
          inputMode="decimal"
          value={panel.autoAt}
          disabled={!panel.auto || panel.status === 'live'}
          onChange={(event) => onAutoAt(event.target.value.replace(/[^\d.]/g, ''))}
          className="ml-auto w-14 rounded bg-black/40 px-1 py-0.5 text-center text-[10px] font-black text-amber-200 outline-none ring-1 ring-white/10"
        />
      </label>
      {panel.status === 'live' ? (
        <button
          type="button"
          onClick={onCashOut}
          className="w-full rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-lg shadow-orange-900/40 active:scale-[0.98]"
        >
          ЗАБРАТЬ
          <span className="mt-0.5 block text-[10px] tabular-nums">{livePayout.toFixed(2)} USDT</span>
        </button>
      ) : panel.status === 'queued' ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-xl bg-white/10 py-2.5 text-[11px] font-black uppercase tracking-wide text-white ring-1 ring-white/15"
        >
          ОТМЕНА
        </button>
      ) : (
        <button
          type="button"
          onClick={onBet}
          disabled={phase !== 'waiting'}
          className="w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-2.5 text-[11px] font-black uppercase tracking-wide text-emerald-950 shadow-lg shadow-emerald-900/40 active:scale-[0.98] disabled:opacity-40"
        >
          СТАВКА (BET)
        </button>
      )}
    </section>
  );
}
