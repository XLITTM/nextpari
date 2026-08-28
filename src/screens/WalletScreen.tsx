import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock3, XCircle,
  CreditCard, Bitcoin, Wallet, ChevronLeft, ChevronDown, X, Banknote, Search, MapPin, Copy,
} from 'lucide-react';
import { transactions as staticTransactions } from '../data';
import type { Transaction, WithdrawalMethod, WithdrawalRequest } from '../types';
import { useToast } from '../ToastContext';
import { useProfile } from '../ProfileContext';
import { useWallet } from '../WalletContext';
import { RestrictionModal } from '../components/RestrictionModal';
import { playerCreateCashPayout, playerListCashPayouts, type PlayerCashPayout } from '../lib/cashier';
import {
  MOBCASH_CITIES,
  MOBCASH_MIN_WITHDRAWAL,
  formatMobcashWithdrawalLabel,
  pointsForCity,
} from '../lib/mobcashPickupPoints';
import { createWithdrawalRequest, listWithdrawalRequests } from '../lib/withdrawalRequests';

interface WalletScreenProps {
  balance: number;
  onBack: () => void;
  onNavigate: (screen: { name: 'personal-data' }) => void;
}

type HistoryTab = 'withdrawals' | 'deposits';

const methodConfig: Record<WithdrawalMethod, { icon: typeof CreditCard; label: string; placeholder: string; prefix: string }> = {
  card: { icon: CreditCard, label: 'Банковская карта', placeholder: 'Номер карты', prefix: 'Вывод на карту ' },
  crypto: { icon: Bitcoin, label: 'Crypto / Web3', placeholder: 'Адрес кошелька (USDT-TRC20)', prefix: 'Вывод ' },
  ewallet: { icon: Wallet, label: 'Электронный кошелёк', placeholder: 'Номер кошелька', prefix: 'Вывод на кошелёк ' },
  cash: { icon: Banknote, label: 'Наличные (Mobcash)', placeholder: 'Точка выдачи', prefix: 'Наличные (Mobcash) · ' },
};

