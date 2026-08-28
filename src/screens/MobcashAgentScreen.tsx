import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Banknote, CheckCircle2, Clock3,
  History, LogOut, MapPin, Printer, User, Wallet, X, XCircle,
} from 'lucide-react';
import {
  cashierDepositToPlayer,
  cashierLogin,
  cashierLookupPayoutCode,
  cashierPayoutByCode,
  cashierRefresh,
  cashierShiftHistory,
  clearCashierSession,
  formatCashierDate,
  formatTmtm,
  loadCashierSession,
  type CashierOperation,
  type CashierReceipt,
  type CashierSession,
  type PayoutLookup,
} from '../lib/cashier';
import { CASHIER_BLOCKED_MESSAGE, subscribeNetworkSync } from '../lib/backoffice';

type AgentTab = 'deposit' | 'payout' | 'history';
type HistoryTypeFilter = '' | 'deposit' | 'payout';
type HistoryStatusFilter = '' | 'completed' | 'failed';

const QUICK_AMOUNTS = [10, 50, 100, 500];

export function MobcashAgentScreen() {
  const [session, setSession] = useState<CashierSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    document.title = 'Mobcash — Терминал агента';
    const saved = loadCashierSession();
    if (!saved) {
      setBooting(false);
      return;
    }
    void cashierRefresh(saved.id)
      .then((next) => setSession(next))
      .catch(() => {
        clearCashierSession();
        setSession(null);
      })
      .finally(() => setBooting(false));
  }, []);

  const handleLogout = () => {
    clearCashierSession();
    setSession(null);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кассы…</p>
      </div>
    );
  }

  if (!session) {
    return <AgentLogin onSuccess={setSession} />;
  }

  return (
    <AgentDesk
      session={session}
      onSession={setSession}
      onLogout={handleLogout}
    />
  );
}

function AgentLogin({ onSuccess }: { onSuccess: (session: CashierSession) => void }) {
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!login.trim() || !pin.trim()) {
      setError('Введите логин и PIN-код кассира');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const session = await cashierLogin(login, pin);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

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
            <p className="text-xs text-gray-500 dark:text-ink-400 mt-1">Логин и PIN-код точки</p>
          </div>
          <div className="p-5 pt-3">
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <label className="text-xs font-semibold text-gray-500 dark:text-ink-400 mb-1.5 block">Логин</label>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-ink-700 rounded-xl px-3 mb-3 border border-gray-200 dark:border-ink-600">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="agent01"
                autoComplete="username"
                className="flex-1 bg-transparent py-3 text-sm font-semibold text-gray-900 dark:text-white outline-none"
                onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
              />
            </div>
            <label className="text-xs font-semibold text-gray-500 dark:text-ink-400 mb-1.5 block">PIN-код</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              autoComplete="current-password"
              className="w-full bg-gray-100 dark:bg-ink-700 text-gray-900 dark:text-white text-lg font-bold tracking-[0.4em] text-center rounded-xl px-4 py-3 mb-4 outline-none border border-gray-200 dark:border-ink-600 focus:border-brand-600"
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
            <p className="mt-3 text-[11px] text-center text-gray-400 dark:text-ink-500">
              Демо: <span className="font-semibold text-gray-600 dark:text-ink-300">agent01</span> / PIN <span className="font-semibold text-gray-600 dark:text-ink-300">1234</span>
            </p>
          </div>
        </div>
      </div>
      <p className="shrink-0 pb-6 text-center text-xs text-ink-500 relative z-10">Только для авторизованных кассиров</p>
    </div>
  );
}

