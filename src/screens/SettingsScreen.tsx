import { useMemo, useState, type ReactNode } from 'react';
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
  Link2,
  Server,
  Share2,
  Trash2,
  LogOut,
  Check,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import type { Screen } from '../types';
import { useToast } from '../ToastContext';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}

type SettingsView = 'root' | 'bet-slip' | 'security' | 'odds' | 'language' | 'mirror' | 'proxy';
type OddsPolicy = 'any' | 'increase' | 'none';
type OddsFormat = 'decimal' | 'fractional' | 'american';

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'it', label: 'Italiano' },
  { id: 'pt', label: 'Português' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'uk', label: 'Українська' },
  { id: 'pl', label: 'Polski' },
  { id: 'kk', label: 'Қазақша' },
  { id: 'az', label: 'Azərbaycan' },
];

const MIRRORS = [
  { id: 'main', label: 'nextpari.com', hint: 'Основной' },
  { id: 'm1', label: 'np-mirror.net', hint: 'Зеркало 1' },
  { id: 'm2', label: 'nextpari.app', hint: 'Зеркало 2' },
];

const ODDS_FORMATS: { id: OddsFormat; label: string; example: string }[] = [
  { id: 'decimal', label: 'Десятичные', example: '2.50' },
  { id: 'fractional', label: 'Дробные', example: '6/4' },
  { id: 'american', label: 'Американские', example: '+150' },
];

const ODDS_POLICIES: { id: OddsPolicy; label: string; hint: string }[] = [
  { id: 'any', label: 'Принимать любое изменение', hint: 'Ставка пройдёт при любом новом коэффициенте' },
  { id: 'increase', label: 'Принимать только повышение', hint: 'Ставка пройдёт, только если коэффициент вырос' },
  { id: 'none', label: 'Не принимать изменения', hint: 'Потребуется подтверждение при любом изменении' },
];