export function WalletScreen({ balance, onBack, onNavigate }: WalletScreenProps) {
  const { showToast } = useToast();
  const { isProfileComplete } = useProfile();
  const { publicId, applyBalance, refresh } = useWallet();
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [showRestriction, setShowRestriction] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [cashPayouts, setCashPayouts] = useState<PlayerCashPayout[]>([]);
  const [loading, setLoading] = useState(true);

  const [method, setMethod] = useState<WithdrawalMethod>('card');
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [cashCity, setCashCity] = useState('');
  const [cashPointId, setCashPointId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleMethodChange = (next: WithdrawalMethod) => {
    setMethod(next);
    setDetail('');
    setCashCity('');
    setCashPointId('');
  };

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    setWithdrawals(await listWithdrawalRequests());
    setCashPayouts(await playerListCashPayouts());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const handleRequestWithdrawal = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      showToast('Введите корректную сумму');
      return;
    }
    if (numAmount > balance) {
      showToast('Недостаточно средств на балансе');
      return;
    }

    if (method === 'cash') {
      if (numAmount < MOBCASH_MIN_WITHDRAWAL) {
        showToast(`Минимальная сумма вывода — ${MOBCASH_MIN_WITHDRAWAL.toFixed(2)} TMTM`);
        return;
      }
      const point = pointsForCity(cashCity).find((item) => item.id === cashPointId);
      if (!cashCity || !point) {
        showToast('Выберите город и точку выдачи');
        return;
      }

      setSubmitting(true);
      try {
        const label = formatMobcashWithdrawalLabel(cashCity, point.label);
        const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
        const result = await playerCreateCashPayout(numAmount, {
          city: cashCity,
          point: point.label,
          pinCode,
        });
        applyBalance(result.newBalance);
        await createWithdrawalRequest({
          method: 'cash',
          methodLabel: label,
          amount: result.amount,
          pinCode: result.code,
          city: cashCity,
          point: point.label,
          playerId: result.playerPublicId || publicId || undefined,
        });
        showToast(`Заявка создана · PIN ${result.code}`);
        setAmount('');
        setCashCity('');
        setCashPointId('');
        setShowWithdrawForm(false);
        await refresh();
        fetchWithdrawals();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Ошибка при создании заявки');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!isProfileComplete) {
      setShowRestriction(true);
      return;
    }

    if (!detail.trim()) {
      showToast('Заполните реквизиты для вывода');
      return;
    }

    setSubmitting(true);
    try {
      const cfg = methodConfig[method];
      let label: string;
      if (method === 'card') {
        const digits = detail.replace(/\s/g, '').slice(-4);
        label = `${cfg.prefix}**** ${digits}`;
      } else if (method === 'crypto') {
        label = `Вывод USDT-TRC20`;
      } else {
        label = `${cfg.prefix}${detail.slice(0, 8)}`;
      }

      await createWithdrawalRequest({
        method,
        methodLabel: label,
        amount: numAmount,
      });
      showToast('Заявка на вывод создана');
      setAmount('');
      setDetail('');
      setShowWithdrawForm(false);
      fetchWithdrawals();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка при создании заявки');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-2 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Управление счётом</h1>
      </div>

      {/* Balance card */}
      <div className="mx-3 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-5 text-center">
        <p className="text-xs text-white/90 mb-1">Доступный баланс</p>
        <p className="text-4xl font-extrabold text-white tabular-nums mb-1">
          {balance.toLocaleString('ru-RU')} TMTM
        </p>
        {publicId && (
          <p className="text-xs text-white/80 font-semibold mb-4 tracking-[0.2em]">ID игрока · {publicId}</p>
        )}
        {!publicId && <div className="mb-4" />}
        <div className="flex gap-3">
          <button className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-green-900/20">
            <ArrowDownToLine className="w-5 h-5" />
            Пополнить
          </button>
          <button
            onClick={() => {
              setShowWithdrawForm(true);
              setShowRestriction(false);
            }}
            className="flex-1 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ArrowUpFromLine className="w-5 h-5" />
            Вывести
          </button>
        </div>
      </div>

      {/* Withdraw form */}
      {showWithdrawForm && (
        <WithdrawForm
          method={method}
          setMethod={handleMethodChange}
          amount={amount}
          setAmount={setAmount}
          detail={detail}
          setDetail={setDetail}
          cashCity={cashCity}
          setCashCity={(city) => {
            setCashCity(city);
            setCashPointId('');
          }}
          cashPointId={cashPointId}
          setCashPointId={setCashPointId}
          balance={balance}
          submitting={submitting}
          onClose={() => setShowWithdrawForm(false)}
          onSubmit={handleRequestWithdrawal}
        />
      )}

      {/* Financial history */}
      <div className="mt-5 px-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">
          Финансовые операции
        </h2>
        <HistorySection withdrawals={withdrawals} cashPayouts={cashPayouts} loading={loading} />
      </div>

      {/* Restriction modal */}
      <RestrictionModal
        open={showRestriction}
        message="Для вывода средств необходимо заполнить личные данные"
        buttonText="Заполнить данные"
        onAction={() => { setShowRestriction(false); onNavigate({ name: 'personal-data' }); }}
        onClose={() => setShowRestriction(false)}
      />
    </div>
  );
}

function WithdrawForm({
  method, setMethod, amount, setAmount, detail, setDetail,
  cashCity, setCashCity, cashPointId, setCashPointId,
  balance, submitting, onClose, onSubmit,
}: {
  method: WithdrawalMethod;
  setMethod: (m: WithdrawalMethod) => void;
  amount: string;
  setAmount: (v: string) => void;
  detail: string;
  setDetail: (v: string) => void;
  cashCity: string;
  setCashCity: (city: string) => void;
  cashPointId: string;
  setCashPointId: (id: string) => void;
  balance: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const cfg = methodConfig[method];
  const MethodIcon = cfg.icon;
  const numAmount = parseFloat(amount);
  const cityPoints = useMemo(() => pointsForCity(cashCity), [cashCity]);
  const selectedPoint = cityPoints.find((point) => point.id === cashPointId);
  const cashReady =
    method === 'cash' &&
    Boolean(cashCity) &&
    Boolean(selectedPoint) &&
    Number.isFinite(numAmount) &&
    numAmount >= MOBCASH_MIN_WITHDRAWAL &&
    numAmount <= balance;
  const canSubmit = method === 'cash' ? cashReady : !submitting;

  return (
    <div className="mx-3 mt-3 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Запрос на вывод средств</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-200 hover:text-red-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Amount */}
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-200 mb-1.5 block">Сумма вывода (TMTM)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={method === 'cash' ? MOBCASH_MIN_WITHDRAWAL.toFixed(2) : '0'}
        min={method === 'cash' ? MOBCASH_MIN_WITHDRAWAL : undefined}
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-bold tabular-nums rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
      />
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500 dark:text-gray-200">
          {method === 'cash'
            ? `Мин. ${MOBCASH_MIN_WITHDRAWAL.toFixed(2)} TMTM · Доступно: ${balance.toLocaleString('ru-RU')} TMTM`
            : `Доступно: ${balance.toLocaleString('ru-RU')} TMTM`}
        </span>
        <button
          onClick={() => setAmount(String(balance))}
          className="text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors"
        >
          Макс. сумма
        </button>
      </div>

      {/* Method selector */}
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-200 mb-1.5 block">Способ вывода</label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(Object.keys(methodConfig) as WithdrawalMethod[]).map((key) => {
          const mc = methodConfig[key];
          const McIcon = mc.icon;
          const isActive = method === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMethod(key)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95 ${
                isActive
                  ? 'border-brand-600 bg-brand-50 dark:bg-brand-600/15 text-brand-600 dark:text-brand-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-200'
              }`}
            >
              <McIcon className="w-5 h-5" />
              <span className="text-[10px] font-semibold text-center leading-tight">{mc.label}</span>
            </button>
          );
        })}
      </div>

      {/* Detail input / Mobcash pickup selectors */}
      {method !== 'cash' ? (
        <>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-200 mb-1.5 flex items-center gap-1">
            <MethodIcon className="w-3.5 h-3.5" />
            {cfg.placeholder}
          </label>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={cfg.placeholder}
            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 mb-4 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
          />
        </>
      ) : (
        <div className="mb-4 space-y-3">
          <SearchableSelect
            label="Город"
            placeholder="Выберите город"
            value={cashCity}
            options={MOBCASH_CITIES.map((city) => ({ id: city, label: city }))}
            onChange={setCashCity}
          />
          <SearchableSelect
            label="Улица / Касса"
            placeholder={cashCity ? 'Выберите точку выдачи' : 'Сначала выберите город'}
            value={cashPointId}
            displayValue={selectedPoint?.label}
            options={cityPoints.map((point) => ({ id: point.id, label: point.label }))}
            onChange={setCashPointId}
            disabled={!cashCity}
          />
          <p className="text-xs text-gray-500 dark:text-gray-300 leading-relaxed">
            Паспортные данные для наличных не нужны. Минимальная сумма — {MOBCASH_MIN_WITHDRAWAL.toFixed(2)} TMTM.
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || (method === 'cash' ? !cashReady : false)}
        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Clock3 className="w-5 h-5 animate-spin" />
            Обработка...
          </>
        ) : (
          <>
            {method === 'cash' ? <Banknote className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
            Запросить вывод
          </>
        )}
      </button>
      {method === 'cash' && !canSubmit && !submitting && (
        <p className="mt-2 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Выберите город, кассу и сумму от {MOBCASH_MIN_WITHDRAWAL.toFixed(2)} TMTM
        </p>
      )}
    </div>
  );
}

function SearchableSelect({
  label,
  placeholder,
  value,
  displayValue,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  displayValue?: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = displayValue ?? options.find((option) => option.id === value)?.label ?? '';
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-200">
        <MapPin className="h-3.5 w-3.5" />
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery('');
        }}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500'
            : 'border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
        }`}
      >
        <span className={`truncate ${selectedLabel ? '' : 'text-gray-400 dark:text-gray-400'}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-[#0f172a]">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              className="w-full bg-transparent py-1.5 text-sm font-medium text-gray-900 outline-none dark:text-white"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-xs font-medium text-gray-500">Ничего не найдено</li>
            ) : (
              filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-brand-50 dark:hover:bg-brand-600/15 ${
                      value === option.id
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300'
                        : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function HistorySection({
  withdrawals, cashPayouts, loading,
}: {
  withdrawals: WithdrawalRequest[];
  cashPayouts: PlayerCashPayout[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<HistoryTab>('withdrawals');

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: 'withdrawals', label: 'Заявки на вывод' },
    { id: 'deposits', label: 'Пополнения' },
  ];

  return (
    <>
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 dark:bg-[#1e293b] rounded-xl p-1 mb-3 border border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'withdrawals' && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-200 py-8">Загрузка заявок...</p>
          ) : withdrawals.length === 0 && cashPayouts.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-200 py-8">Нет заявок на вывод</p>
          ) : (
            <>
              {withdrawals.map((w) => (
                <WithdrawalCard key={w.id} withdrawal={w} />
              ))}
              {cashPayouts
                .filter((item) => !withdrawals.some((w) => w.pin_code && w.pin_code === item.secretCode))
                .map((item) => (
                  <CashPayoutCard key={item.id} payout={item} />
                ))}
            </>
          )}
        </div>
      )}

      {tab === 'deposits' && (
        <div className="space-y-2">
          {staticTransactions.filter((tx) => tx.type === 'deposit').map((tx) => (
            <TransactionItem key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </>
  );
}

function PinBadge({ pinCode }: { pinCode: string }) {
  const { showToast } = useToast();
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(pinCode);
            showToast('PIN скопирован');
          } catch {
            showToast(`PIN: ${pinCode}`);
          }
        }}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[13px] font-bold text-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-emerald-400"
      >
        <span className="tabular-nums tracking-wider">PIN: {pinCode}</span>
        <Copy className="h-3.5 w-3.5" />
      </button>
      <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        Назовите этот код кассиру на точке выдачи
      </p>
    </div>
  );
}

function WithdrawalCard({ withdrawal }: { withdrawal: WithdrawalRequest }) {
  const statusConfig = {
    pending: {
      icon: Clock3,
      label: 'В обработке',
      badge: 'bg-amber-500/20 text-amber-500',
    },
    approved: {
      icon: CheckCircle2,
      label: 'Выплачено',
      badge: 'bg-green-500/20 text-green-500',
    },
    rejected: {
      icon: XCircle,
      label: 'Отклонено',
      badge: 'bg-red-500/20 text-red-500',
    },
  };
  const status = statusConfig[withdrawal.status];
  const StatusIcon = status.icon;

  const date = new Date(withdrawal.created_at);
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{withdrawal.method_label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-200 mt-0.5">{dateStr}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${status.badge}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </div>
      {withdrawal.pin_code && withdrawal.status === 'pending' && (
        <PinBadge pinCode={withdrawal.pin_code} />
      )}
      <div className="mt-2 flex items-end justify-between">
        <p className="text-xl font-extrabold text-red-500 tabular-nums leading-none">
          − {withdrawal.amount.toLocaleString('ru-RU')} TMTM
        </p>
      </div>
      {withdrawal.status === 'rejected' && withdrawal.rejection_reason && (
        <p className="mt-2 text-xs font-semibold text-red-500">Причина: {withdrawal.rejection_reason}</p>
      )}
    </div>
  );
}

function CashPayoutCard({ payout }: { payout: PlayerCashPayout }) {
  const statusConfig = {
    pending: { icon: Clock3, label: 'В обработке', badge: 'bg-amber-500/20 text-amber-500' },
    paid: { icon: CheckCircle2, label: 'Выплачено', badge: 'bg-green-500/20 text-green-500' },
    cancelled: { icon: XCircle, label: 'Отменено', badge: 'bg-red-500/20 text-red-500' },
  };
  const status = statusConfig[payout.status];
  const StatusIcon = status.icon;
  const date = new Date(payout.createdAt);
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const label = payout.city && payout.point
    ? formatMobcashWithdrawalLabel(payout.city, payout.point)
    : 'Наличные (Mobcash)';

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-200 mt-0.5">{dateStr}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${status.badge}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </div>
      {payout.status === 'pending' && payout.secretCode && <PinBadge pinCode={payout.secretCode} />}
      <p className="mt-2 text-xl font-extrabold text-red-500 tabular-nums leading-none">
        − {payout.amount.toLocaleString('ru-RU')} TMTM
      </p>
    </div>
  );
}

function TransactionItem({ tx }: { tx: Transaction }) {
  const isPositive = tx.amount > 0;
  const statusConfig = {
    completed: { icon: CheckCircle2, text: 'Завершён', color: 'text-brand-600' },
    processing: { icon: Clock3, text: 'В обработке', color: 'text-accent-400' },
    failed: { icon: XCircle, text: 'Отклонён', color: 'text-red-500' },
  };
  const status = statusConfig[tx.status];
  const StatusIcon = status.icon;

  const typeIcon = {
    deposit: { icon: ArrowDownToLine, color: 'text-brand-600' },
    withdraw: { icon: ArrowUpFromLine, color: 'text-accent-400' },
    bet: { icon: ArrowUpFromLine, color: 'text-red-500' },
    win: { icon: ArrowDownToLine, color: 'text-brand-600' },
  };
  const type = typeIcon[tx.type];
  const TypeIcon = type.icon;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
        <TypeIcon className={`w-5 h-5 ${type.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{tx.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusIcon className={`w-3 h-3 ${status.color}`} />
          <span className="text-xs text-gray-500 dark:text-gray-200">{tx.date}</span>
          <span className={`text-xs ${status.color}`}>· {status.text}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold tabular-nums ${isPositive ? 'text-brand-600' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{tx.amount.toLocaleString('ru-RU')}
        </p>
      </div>
    </div>
  );
}