function AgentDesk({
  session,
  onSession,
  onLogout,
}: {
  session: CashierSession;
  onSession: (session: CashierSession) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AgentTab>('deposit');
  const [receipt, setReceipt] = useState<CashierReceipt | null>(null);

  const applyReceipt = (next: CashierReceipt) => {
    setReceipt(next);
    onSession({ ...session, floatBalance: next.floatBalance });
  };

  useEffect(() => {
    return subscribeNetworkSync(() => {
      void cashierRefresh(session.id).then(onSession).catch(() => undefined);
    });
  }, [session.id, onSession]);

  const frozen = session.isActive === false;

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
                <p className="text-sm font-extrabold truncate">{session.fullName}</p>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-300">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-brand-400" />
              <span className="truncate">{session.city} · {session.pointName}</span>
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
          <p className="text-base font-extrabold tabular-nums text-white">{formatTmtm(session.floatBalance)}</p>
        </div>
        {frozen && (
          <p className="mt-2 text-[11px] font-bold text-red-300 bg-red-500/15 rounded-lg px-3 py-2">
            {CASHIER_BLOCKED_MESSAGE}
          </p>
        )}
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
        {tab === 'deposit' && (
          <DepositTab cashierId={session.id} floatBalance={session.floatBalance} frozen={frozen} onReceipt={applyReceipt} />
        )}
        {tab === 'payout' && (
          <PayoutTab cashierId={session.id} frozen={frozen} onReceipt={applyReceipt} />
        )}
        {tab === 'history' && (
          <HistoryTab cashierId={session.id} refreshKey={session.floatBalance} />
        )}
      </div>

      {receipt && (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}

function DepositTab({
  cashierId,
  floatBalance,
  frozen,
  onReceipt,
}: {
  cashierId: string;
  floatBalance: number;
  frozen?: boolean;
  onReceipt: (receipt: CashierReceipt) => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const numericAmount = Number(amount);

  const handleDeposit = async () => {
    if (frozen) {
      setError(CASHIER_BLOCKED_MESSAGE);
      return;
    }
    if (playerId.length < 5) {
      setError('Неверный ID');
      return;
    }
    if (!/^\d{5,6}$/.test(playerId)) {
      setError('Неверный ID');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Введите сумму пополнения');
      return;
    }
    if (numericAmount > floatBalance) {
      setError('Недостаточно средств в кассе');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const receipt = await cashierDepositToPlayer({
        cashierId,
        playerId,
        amount: numericAmount,
      });
      onReceipt(receipt);
      setSuccess(`Счет игрока ${playerId} пополнен на ${numericAmount} TMTM`);
      setPlayerId('');
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка пополнения');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-base font-bold text-gray-900 dark:text-white">Приём наличных</h2>
      <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 mb-4">Пополнение игрока · списание с кассы</p>

      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          {success}
        </div>
      )}

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">ID игрока</label>
      <input
        inputMode="numeric"
        value={playerId}
        onChange={(e) => {
          setPlayerId(e.target.value.replace(/\D/g, '').slice(0, 6));
          setSuccess('');
        }}
        placeholder="645912"
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-2xl font-extrabold tracking-[0.35em] text-center rounded-xl px-4 py-3 mb-4 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 tabular-nums"
      />

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">Сумма (TMTM)</label>
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-bold tabular-nums rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600"
      />
      <div className="grid grid-cols-4 gap-2 mb-4">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const current = Number(amount) || 0;
              setAmount(String(current + value));
            }}
            className="py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-800 dark:text-gray-100 active:scale-95 bg-gray-50 dark:bg-gray-800"
          >
            +{value}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleDeposit()}
        disabled={submitting || frozen}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Clock3 className="w-5 h-5 animate-spin" /> : <ArrowDownToLine className="w-5 h-5" />}
        {frozen ? 'Касса заблокирована' : submitting ? 'Проведение…' : 'Пополнить счёт'}
      </button>
    </section>
  );
}

function PayoutTab({
  cashierId,
  frozen,
  onReceipt,
}: {
  cashierId: string;
  frozen?: boolean;
  onReceipt: (receipt: CashierReceipt) => void;
}) {
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<PayoutLookup | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);

  const handleCheck = async () => {
    if (frozen) {
      setError(CASHIER_BLOCKED_MESSAGE);
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Введите 6-значный PIN-код заявки');
      setLookup(null);
      return;
    }
    setChecking(true);
    setError('');
    try {
      const next = await cashierLookupPayoutCode(code);
      setLookup(next);
    } catch (err) {
      setLookup(null);
      setError(err instanceof Error ? err.message : 'Код не найден');
    } finally {
      setChecking(false);
    }
  };

  const handlePayout = async () => {
    if (frozen) {
      setError(CASHIER_BLOCKED_MESSAGE);
      return;
    }
    setPaying(true);
    setError('');
    try {
      const receipt = await cashierPayoutByCode({ cashierId, code });
      onReceipt(receipt);
      setCode('');
      setLookup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка выплаты');
    } finally {
      setPaying(false);
    }
  };

  return (
    <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-base font-bold text-gray-900 dark:text-white">Выплата наличных</h2>
      <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 mb-4">Вывод игрока по секретному PIN</p>

      {error && <ErrorBanner message={error} />}

      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">PIN-код заявки</label>
      <input
        inputMode="numeric"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          setLookup(null);
        }}
        placeholder="••••••"
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-2xl font-extrabold tracking-[0.35em] text-center rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 tabular-nums"
      />
      <button
        type="button"
        onClick={() => void handleCheck()}
        disabled={checking || frozen}
        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 mb-4"
      >
        {checking ? 'Проверка…' : 'Проверить код'}
      </button>

      {lookup && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-600/10 p-3 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-400 mb-2">Заявка найдена</p>
          <Row label="ID игрока" value={lookup.playerPublicId} />
          <Row label="К выплате" value={formatTmtm(lookup.amount)} accent />
          <Row
            label="Адрес кассы"
            value={
              lookup.city && lookup.point
                ? `${lookup.city} · ${lookup.point}`
                : lookup.city || lookup.point || 'Точка выдачи не указана'
            }
          />
          <Row label="Создана" value={formatCashierDate(lookup.createdAt)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => void handlePayout()}
        disabled={!lookup || paying || frozen}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {paying ? <Clock3 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
        {paying ? 'Выплата…' : 'Подтвердить и выдать наличные'}
      </button>
      <p className="mt-3 text-[11px] text-center text-gray-400">Демо-заявка: PIN 847291 · игрок 882341</p>
    </section>
  );
}

