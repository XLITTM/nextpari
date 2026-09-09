import { type ReactNode, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  ClipboardCheck,
  MousePointerClick,
  Percent,
  Bell,
  Globe,
  Share2,
  LogOut,
} from 'lucide-react';
import type { Screen } from '../types';
import { useSettingsStore } from '../stores/settingsStore';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}

type SettingsView = 'root' | 'bet-slip';
type OddsPolicy = 'any' | 'increase' | 'none';

const ODDS_POLICIES: { id: OddsPolicy; label: string; hint: string }[] = [
  { id: 'any', label: 'Принимать любое изменение', hint: 'Ставка пройдёт при любом новом коэффициенте' },
  { id: 'increase', label: 'Принимать только повышение', hint: 'Ставка пройдёт, только если коэффициент вырос' },
  { id: 'none', label: 'Не принимать изменения', hint: 'Потребуется подтверждение при любом изменении' },
];

export function SettingsScreen({ onBack, onNavigate, onLogout }: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView>('root');
  const oddsPolicy = useSettingsStore((s) => s.oddsChangePolicy);
  const setOddsPolicy = useSettingsStore((s) => s.setOddsChangePolicy);

  const shareApp = () => {
    if (!navigator.share) return;
    void navigator.share({ title: 'Nextpari', url: window.location.origin }).catch(() => {});
  };

  if (view === 'bet-slip') {
    return (
      <SubPage title="Провод ставки" onBack={() => setView('root')}>
        <SettingsGroup title="Изменение коэффициента">
          {ODDS_POLICIES.map((item) => (
            <RadioRow
              key={item.id}
              label={item.label}
              hint={item.hint}
              selected={oddsPolicy === item.id}
              onSelect={() => setOddsPolicy(item.id)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title="Позже">
          <SoonPlainRow label="Push-уведомления о ставках" />
          <SoonPlainRow label="Очищать купон после ставки" />
          <SoonPlainRow label="Быстрые суммы" />
          <SoonPlainRow label="VIP-ставка" hint="Повышенные лимиты и приоритетное проведение пари" />
        </SettingsGroup>
      </SubPage>
    );
  }

  return (
    <div className="min-h-full bg-white dark:bg-gray-900 pb-28">
      <PageHeader title="Настройки" onBack={onBack} />
      <div className="px-4 py-6 space-y-6">
        <SettingsGroup title="Управление счётом">
          <SettingsRow
            icon={ArrowDownToLine}
            iconClass="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
            label="Пополнить"
            onClick={() => onNavigate({ name: 'wallet' })}
          />
          <SettingsRow
            icon={ArrowUpFromLine}
            iconClass="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
            label="Вывести"
            onClick={() => onNavigate({ name: 'wallet' })}
          />
        </SettingsGroup>

        <SettingsGroup title="Безопасность">
          <SoonRow
            icon={ShieldCheck}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Безопасность"
          />
        </SettingsGroup>

        <SettingsGroup title="Настройки ставок">
          <SettingsRow
            icon={ClipboardCheck}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Провод ставки"
            onClick={() => setView('bet-slip')}
          />
          <SoonRow
            icon={MousePointerClick}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Ставка в 1 клик"
          />
        </SettingsGroup>

        <SettingsGroup title="Настройки приложения">
          <InfoRow
            icon={Percent}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Тип коэффициентов"
            value="Десятичные"
          />
          <SoonRow
            icon={Bell}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Push"
          />
          <SoonRow
            icon={Globe}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Выбор языка"
          />
        </SettingsGroup>

        <SettingsGroup title="О приложении">
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
            <SettingsRow
              icon={Share2}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Поделиться"
              onClick={shareApp}
            />
          ) : null}
          <SettingsRow
            icon={LogOut}
            iconClass="bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400"
            label="Выйти"
            labelClass="text-red-500"
            hideChevron
            onClick={onLogout}
          />
        </SettingsGroup>
      </div>
    </div>
  );
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white dark:bg-gray-900 pb-28">
      <PageHeader title={title} onBack={onBack} />
      <div className="px-4 py-6 space-y-6">{children}</div>
    </div>
  );
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 px-2 h-14">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
          aria-label="Назад"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-900 dark:text-white pr-10">{title}</h1>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 px-1">{title}</h2>}
      <div className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 shadow-sm">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  iconClass,
  label,
  labelClass,
  value,
  hideChevron,
  onClick,
}: {
  icon: typeof ChevronRight;
  iconClass: string;
  label: string;
  labelClass?: string;
  value?: string;
  hideChevron?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-100 dark:active:bg-[#0f172a] transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </div>
      <span className={`flex-1 text-sm font-semibold ${labelClass || 'text-gray-900 dark:text-white'}`}>{label}</span>
      {value && <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{value}</span>}
      {!hideChevron && <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />}
    </button>
  );
}

function SoonRow({
  icon: Icon,
  iconClass,
  label,
}: {
  icon: typeof ChevronRight;
  iconClass: string;
  label: string;
}) {
  return (
    <div className="w-full flex items-center gap-3 px-3 py-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </div>
      <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Скоро
      </span>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: typeof ChevronRight;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="w-full flex items-center gap-3 px-3 py-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </div>
      <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{value}</span>
    </div>
  );
}

function SoonPlainRow({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="w-full flex items-center gap-3 px-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Скоро
      </span>
    </div>
  );
}

function RadioRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-100 dark:active:bg-[#0f172a] transition-colors"
    >
      <span
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          selected ? 'border-brand-600' : 'border-gray-300 dark:border-gray-500'
        }`}
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
        {hint && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}
