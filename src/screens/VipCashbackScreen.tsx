import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Boxes, ChevronLeft, Gamepad2, Gift, Heart, Info, LayoutGrid, Star, Trophy, Wallet, X,
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { useWallet } from '../WalletContext';
import { persistWalletBalance } from '../games/blackjack/wallet';
import type { Screen } from '../types';

export const VIP_LEVELS = [
  { id: 1, name: 'Медный', status: 'active' as const, xp: '6 297', maxXp: '300 000', percent: '5%', period: 'Раз в 7 дней', reward: '1.77 TMTM' },
  { id: 2, name: 'Бронзовый', status: 'locked' as const, xp: '0', maxXp: '1 000 000', percent: '6%', period: 'Раз в 6 дней', reward: '' },
  { id: 3, name: 'Серебряный', status: 'locked' as const, xp: '0', maxXp: '2 500 000', percent: '7%', period: 'Раз в 5 дней', reward: '' },
  { id: 4, name: 'Золотой', status: 'locked' as const, xp: '0', maxXp: '5 000 000', percent: '8%', period: 'Раз в 4 дня', reward: '' },
  { id: 5, name: 'Рубиновый', status: 'locked' as const, xp: '0', maxXp: '10 000 000', percent: '9%', period: 'Раз в 3 дня', reward: '' },
  { id: 6, name: 'Сапфировый', status: 'locked' as const, xp: '0', maxXp: '25 000 000', percent: '10%', period: 'Раз в 2 дня', reward: '' },
  { id: 7, name: 'Бриллиантовый', status: 'locked' as const, xp: '0', maxXp: '50 000 000', percent: '11%', period: 'Ежедневно', reward: '' },
  { id: 8, name: 'Статус VIP', status: 'locked' as const, xp: '0', maxXp: '100 000 000', percent: '0.05 - 0.25%', period: 'Ежедневно', reward: '' },
];

const CLAIMED_KEY = 'vip_cashback_claimed_level_1';

interface VipCashbackScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function parseXp(raw: string): number {
  return Number(String(raw).replace(/\s/g, '').replace(/[^\d]/g, '')) || 0;
}

function CopperMedal() {
  return (
    <div className="relative mx-auto h-36 w-36">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #f0a070 0%, #c45c2a 45%, #8b3a14 100%)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,220,180,0.45)',
        }}
      />
      <div className="absolute inset-[14%] flex items-center justify-center rounded-full border-[3px] border-[#f0c090]/70 bg-gradient-to-b from-[#d4783c] to-[#9a4018]">
        <Star className="h-14 w-14 fill-[#ffe7c2] text-[#ffe7c2] drop-shadow" strokeWidth={1.5} />
      </div>
      <div className="absolute -bottom-1 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-black/20 blur-sm" />
    </div>
  );
}

function LockedMedal() {
  return (
    <div className="relative mx-auto h-36 w-36">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #d8dee8 0%, #8b95a8 50%, #4a5568 100%)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,255,255,0.35)',
        }}
      />
      <div className="absolute inset-[16%] flex items-center justify-center rounded-full border-[3px] border-white/30 bg-gradient-to-b from-[#9aa3b5] to-[#5a6478]">
        <div className="relative">
          <div className="mx-auto mb-0.5 h-5 w-8 rounded-t-full border-[3px] border-white/80 border-b-0" />
          <div className="flex h-10 w-12 items-center justify-center rounded-md bg-white/90 shadow">
            <Star className="h-5 w-5 fill-[#5a6478] text-[#5a6478]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HowCard({
  icon: Icon,
  title,
  tone,
}: {
  icon: typeof Gamepad2;
  title: string;
  tone: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 px-1 text-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="h-6 w-6 text-white" strokeWidth={2.2} />
      </div>
      <p className="text-[11px] font-semibold leading-snug text-gray-700">{title}</p>
    </div>
  );
}

function PlayingCardsIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
      <g transform="rotate(-22 14 22)">
        <rect x="5" y="10" width="16" height="22" rx="2.2" fill="#dbe7ff" />
        <rect x="6.2" y="11.2" width="13.6" height="19.6" rx="1.6" fill="none" stroke="#fff" strokeWidth="1.2" />
      </g>
      <g transform="rotate(16 26 20)">
        <rect x="17" y="7" width="16" height="22" rx="2.2" fill="#fff" />
        <text x="25" y="17" textAnchor="middle" fontSize="8" fontWeight="700" fill="#194bb8">A</text>
        <text x="25" y="25" textAnchor="middle" fontSize="9" fill="#e11d48">♥</text>
      </g>
    </svg>
  );
}

function FooterBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Gift;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
        active ? 'text-[#194bb8]' : 'text-gray-400'
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
      {label}
    </button>
  );
}

