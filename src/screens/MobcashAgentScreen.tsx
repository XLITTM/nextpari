import { useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Banknote, Clock3,
  History, LogOut, MapPin, User, Wallet,
} from 'lucide-react';
import { useCashierAuth } from '../cashier/auth/CashierAuthProvider';
import { cashierAuthErrorMessage, type CashierStaffContext } from '../cashier/auth/cashierAuth';

function formatTmtm(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM`;
}

type AgentTab = 'deposit' | 'payout' | 'history';

const QUICK_AMOUNTS = [10, 50, 100, 500];
const FINANCE_PENDING = 'Financial activation pending';

export function MobcashAgentScreen() {
  const { loading, staff, deniedMessage, signOut } = useCashierAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кассы…</p>
      </div>
    );
  }

  if (!staff) {
    return <AgentLogin deniedMessage={deniedMessage} />;
  }

  return (
    <AgentDesk
      staff={staff}
      onLogout={() => {
        void signOut();
      }}
    />
  );
}

function AgentLogin({ deniedMessage }: { deniedMessage: string }) {
  const { signIn } = useCashierAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : cashierAuthErrorMessage('AUTH_FAILED'));
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = error || deniedMessage;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-ink-900 via-ink-850 to-ink-950 relative overflow-hidden">
      <div className="absolute top-[-120px] left-[-80px] w-72 h-72 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="absolute bottom-[-100px] right-[-60px] w-64 h-64 rounded-full bg-accent-500/15 blur-3xl" />

      <div className="shrink-0 pt-14 pb-6 flex flex-col items-center gap-2 relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/40">
          <Banknote className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Mobcash</h1>
        <p className="text-xs text-ink-400 font-medium">Терминал агента · касса NextPari</p>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 relative z-10">
        <div className="w-full max-w-sm bg-white dark:bg-ink-800 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Вход кассира</h2>
            <p className="text-xs text-gray-500 dark:text-ink-400 mt-1">Email и пароль кассы</p>
          </div>
          <div className="p-5 pt-3">
            {shownError && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">{shownError}</p>
              </div>
            )}
            <label className="text-xs font-semibold text-gray-500 dark:text-ink-400 mb-1.5 block">Email</label>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-ink-700 rounded-xl px-3 mb-3 border border-gray-200 dark:border-ink-600">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="flex-1 bg-transparent py-3 text-sm font-semibold text-gray-900 dark:text-white outline-none"
                onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
              />
            </div>
            <label className="text-xs font-semibold text-gray-500 dark:text-ink-400 mb-1.5 block">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-gray-100 dark:bg-ink-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 mb-4 outline-none border border-gray-200 dark:border-ink-600 focus:border-brand-600"
              onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? 'Вход…' : 'Войти в кассу'}
            </button>
          </div>
        </div>
      </div>
      <p className="shrink-0 pb-6 text-center text-xs text-ink-500 relative z-10">Только для авторизованных кассиров</p>
    </div>
  );
}

function AgentDesk({
  staff,
  onLogout,
}: {
  staff: CashierStaffContext;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AgentTab>('deposit');

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 max-w-lg mx-auto relative">
      <header className="shrink-0 bg-ink-900 text-white px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Mobcash</p>
                <p className="text-sm font-extrabold truncate">{staff.displayName || 'Кассир'}</p>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-300">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-brand-400" />
              <span className="truncate">Касса · staging</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80 active:scale-90"
            aria-label="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-xs text-ink-300 font-semibold">Баланс кассы</span>
          </div>
          <p className="text-base font-extrabold tabular-nums text-white">{formatTmtm(0)}</p>
        </div>
        <p className="mt-2 text-[11px] font-bold text-amber-200 bg-amber-500/15 rounded-lg px-3 py-2">
          {FINANCE_PENDING}
        </p>
      </header>

      <div className="shrink-0 px-3 pt-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-[#1e293b] rounded-xl p-1 border border-gray-200 dark:border-gray-700">
          {([
            { id: 'deposit', label: 'Пополнение', icon: ArrowDownToLine },
            { id: 'payout', label: 'Выплата', icon: ArrowUpFromLine },
            { id: 'history', label: 'История', icon: History },
          ] as const).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  active
                    ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 pb-6">
        {tab === 'deposit' && <DepositTab />}
        {tab === 'payout' && <PayoutTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}

function PendingBanner() {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
      {FINANCE_PENDING}
    </div>
  );
}

function DepositTab() {
  const [playerId, setPlayerId] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-base font-bold text-gray-900 dark:text-white">Приём наличных</h2>
      <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 mb-4">Пополнение игрока · списание с кассы</p>
      <PendingBanner />

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">ID игрока</label>
      <input
        inputMode="numeric"
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="645912"
        disabled
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-2xl font-extrabold tracking-[0.35em] text-center rounded-xl px-4 py-3 mb-4 outline-none border border-gray-200 dark:border-gray-600 tabular-nums disabled:opacity-60"
      />

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">Сумма (TMTM)</label>
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        disabled
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-bold tabular-nums rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 disabled:opacity-60"
      />
      <div className="grid grid-cols-4 gap-2 mb-4">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            disabled
            className="py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 disabled:opacity-50"
          >
            +{value}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Clock3 className="w-5 h-5" />
        {FINANCE_PENDING}
      </button>
    </section>
  );
}

function PayoutTab() {
  const [code, setCode] = useState('');

  return (
    <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-base font-bold text-gray-900 dark:text-white">Выплата наличных</h2>
      <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 mb-4">Вывод игрока по коду заявки</p>
      <PendingBanner />

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">Код заявки</label>
      <input
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        disabled
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-2xl font-extrabold tracking-[0.35em] text-center rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 tabular-nums disabled:opacity-60"
      />
      <button
        type="button"
        disabled
        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-50 mb-4"
      >
        {FINANCE_PENDING}
      </button>
      <button
        type="button"
        disabled
        className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Banknote className="w-4 h-4" />
        {FINANCE_PENDING}
      </button>
    </section>
  );
}

function HistoryTab() {
  return (
    <section>
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">История смены</h2>
        <PendingBanner />
        <p className="text-center text-sm text-gray-500 py-6">Операции кассы недоступны до активации</p>
      </div>
    </section>
  );
}
