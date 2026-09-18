import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import {
  Award,
  ChevronLeft,
  Coins,
  Crown,
  Gem,
  Gift,
  Info,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react';
import type { Screen } from '../types';

export const VIP_TIGER_ASSET = '/assets/vip/vip_tiger_hero_reference.png';
export const VIP_CASHBACK_COIN_ASSET = '/assets/vip/vip_cashback_coin_reference.png';

type VipTab = 'levels' | 'cashback';

interface VipTier {
  id: number;
  name: string;
  cashbackLabel: string;
  cashbackPeriod: string | null;
  from: string;
  mid: string;
  to: string;
  glow: string;
  icon: typeof Crown;
}

export const VIP_LEVELS: VipTier[] = [
  { id: 1, name: 'Медный', cashbackLabel: '5%', cashbackPeriod: 'Раз в 7 дней', from: '#3A1E15', mid: '#9A4F2C', to: '#D08554', glow: '#D08554', icon: Award },
  { id: 2, name: 'Бронзовый', cashbackLabel: '6%', cashbackPeriod: 'Раз в 6 дней', from: '#352313', mid: '#8C5A29', to: '#C18A48', glow: '#C18A48', icon: Star },
  { id: 3, name: 'Серебряный', cashbackLabel: '7%', cashbackPeriod: 'Раз в 5 дней', from: '#242A31', mid: '#737F8C', to: '#D9E0E6', glow: '#D9E0E6', icon: Shield },
  { id: 4, name: 'Золотой', cashbackLabel: '8%', cashbackPeriod: 'Раз в 4 дня', from: '#17130B', mid: '#A77A1B', to: '#F3D36F', glow: '#F3D36F', icon: Crown },
  { id: 5, name: 'Рубиновый', cashbackLabel: '9%', cashbackPeriod: 'Раз в 3 дня', from: '#22090C', mid: '#761927', to: '#E23852', glow: '#E23852', icon: Gem },
  { id: 6, name: 'Сапфировый', cashbackLabel: '10%', cashbackPeriod: 'Раз в 2 дня', from: '#071426', mid: '#123A72', to: '#398CFF', glow: '#398CFF', icon: Sparkles },
  { id: 7, name: 'Бриллиантовый', cashbackLabel: '11%', cashbackPeriod: 'Ежедневно', from: '#121A1E', mid: '#9AB8C4', to: '#E9FAFF', glow: '#E9FAFF', icon: Trophy },
  { id: 8, name: 'Статус VIP', cashbackLabel: '0.05–0.25%', cashbackPeriod: null, from: '#06110D', mid: '#126844', to: '#D5AE54', glow: '#D5AE54', icon: Crown },
];

const PAGE_BG: CSSProperties = {
  background: [
    'radial-gradient(ellipse 90% 55% at 88% 6%, rgba(18,104,68,0.38) 0%, transparent 58%)',
    'radial-gradient(ellipse 55% 40% at 8% 18%, rgba(213,174,84,0.14) 0%, transparent 52%)',
    'radial-gradient(ellipse 80% 45% at 50% 100%, rgba(22,169,103,0.12) 0%, transparent 55%)',
    'linear-gradient(180deg, #070C10 0%, #05090C 42%, #05090C 100%)',
  ].join(', '),
};

const GOLD_TEXT: CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, #FFF0B5 0%, #E9C66A 46%, #B8862E 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

const TIER_CARD_CSS = `
.vip-tier-card {
  flex-shrink: 0;
  scroll-snap-align: start;
  width: clamp(102px, 29vw, 118px);
}
.vip-tier-card-selected {
  transform: translateY(-2px);
  box-shadow: 0 0 0 1.5px var(--vip-glow), 0 5px 10px color-mix(in srgb, var(--vip-glow) 20%, transparent), 0 5px 8px rgba(0,0,0,.4);
}
@media (min-width: 480px) {
  .vip-tier-card-selected {
    transform: translateY(-4px);
    box-shadow: 0 0 0 1.5px var(--vip-glow), 0 12px 26px color-mix(in srgb, var(--vip-glow) 30%, transparent), 0 10px 18px rgba(0,0,0,.5);
  }
}
`;

interface VipCashbackScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function VipCashbackScreen({ onBack }: VipCashbackScreenProps) {
  const [tab, setTab] = useState<VipTab>('levels');
  const [selectedId, setSelectedId] = useState(4);
  const selected = VIP_LEVELS.find((tier) => tier.id === selectedId) ?? VIP_LEVELS[3];
  const selectedRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = selectedRef.current;
    const scroller = scrollerRef.current;
    if (!card || !scroller) return;
    const left = card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left) });
  }, []);

  return (
    <div className="relative min-h-full overflow-x-hidden pb-6 text-white" style={PAGE_BG}>
      <style>{TIER_CARD_CSS}</style>
      <header className="relative z-20 flex items-center px-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 active:scale-90"
          aria-label="Назад"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 pr-10 text-center text-[13px] font-bold tracking-[0.22em] text-white/90">
          VIP CLUB
        </h1>
      </header>

      <Hero />

      <div className="relative z-10 mt-1 px-4">
        <div className="grid grid-cols-2 gap-2">
          <TabButton
            active={tab === 'levels'}
            icon={<Crown className="h-4 w-4" strokeWidth={2.2} />}
            label="VIP уровни"
            onClick={() => setTab('levels')}
          />
          <TabButton
            active={tab === 'cashback'}
            icon={<Coins className="h-4 w-4" strokeWidth={2.2} />}
            label="Кешбэк"
            onClick={() => setTab('cashback')}
          />
        </div>
      </div>

      {tab === 'levels' ? (
        <LevelsPanel
          selected={selected}
          selectedRef={selectedRef}
          scrollerRef={scrollerRef}
          onSelect={setSelectedId}
        />
      ) : (
        <CashbackPanel />
      )}

      <PreviewNotice />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate min-h-[214px] overflow-hidden px-4 pb-3 pt-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'linear-gradient(115deg, transparent 18%, rgba(34,229,138,0.07) 36%, transparent 48%)',
            'linear-gradient(250deg, transparent 40%, rgba(213,174,84,0.08) 70%, transparent 88%)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 top-2 h-56 w-56 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(34,229,138,0.22) 0%, transparent 68%)' }}
      />
      <img
        src={VIP_TIGER_ASSET}
        alt=""
        className="pointer-events-none absolute -right-5 top-[-6px] z-0 h-[228px] w-[50%] max-w-[240px] object-contain object-right min-[360px]:w-[58%] sm:h-[248px]"
        style={{
          filter: 'drop-shadow(0 0 28px rgba(34,229,138,0.32))',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 100%)',
          maskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 100%)',
        }}
      />
      <div className="relative z-10 max-w-[62%] pt-2">
        <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#E9C66A]/70 bg-black/30 shadow-[0_0_16px_rgba(233,198,106,0.28)]">
          <Crown className="h-3.5 w-3.5 text-[#F3D36F]" strokeWidth={2.2} />
        </div>
        <p className="text-[11px] font-extrabold tracking-[0.34em]">
          <span className="text-white">NEXT</span>
          <span className="text-[#E9C66A]">PARI</span>
        </p>
        <h2
          className="mt-1 font-black uppercase leading-[0.86] tracking-[-0.04em]"
          style={{ ...GOLD_TEXT, fontSize: 'clamp(34px, 11vw, 48px)' }}
        >
          VIP CLUB
        </h2>
        <p className="mt-2 max-w-[220px] text-[12px] font-medium leading-snug text-white/70">
          Привилегии, кешбэк и особые награды
        </p>
        <span className="mt-3 inline-flex rounded-full border border-[#E9C66A]/85 px-3 py-1 text-[10px] font-extrabold tracking-[0.14em] text-[#E9C66A] shadow-[0_0_14px_rgba(233,198,106,0.18)]">
          ПРЕВЬЮ ПРОГРАММЫ
        </span>
      </div>
    </section>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[46px] items-center justify-center gap-1.5 rounded-[18px] text-[13px] font-bold transition-transform active:scale-[0.98]"
      style={
        active
          ? {
              background: 'linear-gradient(135deg, #16A967, #22E58A)',
              boxShadow: '0 0 24px rgba(34,229,138,.28)',
              color: '#fff',
            }
          : {
              background: '#10171C',
              border: '1px solid rgba(120,140,160,0.28)',
              color: 'rgba(190,200,210,0.72)',
            }
      }
    >
      {icon}
      {label}
    </button>
  );
}