export function SettingsScreen({ onBack, onNavigate, onLogout }: SettingsScreenProps) {
  const { showToast } = useToast();
  const [view, setView] = useState<SettingsView>('root');

  const [oddsPolicy, setOddsPolicy] = useState<OddsPolicy>('increase');
  const [betPush, setBetPush] = useState(true);
  const [clearCoupon, setClearCoupon] = useState(true);
  const [quickAmounts, setQuickAmounts] = useState(['10', '50', '100', '200', '500', '1000']);
  const [vipBet, setVipBet] = useState(false);

  const [phoneOk] = useState(true);
  const [emailOk] = useState(true);
  const [passwordOk] = useState(true);
  const [twoFa, setTwoFa] = useState(false);
  const [secretQuestion, setSecretQuestion] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);

  const [oneClick, setOneClick] = useState(false);
  const [oneClickAmount, setOneClickAmount] = useState('100');
  const [oneClickOpen, setOneClickOpen] = useState(false);
  const [oneClickDraftOn, setOneClickDraftOn] = useState(false);
  const [oneClickDraftAmount, setOneClickDraftAmount] = useState('100');

  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('decimal');
  const [language, setLanguage] = useState('ru');
  const [mirror, setMirror] = useState('main');
  const [proxyOn, setProxyOn] = useState(false);
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');

  const soon = () => showToast('Скоро будет доступно');
  const langLabel = LANGUAGES.find((l) => l.id === language)?.label ?? 'Русский';
  const oddsLabel = ODDS_FORMATS.find((o) => o.id === oddsFormat)?.label ?? 'Десятичные';
  const securityDone = [phoneOk, emailOk, passwordOk, twoFa, secretQuestion, pinEnabled].filter(Boolean).length;

  const openOneClick = () => {
    setOneClickDraftOn(oneClick);
    setOneClickDraftAmount(oneClickAmount);
    setOneClickOpen(true);
  };

  const saveOneClick = () => {
    const amount = oneClickDraftAmount.replace(/[^\d.]/g, '') || '0';
    setOneClick(oneClickDraftOn);
    setOneClickAmount(amount);
    setOneClickDraftAmount(amount);
    setOneClickOpen(false);
    showToast(oneClickDraftOn ? 'Ставка в 1 клик включена' : 'Ставка в 1 клик выключена');
  };

  const content = (() => {
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

          <SettingsGroup title="Купон">
            <SwitchRow label="Push-уведомления о ставках" on={betPush} onChange={setBetPush} />
            <SwitchRow label="Очищать купон после ставки" on={clearCoupon} onChange={setClearCoupon} />
          </SettingsGroup>

          <SettingsGroup title="Быстрые ставки">
            <div className="px-3 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Нажмите на сумму, чтобы изменить номинал быстрой ставки
              </p>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((amount, index) => (
                  <label key={index} className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <Pencil className="w-3 h-3" />
                    </span>
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        const next = [...quickAmounts];
                        next[index] = e.target.value.replace(/[^\d.]/g, '');
                        setQuickAmounts(next);
                      }}
                      className="w-full h-11 pl-7 pr-2 rounded-xl bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-600 text-center text-sm font-bold text-gray-900 dark:text-white tabular-nums focus:outline-none focus:border-brand-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title="VIP-ставка">
            <SwitchRow
              label="VIP-ставка"
              hint="Повышенные лимиты и приоритетное проведение пари"
              on={vipBet}
              onChange={setVipBet}
            />
          </SettingsGroup>
        </SubPage>
      );
    }

    if (view === 'security') {
      return (
        <SecurityPage
          onBack={() => setView('root')}
          items={[
            { label: 'Номер телефона', done: phoneOk, onClick: soon },
            { label: 'Электронная почта', done: emailOk, onClick: soon },
            { label: 'Надёжный пароль', done: passwordOk, onClick: soon },
            { label: 'Двухфакторная аутентификация', done: twoFa, onClick: () => setTwoFa((v) => !v) },
            { label: 'Секретный вопрос', done: secretQuestion, onClick: () => setSecretQuestion((v) => !v) },
            { label: 'Пин-код приложения', done: pinEnabled, onClick: () => setPinEnabled((v) => !v) },
          ]}
        />
      );
    }

    if (view === 'odds') {
      return (
        <SubPage title="Тип коэффициентов" onBack={() => setView('root')}>
          <SettingsGroup>
            {ODDS_FORMATS.map((item) => (
              <RadioRow
                key={item.id}
                label={item.label}
                hint={item.example}
                selected={oddsFormat === item.id}
                onSelect={() => setOddsFormat(item.id)}
              />
            ))}
          </SettingsGroup>
        </SubPage>
      );
    }

    if (view === 'language') {
      return (
        <SubPage title="Выбор языка" onBack={() => setView('root')}>
          <SettingsGroup>
            {LANGUAGES.map((item) => (
              <RadioRow
                key={item.id}
                label={item.label}
                selected={language === item.id}
                onSelect={() => setLanguage(item.id)}
              />
            ))}
          </SettingsGroup>
        </SubPage>
      );
    }

    if (view === 'mirror') {
      return (
        <SubPage title="Рабочее зеркало" onBack={() => setView('root')}>
          <SettingsGroup>
            {MIRRORS.map((item) => (
              <RadioRow
                key={item.id}
                label={item.label}
                hint={item.hint}
                selected={mirror === item.id}
                onSelect={() => {
                  setMirror(item.id);
                  showToast(`Выбрано зеркало: ${item.label}`);
                }}
              />
            ))}
          </SettingsGroup>
        </SubPage>
      );
    }

    if (view === 'proxy') {
      return (
        <SubPage title="Прокси" onBack={() => setView('root')}>
          <SettingsGroup>
            <SwitchRow label="Использовать прокси" on={proxyOn} onChange={setProxyOn} />
          </SettingsGroup>
          {proxyOn && (
            <SettingsGroup title="Параметры">
              <div className="px-3 py-3 space-y-3">
                <input
                  value={proxyHost}
                  onChange={(e) => setProxyHost(e.target.value)}
                  placeholder="Хост"
                  className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-600"
                />
                <input
                  value={proxyPort}
                  onChange={(e) => setProxyPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="Порт"
                  inputMode="numeric"
                  className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-600"
                />
              </div>
            </SettingsGroup>
          )}
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
              icon={ShieldCheck}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Настройки безопасности"
              value={`${securityDone}/6`}
              onClick={() => setView('security')}
            />
          </SettingsGroup>

          <SettingsGroup title="Настройки ставок">
            <SettingsRow
              icon={ClipboardCheck}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Провод ставки"
              onClick={() => setView('bet-slip')}
            />
            <SettingsRow
              icon={MousePointerClick}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Ставка в 1 клик"
              value={oneClick ? `Вкл · ${oneClickAmount}` : 'Выкл'}
              onClick={openOneClick}
            />
          </SettingsGroup>

          <SettingsGroup title="Настройки приложения">
            <SettingsRow
              icon={Percent}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Тип коэффициентов"
              value={oddsLabel}
              onClick={() => setView('odds')}
            />
            <SettingsRow
              icon={Bell}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Push"
              trailing={<Toggle on={betPush} onChange={setBetPush} />}
              onClick={() => setBetPush((v) => !v)}
            />
            <SettingsRow
              icon={Globe}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Выбор языка"
              value={langLabel}
              onClick={() => setView('language')}
            />
          </SettingsGroup>

          <SettingsGroup title="Дополнительно">
            <SettingsRow
              icon={Link2}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Рабочее зеркало"
              onClick={() => setView('mirror')}
            />
            <SettingsRow
              icon={Server}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Прокси"
              onClick={() => setView('proxy')}
            />
          </SettingsGroup>

          <SettingsGroup title="О приложении">
            <SettingsRow
              icon={Share2}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Поделиться"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'Nextpari', url: window.location.origin }).catch(() => soon());
                } else {
                  soon();
                }
              }}
            />
            <SettingsRow
              icon={Trash2}
              iconClass="bg-gray-100 text-gray-700 dark:bg-[#1e293b] dark:text-gray-200"
              label="Очистить кэш"
              onClick={() => showToast('Кэш очищен')}
            />
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
  })();

  return (
    <>
      {content}
      {oneClickOpen && (
        <OneClickModal
          enabled={oneClickDraftOn}
          amount={oneClickDraftAmount}
          onEnabledChange={setOneClickDraftOn}
          onAmountChange={setOneClickDraftAmount}
          onClose={() => setOneClickOpen(false)}
          onSave={saveOneClick}
        />
      )}
    </>
  );
}

