import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { History, Plus, RefreshCw, Snowflake, Unlock, Wallet, X } from 'lucide-react';
import {
  cashierOpLabel,
  cashierOpRef,
  createNetworkManager,
  fetchCashierLedger,
  formatBackofficeDateTime,
  formatTmtmCompact,
  subscribeNetworkSync,
  type BackofficeCashier,
  type CashierLedgerEntry,
  type LedgerPeriod,
  type ManagerSession,
  type NetworkManager,
} from '../../lib/backoffice';
import {
  toggleAgentBlockStatus,
  updateAgentBalance,
  useBackofficeStore,
} from '../../stores/backofficeStore';

export function ManagersPage({
  session,
  onNotice,
}: {
  session: ManagerSession;
  onNotice: (value: string) => void;
}) {
  const managers = useBackofficeStore((s) => s.managers);
  const cashiers = useBackofficeStore((s) => s.cashiers);
  const hydrate = useBackofficeStore((s) => s.hydrate);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    hydrate();
    return subscribeNetworkSync(() => hydrate());
  }, [hydrate]);

  const selected = managers.find((row) => row.id === selectedId) ?? null;
  const selectedCashiers = useMemo(
    () => (selectedId ? cashiers.filter((row) => row.managerId === selectedId) : []),
    [cashiers, selectedId],
  );

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Менеджеры</h2>
          <p className="text-sm text-gray-500 mt-0.5">{managers.length} менеджеров сети · нажмите строку, чтобы открыть кассы</p>
        </div>
        <button
          type="button"
          onClick={() => hydrate()}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-ink-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Добавить менеджера
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-zinc-800 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Логин</th>
              <th className="px-4 py-3">Регион</th>
              <th className="px-4 py-3 text-right">Выделенный баланс</th>
              <th className="px-4 py-3 text-right">Кассы</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className="border-t border-slate-100 dark:border-zinc-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <td className="px-4 py-3 font-bold text-ink-900 dark:text-white">{row.fullName}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{row.login}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{row.region}</td>
                <td className="px-4 py-3 text-right font-extrabold tabular-nums">{formatTmtmCompact(row.allocatedBalance)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.cashierCount}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                    row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {row.isActive ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
              </tr>
            ))}
            {managers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">Менеджеров пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {createOpen && (
        <CreateManagerModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (form) => {
            await createNetworkManager(session, form);
            onNotice(`Менеджер ${form.fullName} создан`);
            setCreateOpen(false);
            hydrate();
          }}
        />
      )}
      {selected && (
        <ManagerCashiersDrawer
          session={session}
          manager={selected}
          cashiers={selectedCashiers}
          onClose={() => setSelectedId(null)}
          onNotice={onNotice}
          onError={setError}
        />
      )}
    </section>
  );
}

