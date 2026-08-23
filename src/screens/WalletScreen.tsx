import { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock3, XCircle,
  CreditCard, Bitcoin, Wallet, ChevronLeft, X, Banknote,
} from 'lucide-react';
import { transactions as staticTransactions } from '../data';
import type { Transaction, WithdrawalMethod, WithdrawalRequest } from '../types';
import { supabase } from '../lib/supabase';
import { useToast } from '../ToastContext';
import { useProfile } from '../ProfileContext';
import { useWallet } from '../WalletContext';
import { RestrictionModal } from '../components/RestrictionModal';
import { playerCreateCashPayout, playerListCashPayouts, type PlayerCashPayout } from '../lib/cashier';

interface WalletScreenProps {
  balance: number;
  onBack: () => void;
  onNavigate: (screen: { name: 'personal-data' }) => void;
}

type HistoryTab = 'withdrawals' | 'deposits';
type WithdrawFormMethod = WithdrawalMethod | 'cash';

const methodConfig: Record<WithdrawFormMethod, { icon: typeof CreditCard; label: string; placeholder: string; prefix: string }> = {
  card: { icon: CreditCard, label: 'Банковская карта', placeholder: 'Номер карты', prefix: 'Вывод на карту ' },
  crypto: { icon: Bitcoin, label: 'Crypto / Web3', placeholder: 'Адрес кошелька (USDT-TRC20)', prefix: 'Вывод ' },
  ewallet: { icon: Wallet, label: 'Электронный кошелёк', placeholder: 'Номер кошелька', prefix: 'Вывод на кошелёк ' },
  cash: { icon: Banknote, label: 'Наличные (Mobcash)', placeholder: 'PIN выдаст система', prefix: 'Вывод наличными у агента' },
};

export function WalletScreen({ balance, onBack, onNavigate }: WalletScreenProps) {
  const { showToast } = useToast();
  const { isProfileComplete } = useProfile();
  const { publicId, applyBalance, refresh } = useWallet();
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [showRestriction, setShowRestriction] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [cashPayouts, setCashPayouts] = useState<PlayerCashPayout[]>([]);
  const [cashPin, setCashPin] = useState<{ code: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const [method, setMethod] = useState<WithdrawFormMethod>('card');
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load withdrawals:', error.message);
    }
    if (data) {
      setWithdrawals(data as WithdrawalRequest[]);
    }
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
      setSubmitting(true);
      try {
        const result = await playerCreateCashPayout(numAmount);
        applyBalance(result.newBalance);
        await refresh();
        setCashPin({ code: result.code, amount: result.amount });
        setAmount('');
        setShowWithdrawForm(false);
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

    const { error } = await supabase
      .from('withdrawal_requests')
      .insert({
        method,
        method_label: label,
        amount: numAmount,
        status: 'pending',
      });

    setSubmitting(false);

    if (error) {
      showToast('Ошибка при создании заявки');
      return;
    }

    showToast('Заявка на вывод создана');
    setAmount('');
    setDetail('');
    setShowWithdrawForm(false);
    fetchWithdrawals();
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
          setMethod={setMethod}
          amount={amount}
          setAmount={setAmount}
          detail={detail}
          setDetail={setDetail}
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

      {cashPin && (
        <CashPinModal
          code={cashPin.code}
          amount={cashPin.amount}
          onClose={() => setCashPin(null)}
        />
      )}
    </div>
  );
}

function WithdrawForm({
  method, setMethod, amount, setAmount, detail, setDetail,
  balance, submitting, onClose, onSubmit,
}: {
  method: WithdrawFormMethod;
  setMethod: (m: WithdrawFormMethod) => void;
  amount: string;
  setAmount: (v: string) => void;
  detail: string;
  setDetail: (v: string) => void;
  balance: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const cfg = methodConfig[method];
  const MethodIcon = cfg.icon;

  return (
    <div className="mx-3 mt-3 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Запрос на вывод</h3>
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
        placeholder="0"
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-bold tabular-nums rounded-xl px-4 py-3 mb-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
      />
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500 dark:text-gray-200">Доступно: {balance.toLocaleString('ru-RU')} TMTM</span>
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
        {(Object.keys(methodConfig) as WithdrawFormMethod[]).map((key) => {
          const mc = methodConfig[key];
          const McIcon = mc.icon;
          const isActive = method === key;
          return (
            <button
              key={key}
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

      {/* Detail input */}
      {method !== 'cash' && (
        <>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-200 mb-1.5 block flex items-center gap-1">
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
      )}
      {method === 'cash' && (
        <p className="text-xs text-gray-500 dark:text-gray-300 mb-4 leading-relaxed">
          Введите сумму и получите 6-значный код. Паспортные данные для наличных не нужны.
        </p>
      )}

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Clock3 className="w-5 h-5 animate-spin" />
            Обработка...
          </>
        ) : method === 'cash' ? (
          <>
            <Banknote className="w-5 h-5" />
            Получить код для кассира
          </>
        ) : (
          <>
            <ArrowUpFromLine className="w-5 h-5" />
            Запросить вывод
          </>
        )}
      </button>
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
              {cashPayouts.map((item) => (
                <CashPayoutCard key={item.id} payout={item} />
              ))}
              {withdrawals.map((w) => <WithdrawalCard key={w.id} withdrawal={w} />)}
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
      <div className="flex items-end justify-between mt-2">
        <p className="text-xl font-extrabold text-red-500 tabular-nums leading-none">
          − {withdrawal.amount.toLocaleString('ru-RU')} TMTM
        </p>
      </div>
      {withdrawal.status === 'rejected' && withdrawal.rejection_reason && (
        <p className="text-xs text-red-500 font-semibold mt-2">Причина: {withdrawal.rejection_reason}</p>
      )}
    </div>
  );
}

function CashPayoutCard({ payout }: { payout: PlayerCashPayout }) {
  const statusConfig = {
    pending: { icon: Clock3, label: 'Ждёт кассира', badge: 'bg-amber-500/20 text-amber-500' },
    paid: { icon: CheckCircle2, label: 'Выплачено', badge: 'bg-green-500/20 text-green-500' },
    cancelled: { icon: XCircle, label: 'Отменено', badge: 'bg-red-500/20 text-red-500' },
  };
  const status = statusConfig[payout.status];
  const StatusIcon = status.icon;
  const date = new Date(payout.createdAt);
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">Наличные у агента Mobcash</p>
          <p className="text-xs text-gray-500 dark:text-gray-200 mt-0.5">{dateStr}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${status.badge}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </div>
      {payout.status === 'pending' && (
        <p className="text-sm font-extrabold tracking-[0.25em] text-gray-900 dark:text-white mt-2">{payout.secretCode}</p>
      )}
      <p className="text-xl font-extrabold text-red-500 tabular-nums leading-none mt-2">
        − {payout.amount.toLocaleString('ru-RU')} TMTM
      </p>
    </div>
  );
}

function CashPinModal({ code, amount, onClose }: { code: string; amount: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
            <Banknote className="w-8 h-8 text-brand-600" />
          </div>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Код для кассира</h3>
          <p className="text-5xl font-black tracking-[0.28em] text-gray-900 dark:text-white tabular-nums leading-none py-2">
            {code}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Покажите этот код любому кассиру Мобкеш для получения наличных
          </p>
          <p className="text-sm font-bold text-brand-600">{amount.toLocaleString('ru-RU')} TMTM</p>
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3.5 rounded-xl mt-2"
          >
            Понятно
          </button>
        </div>
      </div>
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