function SecurityPage({
  onBack,
  items,
}: {
  onBack: () => void;
  items: { label: string; done: boolean; onClick: () => void }[];
}) {
  const doneCount = useMemo(() => items.filter((i) => i.done).length, [items]);
  const progress = (doneCount / items.length) * 100;

  return (
    <SubPage title="Настройки безопасности" onBack={onBack}>
      <div className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Защита профиля</p>
          <span className="text-sm font-bold text-brand-600 tabular-nums">
            {doneCount}/{items.length}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Завершите все пункты, чтобы повысить безопасность аккаунта
        </p>
      </div>

      <SettingsGroup>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-100 dark:active:bg-[#0f172a] transition-colors"
          >
            {item.done ? (
              <span className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-brand-600" strokeWidth={2.6} />
              </span>
            ) : (
              <span className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-red-500" strokeWidth={2.4} />
              </span>
            )}
            <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          </button>
        ))}
      </SettingsGroup>
    </SubPage>
  );
}

function OneClickModal({
  enabled,
  amount,
  onEnabledChange,
  onAmountChange,
  onClose,
  onSave,
}: {
  enabled: boolean;
  amount: string;
  onEnabledChange: (value: boolean) => void;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-24 sm:pb-0">
      <button type="button" className="absolute inset-0" aria-label="Закрыть" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1e293b] rounded-2xl p-5 shadow-xl animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Ставка в 1 клик</h3>
          <Toggle on={enabled} onChange={onEnabledChange} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
          При включении ставка заключается сразу при нажатии на коэффициент, без подтверждения в купоне.
        </p>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Сумма ставки</label>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value.replace(/[^\d.]/g, ''))}
          disabled={!enabled}
          className="w-full h-12 px-3 rounded-2xl bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-600 text-sm font-bold text-gray-900 dark:text-white tabular-nums focus:outline-none focus:border-brand-600 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSave}
          className="mt-4 w-full h-12 rounded-2xl bg-brand-600 text-white text-sm font-bold active:scale-[0.98] transition-transform"
        >
          Сохранить
        </button>
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
  trailing,
  hideChevron,
  onClick,
}: {
  icon: typeof ChevronRight;
  iconClass: string;
  label: string;
  labelClass?: string;
  value?: string;
  trailing?: ReactNode;
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
      {trailing}
      {!hideChevron && !trailing && <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />}
    </button>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="w-full flex items-center gap-3 px-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <Toggle on={on} onChange={onChange} />
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

function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
        on ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