function ManagerCashiersDrawer({
  session,
  manager,
  cashiers,
  onClose,
  onNotice,
  onError,
}: {
  session: ManagerSession;
  manager: NetworkManager;
  cashiers: BackofficeCashier[];
  onClose: () => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const adjustTarget = cashiers.find((row) => row.id === adjustId) ?? null;
  const historyTarget = cashiers.find((row) => row.id === historyId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Закрыть" />
      <aside className="w-full max-w-4xl bg-white dark:bg-zinc-900 h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Кассы и агенты менеджера</p>
            <h3 className="text-lg font-extrabold text-ink-900 dark:text-white">{manager.fullName}</h3>
            <p className="text-xs text-gray-500 mt-1">{manager.login} · {manager.region} · {cashiers.length} точек</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-zinc-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Точка / кассир</th>
                  <th className="px-4 py-3">Логин</th>
                  <th className="px-4 py-3">Адрес / локация</th>
                  <th className="px-4 py-3 text-right">Остаток кассы</th>
                  <th className="px-4 py-3 text-right">Оборот / доход</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cashiers.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink-900 dark:text-white">{row.pointName}</p>
                      <p className="text-xs text-gray-500">{row.fullName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{row.login}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{row.city} · {row.pointName}</td>
                    <td className="px-4 py-3 text-right font-extrabold tabular-nums text-ink-900 dark:text-white">
                      {formatTmtmCompact(row.floatBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold tabular-nums">{formatTmtmCompact(row.dailyTurnover)}</p>
                      <p className="text-xs font-semibold tabular-nums text-brand-700">{formatTmtmCompact(row.commissionEarned)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                        row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {row.isActive ? 'Активна' : 'Заблокирована'}
                      </span>
                      {row.blockedBy === 'owner' && !row.isActive && (
                        <p className="text-[10px] font-bold text-red-500 mt-1">Владелец</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const next = toggleAgentBlockStatus(row.id, 'owner');
                              onNotice(next.isActive
                                ? `Касса ${row.fullName} разблокирована`
                                : `Касса ${row.fullName} заблокирована владельцем`);
                            } catch (err) {
                              onError(err instanceof Error ? err.message : 'Ошибка блокировки');
                            }
                          }}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${
                            row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          {row.isActive ? 'Блокировать' : 'Разблокировать'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustId(row.id)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center gap-1"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Пополнить / Списать
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryId(row.id)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 inline-flex items-center gap-1"
                        >
                          <History className="w-3.5 h-3.5" />
                          История смен
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {cashiers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">У менеджера пока нет касс</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
      {adjustTarget && (
        <AdjustBalanceModal
          name={adjustTarget.fullName}
          balance={adjustTarget.floatBalance}
          onClose={() => setAdjustId(null)}
          onSubmit={(amount) => {
            const next = updateAgentBalance(adjustTarget.id, amount);
            onNotice(`Касса ${adjustTarget.fullName}: ${formatTmtmCompact(next.floatBalance)}`);
            setAdjustId(null);
          }}
        />
      )}
      {historyTarget && (
        <ShiftHistoryModal
          session={session}
          cashierId={historyTarget.id}
          title={`${historyTarget.fullName} · ${historyTarget.pointName}`}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}

function CreateManagerModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: {
    fullName: string;
    login: string;
    password: string;
    allocatedBalance: number;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [allocatedBalance, setAllocatedBalance] = useState('10000');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Новый менеджер" onClose={onClose}>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Имя" value={fullName} onChange={setFullName} placeholder="Мерет Аннаев" />
      <Field label="Логин" value={login} onChange={setLogin} placeholder="manager02" />
      <Field label="Пароль" value={password} onChange={setPassword} placeholder="••••" />
      <Field label="Выделенный баланс" value={allocatedBalance} onChange={setAllocatedBalance} placeholder="10000" />
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setError('');
          setSaving(true);
          try {
            await onSubmit({
              fullName,
              login,
              password,
              allocatedBalance: Number(allocatedBalance),
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать менеджера');
          } finally {
            setSaving(false);
          }
        }}
        className="w-full bg-ink-900 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-50"
      >
        {saving ? 'Сохранение…' : 'Создать менеджера'}
      </button>
    </Modal>
  );
}

function AdjustBalanceModal({
  name,
  balance,
  onClose,
  onSubmit,
}: {
  name: string;
  balance: number;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');

  const run = (sign: 1 | -1) => {
    const value = Number(amount) * sign;
    if (!Number.isFinite(Number(amount)) || !(Number(amount) > 0)) {
      setError('Введите сумму');
      return;
    }
    try {
      onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить баланс');
    }
  };

  return (
    <Modal title={`Пополнить / списать · ${name}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">Текущий остаток: <span className="font-extrabold text-ink-900">{formatTmtmCompact(balance)}</span></p>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Сумма" value={amount} onChange={setAmount} placeholder="500" />
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => run(1)} className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-xl">
          Пополнить
        </button>
        <button type="button" onClick={() => run(-1)} className="flex-1 bg-ink-900 text-white font-bold py-3 rounded-xl">
          Списать
        </button>
      </div>
    </Modal>
  );
}

function ShiftHistoryModal({
  session,
  cashierId,
  title,
  onClose,
}: {
  session: ManagerSession;
  cashierId: string;
  title: string;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<LedgerPeriod>('today');
  const [rows, setRows] = useState<CashierLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchCashierLedger(session, cashierId, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
    } finally {
      setLoading(false);
    }
  }, [session, cashierId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">История смен / Z-отчёты</p>
            <h3 className="text-base font-extrabold text-ink-900">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          {([
            { id: 'today', label: 'Сегодня' },
            { id: '7d', label: '7 дней' },
            { id: 'month', label: 'Месяц' },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                period === item.id ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
        {loading && <p className="text-sm text-gray-500">Загрузка…</p>}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-sm font-bold text-ink-900">{cashierOpLabel(row.type)}</p>
                <p className="text-[11px] text-gray-500">{cashierOpRef(row)} · {formatBackofficeDateTime(row.createdAt)}</p>
              </div>
              <p className={`text-sm font-extrabold tabular-nums ${row.signedAmount < 0 ? 'text-red-600' : 'text-ink-900'}`}>
                {row.signedAmount > 0 ? '+' : ''}{formatTmtmCompact(row.signedAmount)}
              </p>
            </div>
          ))}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Операций за период нет</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-extrabold text-ink-900">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-gray-500 mb-1.5 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
      />
    </label>
  );
}
