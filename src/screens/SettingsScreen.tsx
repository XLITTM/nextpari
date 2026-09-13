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
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import type { Screen } from '../types';
import { useSettingsStore } from '../stores/settingsStore';
import {
  PlayerChangePasswordError,
  changePlayerPassword,
} from '../lib/playerAuth';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  onPasswordChanged: () => void;
}

type SettingsView = 'root' | 'bet-slip';
type OddsPolicy = 'any' | 'increase' | 'none';

const ODDS_POLICIES: { id: OddsPolicy; label: string; hint: string }[] = [
  { id: 'any', label: 'Принимать любое изменение', hint: 'Ставка пройдёт при любом новом коэффициенте' },
  { id: 'increase', label: 'Принимать только повышение', hint: 'Ставка пройдёт, только если коэффициент вырос' },
  { id: 'none', label: 'Не принимать изменения', hint: 'Потребуется подтверждение при любом изменении' },
];

export function SettingsScreen({ onBack, onNavigate, onLogout, onPasswordChanged }: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView>('root');
  const [passwordOpen, setPasswordOpen] = useState(false);
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
          <SettingsRow
            icon={KeyRound}
            iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
            label="Сменить пароль"
            onClick={() => setPasswordOpen(true)}
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
      {passwordOpen ? (
        <ChangePasswordModal
          onClose={() => setPasswordOpen(false)}
          onChanged={onPasswordChanged}
          onSessionExpired={onLogout}
        />
      ) : null}
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

function ChangePasswordModal({
  onClose,
  onChanged,
  onSessionExpired,
}: {
  onClose: () => void;
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await changePlayerPassword({ currentPassword, newPassword, confirmPassword });
      onChanged();
    } catch (err) {
      if (err instanceof PlayerChangePasswordError && err.sessionExpired) {
        onSessionExpired();
        return;
      }
      setError(err instanceof PlayerChangePasswordError
        ? err.message
        : 'Не удалось изменить пароль. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center overflow-x-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[100svh] overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Сменить пароль</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Безопасность</p>
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <PasswordField
            label="Текущий пароль"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggle={() => setShowCurrent((value) => !value)}
            autoComplete="current-password"
          />
          <PasswordField
            label="Новый пароль"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggle={() => setShowNew((value) => !value)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Повторите новый пароль"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggle={() => setShowConfirm((value) => !value)}
            autoComplete="new-password"
          />
          {error ? (
            <p className="text-sm font-semibold text-red-500 break-words">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? 'Сохранение…' : 'Сменить пароль'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-full text-gray-500 dark:text-gray-300 font-semibold py-2 text-sm disabled:opacity-50"
          >
            Отмена
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full min-w-0 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-4 pr-12 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