function LevelsPanel({
  selected,
  selectedRef,
  scrollerRef,
  onSelect,
}: {
  selected: VipTier;
  selectedRef: Ref<HTMLButtonElement>;
  scrollerRef: Ref<HTMLDivElement>;
  onSelect: (id: number) => void;
}) {
  const SelectedIcon = selected.icon;
  return (
    <>
      <div
        ref={scrollerRef}
        className="mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-visible px-3 pb-3 min-[480px]:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {VIP_LEVELS.map((tier) => {
          const active = tier.id === selected.id;
          const Icon = tier.icon;
          return (
            <button
              key={tier.id}
              ref={active ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(tier.id)}
              className={`vip-tier-card relative overflow-hidden rounded-[20px] px-1.5 pb-2.5 pt-3 text-center ${active ? 'vip-tier-card-selected' : ''}`}
              style={{
                ['--vip-glow']: tier.glow,
                background: `linear-gradient(180deg, ${hexToRgba(tier.mid, 0.55)} 0%, ${tier.from} 48%, #07090C 100%)`,
                boxShadow: active
                  ? undefined
                  : `inset 0 1px 0 ${hexToRgba('#ffffff', 0.08)}, 0 8px 16px rgba(0,0,0,.38)`,
                border: `1px solid ${hexToRgba(tier.glow, active ? 0.7 : 0.22)}`,
              } as CSSProperties}
            >
              <div
                className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full min-[390px]:h-[50px] min-[390px]:w-[50px] min-[430px]:h-[54px] min-[430px]:w-[54px]"
                style={{
                  background: `radial-gradient(circle at 32% 28%, ${tier.to}, ${tier.mid} 48%, ${tier.from})`,
                  boxShadow: `0 8px 14px rgba(0,0,0,.4), inset 0 1px 1px ${hexToRgba('#ffffff', 0.38)}`,
                  border: `1px solid ${hexToRgba(tier.to, 0.7)}`,
                }}
              >
                <Icon className="h-5 w-5 text-white drop-shadow min-[430px]:h-6 min-[430px]:w-6" strokeWidth={1.8} />
              </div>
              <p className="text-[10px] font-bold text-white/65">{tier.id}</p>
              <p className="text-[11px] font-extrabold leading-tight text-white min-[390px]:text-[12px]">{tier.name}</p>
              <p className="mt-1 px-0.5 text-[9px] font-bold leading-tight text-[#E9C66A] break-words min-[390px]:text-[10px]">
                {tier.cashbackLabel} кешбэк
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {VIP_LEVELS.map((tier) => (
          <span
            key={tier.id}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: tier.id === selected.id ? 14 : 6,
              background: tier.id === selected.id ? '#22E58A' : 'rgba(255,255,255,0.22)',
            }}
          />
        ))}
      </div>

      <section
        className="relative mx-4 mt-4 overflow-hidden rounded-[24px] px-4 pb-4 pt-4"
        style={{
          background: 'rgba(15,22,28,.94)',
          border: `1px solid ${hexToRgba(selected.glow, 0.38)}`,
          boxShadow: `0 0 28px ${hexToRgba(selected.glow, 0.12)}, 0 12px 28px rgba(0,0,0,.35)`,
        }}
      >
        <div className="flex flex-wrap items-start gap-3">
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full min-[390px]:h-[58px] min-[390px]:w-[58px]"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${selected.to}, ${selected.mid} 50%, ${selected.from})`,
              boxShadow: `0 0 18px ${hexToRgba(selected.glow, 0.35)}`,
              border: `1px solid ${hexToRgba(selected.to, 0.6)}`,
            }}
          >
            <SelectedIcon className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1 basis-[132px] pt-0.5">
            <h3 className="text-[22px] font-black leading-tight text-white min-[390px]:text-[26px] min-[390px]:leading-none">{selected.name}</h3>
            <p className="mt-1.5 text-[12px] font-medium text-white/55">Привилегии уровня</p>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
            style={{
              color: selected.glow,
              border: `1px solid ${hexToRgba(selected.glow, 0.55)}`,
              background: hexToRgba(selected.glow, 0.08),
            }}
          >
            Уровень {selected.id}
          </span>
        </div>

        <div
          className="mt-4 grid gap-3 rounded-[18px] px-3 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(233,198,106,0.08), rgba(34,229,138,0.08))',
            border: '1px solid rgba(233,198,106,0.28)',
          }}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Кешбэк</p>
            <p className="mt-0.5 text-[22px] font-black leading-none text-[#F3D36F]">{selected.cashbackLabel}</p>
          </div>
          {selected.cashbackPeriod ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Начисление</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#22E58A]">{selected.cashbackPeriod}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <PrivilegeRow
            icon={<Gift className="h-4 w-4" />}
            title="Персональные предложения"
            desc="Эксклюзивные бонусы и акции"
          />
          <PrivilegeRow
            icon={<Star className="h-4 w-4" />}
            title="Повышенные VIP-привилегии"
            desc="Больше возможностей и приоритет"
          />
          <PrivilegeRow
            icon={<Gem className="h-4 w-4" />}
            title="Дополнительные награды"
            desc="Особые возможности программы"
            last
          />
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-black/35 px-3 py-3 text-[12px] leading-relaxed text-white/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
          <p>Условия и награды будут доступны после запуска VIP-программы.</p>
        </div>
      </section>
    </>
  );
}