function HistoryTab({ cashierId, refreshKey }: { cashierId: string; refreshKey: number }) {
  const [type, setType] = useState<HistoryTypeFilter>('');
  const [status, setStatus] = useState<HistoryStatusFilter>('');
  const [rows, setRows] = useState<CashierOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await cashierShiftHistory({ cashierId, type, status });
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cashierId, type, status]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const totals = useMemo(() => {
    const deposits = rows.filter((row) => row.type === 'deposit' && row.status === 'completed');
    const payouts = rows.filter((row) => row.type === 'payout' && row.status === 'completed');
    return {
      depositSum: deposits.reduce((sum, row) => sum + row.amount, 0),
      payoutSum: payouts.reduce((sum, row) => sum + row.amount, 0),
      count: rows.length,
    };
  }, [rows]);

  return (
    <section>
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">История смены</h2>
        <p className="text-xs text-gray-500 dark:text-gray-300 mb-3">Операции за сегодня</p>
        <div className="space-y-3 mb-3">
          <FilterGroup
            label="Тип"
            value={type}
            onChange={(value) => setType(value as HistoryTypeFilter)}
            options={[
              { id: '', label: 'Все' },
              { id: 'deposit', label: 'Пополнения' },
              { id: 'payout', label: 'Выплаты' },
            ]}
          />
          <FilterGroup
            label="Статус"
            value={status}
            onChange={(value) => setStatus(value as HistoryStatusFilter)}
            options={[
              { id: '', label: 'Все' },
              { id: 'completed', label: 'Успешно' },
              { id: 'failed', label: 'Ошибка' },
            ]}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Операций" value={String(totals.count)} />
          <MiniStat label="Принято" value={totals.depositSum.toLocaleString('ru-RU')} />
          <MiniStat label="Выдано" value={totals.payoutSum.toLocaleString('ru-RU')} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <p className="text-center text-sm text-gray-500 py-8">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-8">Сегодня операций нет</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <OperationCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{label}</p>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex-1 text-center text-[11px] font-bold px-2.5 py-1.5 rounded-lg ${
              value === option.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-2 py-2">
      <p className="text-[10px] text-gray-500 font-semibold">{label}</p>
      <p className="text-sm font-extrabold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </div>
  );
}

function OperationCard({ row }: { row: CashierOperation }) {
  const isDeposit = row.type === 'deposit';
  const ok = row.status === 'completed';
  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {isDeposit ? 'Пополнение игрока' : 'Выплата наличных'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">ID {row.playerPublicId} · {row.receiptCode}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatCashierDate(row.createdAt)}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
          ok ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'
        }`}>
          {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {ok ? 'Успешно' : 'Ошибка'}
        </span>
      </div>
      <p className={`mt-2 text-lg font-extrabold tabular-nums ${isDeposit ? 'text-red-500' : 'text-brand-600'}`}>
        {isDeposit ? '−' : '+'} {row.amount.toLocaleString('ru-RU')} TMTM
      </p>
    </div>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: CashierReceipt; onClose: () => void }) {
  const isDeposit = receipt.type === 'deposit';
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-end sm:items-center justify-center px-0 sm:px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div id="mobcash-receipt" className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-8 h-8 text-brand-600" />
          </div>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Операция проведена</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            {isDeposit ? 'Наличные приняты, счёт игрока пополнен' : 'Наличные выданы, заявка закрыта'}
          </p>
          <div className="w-full rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-left space-y-2">
            <Row label="Чек" value={receipt.receiptCode} />
            <Row label="Тип" value={isDeposit ? 'Пополнение' : 'Выплата'} />
            <Row label="ID игрока" value={receipt.playerPublicId} />
            <Row label="Сумма" value={formatTmtm(receipt.amount)} accent />
            <Row label="Кассир" value={receipt.cashierName} />
            <Row label="Точка" value={`${receipt.city} · ${receipt.pointName}`} />
            <Row label="Касса" value={formatTmtm(receipt.floatBalance)} />
            <Row label="Время" value={formatCashierDate(receipt.createdAt)} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 border border-gray-200 dark:border-gray-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-gray-800 dark:text-gray-100"
          >
            <Printer className="w-4 h-4" />
            Печать
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-xl"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-300">{label}</span>
      <span className={`text-xs font-bold text-right tabular-nums ${accent ? 'text-brand-600' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
      <p className="text-xs font-semibold text-red-600 dark:text-red-400">{message}</p>
    </div>
  );
}