export function VipCashbackScreen({ onBack, onNavigate }: VipCashbackScreenProps) {
  const { balance, applyBalance, refresh } = useWallet();
  const { showToast } = useToast();
  const [index, setIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [claimed, setClaimed] = useState(() => {
    try {
      return localStorage.getItem(CLAIMED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [claiming, setClaiming] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const level = VIP_LEVELS[index] ?? VIP_LEVELS[0];
  const isActive = level.status === 'active';

  const progress = useMemo(() => {
    const xp = parseXp(level.xp);
    const max = parseXp(level.maxXp) || 1;
    return Math.min(100, Math.max(0, (xp / max) * 100));
  }, [level]);

  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(VIP_LEVELS.length - 1, next)));
  }, []);

  const onPointerDown = (clientX: number) => {
    touchStartX.current = clientX;
  };

  const onPointerUp = (clientX: number) => {
    if (touchStartX.current == null) return;
    const delta = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) goTo(index + 1);
    else goTo(index - 1);
  };

  const claimReward = async () => {
    if (!isActive || claimed || claiming) return;
    const amount = parseAmount(level.reward);
    if (amount <= 0) return;
    setClaiming(true);
    try {
      const next = Number((balance + amount).toFixed(2));
      applyBalance(next);
      const saved = await persistWalletBalance(next);
      if (!saved.ok) {
        applyBalance(balance);
        await refresh();
        showToast('Не удалось зачислить кешбэк');
        return;
      }
      applyBalance(saved.balance);
      localStorage.setItem(CLAIMED_KEY, '1');
      setClaimed(true);
      showToast(`Зачислено ${amount.toFixed(2)} TMTM`);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f0f4fa]">
      <div className="shrink-0 bg-gradient-to-b from-[#194bb8] to-[#12388e] px-4 pb-6 pt-3 text-white">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold">VIP кешбэк</h1>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:scale-90"
            aria-label="Информация"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>

        <div
          className="select-none"
          onTouchStart={(e) => onPointerDown(e.touches[0]?.clientX ?? 0)}
          onTouchEnd={(e) => onPointerUp(e.changedTouches[0]?.clientX ?? 0)}
          onMouseDown={(e) => onPointerDown(e.clientX)}
          onMouseUp={(e) => onPointerUp(e.clientX)}
        >
          <p className="mb-1 text-center text-sm font-semibold text-white/80">
            {isActive ? 'Ваш уровень' : 'Закрыт'}
          </p>
          <p className="mb-3 text-center text-[24px] font-bold">{level.name}</p>

          <div className="mb-4 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Предыдущий уровень"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {isActive ? <CopperMedal /> : <LockedMedal />}
            <button
              type="button"
              disabled={index === VIP_LEVELS.length - 1}
              onClick={() => goTo(index + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Следующий уровень"
            >
              <ChevronLeft className="h-5 w-5 rotate-180" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {VIP_LEVELS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Уровень ${item.name}`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-5 bg-white' : 'w-2 bg-white/35'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-32">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          {isActive ? (
            <>
              <p className="mb-2 text-sm font-bold text-gray-900">
                Опыт: <span className="tabular-nums">{level.xp} / {level.maxXp}</span>
              </p>
              <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#194bb8] to-[#3b82f6] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs font-medium text-gray-500">
                Расчет очков опыта: €1 ставок = 100 очков опыта
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-gray-600">
              Для достижения уровня нужно больше опыта
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#194bb8]">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-gray-900">Кешбэк {level.percent}</p>
              <p className="text-xs font-medium text-gray-500">{level.period}</p>
            </div>
          </div>

          {isActive ? (
            <button
              type="button"
              disabled={claimed || claiming}
              onClick={() => void claimReward()}
              className="w-full rounded-xl bg-[#194bb8] py-3.5 text-sm font-bold text-white shadow-md active:scale-[0.98] disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
            >
              {claimed ? 'Уже получено' : claiming ? 'Зачисление…' : `Забрать ${level.reward}`}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-gray-200 py-3.5 text-sm font-bold text-gray-500"
            >
              Недоступно
            </button>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-center text-base font-bold text-gray-900">Как это работает?</h2>
          <div className="flex items-start gap-1">
            <HowCard icon={Gamepad2} title="Играйте в любимые слоты и игры" tone="bg-emerald-500" />
            <HowCard icon={Trophy} title="Получайте опыт и повышайте уровень" tone="bg-amber-500" />
            <HowCard icon={Gift} title="Забирайте кешбэк и награды" tone="bg-[#194bb8]" />
          </div>
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-lg border-t border-gray-200 bg-white pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-5 items-end px-1 pt-1">
          <FooterBtn label="Промо" active={false} icon={Gift} onClick={() => onNavigate({ name: 'promo' })} />
          <FooterBtn label="Избранное" active={false} icon={Heart} onClick={() => onNavigate({ name: 'favorites' })} />
          <div className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'live-casino' })}
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#194bb8] text-white shadow-lg shadow-blue-900/30 ring-4 ring-white active:scale-95"
              aria-label="My casino"
            >
              <PlayingCardsIcon />
            </button>
            <span className="mt-1 text-[10px] font-bold text-[#194bb8]">My casino</span>
          </div>
          <FooterBtn label="Провайдеры" active={false} icon={Boxes} onClick={() => showToast('Провайдеры скоро')} />
          <FooterBtn label="Категории" active={false} icon={LayoutGrid} onClick={() => showToast('Категории скоро')} />
        </div>
      </nav>

      {infoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">VIP кешбэк</h3>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed text-gray-600">
              Играйте в слоты и мини-игры, набирайте опыт и повышайте VIP-уровень.
              Чем выше уровень — тем больше процент кешбэка и чаще начисления.
              На Медном уровне доступен текущий кешбэк к получению.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