function PrivilegeRow({
  icon,
  title,
  desc,
  last,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 py-3 ${last ? '' : 'border-b border-white/[0.06]'}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[#E9C66A]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-white">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-white/50">{desc}</p>
      </div>
    </div>
  );
}

function CashbackPanel() {
  return (
    <div className="px-4">
      <section
        className="relative mt-4 overflow-hidden rounded-[24px] px-4 pb-6 pt-5 text-center"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 18%, rgba(18,104,68,0.28) 0%, rgba(8,14,18,0.96) 58%)',
          border: '1px solid rgba(34,229,138,0.28)',
          boxShadow: '0 0 36px rgba(34,229,138,0.16), inset 0 1px 0 rgba(34,229,138,0.12)',
        }}
      >
        <img
          src={VIP_CASHBACK_COIN_ASSET}
          alt=""
          className="mx-auto w-[92%] max-h-[214px] object-contain"
          style={{ filter: 'drop-shadow(0 12px 28px rgba(34,229,138,0.28))' }}
        />
        <h2
          className="mt-1 font-black leading-none"
          style={{ ...GOLD_TEXT, fontSize: 'clamp(34px, 10vw, 44px)' }}
        >
          Кешбэк
        </h2>
        <p className="mx-auto mt-3 max-w-[280px] text-[13px] leading-relaxed text-white/65">
          Часть проигранных средств может возвращаться игроку в рамках VIP-программы.
        </p>
        <span className="mt-4 inline-flex rounded-full border border-[#E9C66A]/85 px-4 py-1 text-[11px] font-extrabold tracking-[0.18em] text-[#E9C66A]">
          СКОРО
        </span>
      </section>

      <section
        className="mt-3 overflow-hidden rounded-[20px] px-3 py-2"
        style={{
          background: 'rgba(12,18,22,0.94)',
          border: '1px solid rgba(233,198,106,0.22)',
        }}
      >
        {VIP_LEVELS.map((tier, index) => (
          <div
            key={tier.id}
            className={`flex items-start justify-between gap-3 py-2.5 ${index === VIP_LEVELS.length - 1 ? '' : 'border-b border-white/[0.06]'}`}
          >
            <p className="text-[13px] font-bold text-white">{tier.name}</p>
            <div className="text-right">
              <p className="text-[13px] font-extrabold text-[#F3D36F]">{tier.cashbackLabel}</p>
              {tier.cashbackPeriod ? (
                <p className="mt-0.5 text-[11px] font-medium text-white/50">{tier.cashbackPeriod}</p>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <FeatureCard
          icon={<Crown className="h-4 w-4" />}
          title="Зависит от VIP-уровня"
          desc="Чем выше уровень, тем больше привилегий"
        />
        <FeatureCard
          icon={<Settings className="h-4 w-4" />}
          title="Рассчитывается автоматически"
          desc="Всё происходит автоматически системой"
        />
        <FeatureCard
          icon={<Gift className="h-4 w-4" />}
          title="Условия будут опубликованы"
          desc="Подробная информация перед запуском"
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="rounded-[18px] px-2 py-3 text-center"
      style={{
        background: 'rgba(12,18,22,0.92)',
        border: '1px solid rgba(233,198,106,0.22)',
      }}
    >
      <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full text-[#E9C66A]">
        {icon}
      </span>
      <p className="text-[11px] font-extrabold leading-tight text-white">{title}</p>
      <p className="mt-1 text-[10px] leading-snug text-white/50">{desc}</p>
    </div>
  );
}

function PreviewNotice() {
  return (
    <section
      className="mx-4 mt-4 mb-2 flex items-start gap-3 rounded-[22px] px-3.5 py-3.5"
      style={{
        background: 'rgba(8,18,16,0.92)',
        border: '1px solid rgba(34,229,138,0.32)',
        boxShadow: '0 0 24px rgba(34,229,138,0.14)',
      }}
    >
      <span
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background: 'linear-gradient(135deg, #16A967, #22E58A)',
          boxShadow: '0 0 16px rgba(34,229,138,0.35)',
        }}
      >
        <Crown className="h-5 w-5 text-white" strokeWidth={2.1} />
      </span>
      <p className="text-[12px] font-medium leading-relaxed text-white/70">
        VIP-программа пока находится в режиме предварительного просмотра.
        Проценты и график начисления описывают планируемую программу и пока не зачисляются автоматически.
        Уровни, кешбэк и награды начнут работать только после официального запуска.
      </p>
    </section>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const value = raw.length === 3
    ? raw.split('').map((ch) => ch + ch).join('')
    : raw;
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
