import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw, Snowflake, Unlock } from 'lucide-react';
import {
  fetchManagerCashierLedger,
  fetchManagerCashiers,
  fetchManagerFinance,
  fetchManagerTransfers,
  formatTmtmCompact,
  postManagerCashier,
  postManagerCollect,
  postManagerFund,
  setManagerCashierFrozen,
  type BackofficeCashier,
  type CashierLedgerEntry,
  type ManagerFinanceOverview,
  type ManagerOperationalCashier,
} from '../../manager/services';
import {
  isAmbiguousStaffError,
  isOperationalAccountActive,
  retainIdempotencyKey,
} from '../../shared/staff/financeGate';

export function ManagerAgentsPage({
  onNotice,
}: {
  onNotice: (value: string) => void;
}) {
  const [cashiers, setCashiers] = useState<BackofficeCashier[]>([]);
  const [finance, setFinance] = useState<ManagerFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [money, setMoney] = useState<{ cashierId: string; kind: 'fund' | 'collect' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, overview] = await Promise.all([
        fetchManagerCashiers(),
        fetchManagerFinance().catch(() => null),
      ]);
      setCashiers(rows);
      setFinance(overview);
    } catch (err) {
      setCashiers([]);
      setFinance(null);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить кассы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const opById = new Map((finance?.cashiers ?? []).map((row) => [row.cashierId, row]));
  const managerMoneyOk = isOperationalAccountActive(finance?.manager);
  const openRow = cashiers.find((row) => row.id === openId) ?? null;
  const openOp = openId ? opById.get(openId) : undefined;

  if (openRow) {
    return (
      <ManagerCashierDetail
        cashier={openRow}
        op={openOp}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Мои кассы и кассиры</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Загрузка…' : `${cashiers.length} точек · создание кассира независимо от баланса`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white"
          >
            <Plus className="w-4 h-4" />
            Добавить кассира
          </button>
        </div>
      </div>
      {!managerMoneyOk && (
        <p className="mb-4 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Financial activation pending. Пополнение и инкассация доступны только при active manager и active cashier.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {creating && (
        <CreateCashierForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            onNotice('Кассир создан');
            await load();
          }}
        />
      )}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Имя точки / кассира</th>
              <th className="px-4 py-3">Адрес точки</th>
              <th className="px-4 py-3 text-right">Операционный остаток</th>
              <th className="px-4 py-3 text-right">Доход за смену</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cashiers.map((row) => {
              const op = opById.get(row.id);
              const moneyOk = managerMoneyOk && isOperationalAccountActive(op);
              return (
                <tr key={row.id || row.login} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <button type="button" className="text-left" onClick={() => setOpenId(row.id)}>
                      <p className="font-bold text-ink-900">{row.pointName || 'Точка'}</p>
                      <p className="text-xs text-gray-500">{row.fullName || 'Кассир'} · {row.login || '—'}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.city || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-extrabold tabular-nums">
                      {op ? formatTmtmCompact(op.availableBalance) : 'недоступен'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {op ? `${op.status} · ${op.migrationState}` : 'нет operational account'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-700">
                    {formatTmtmCompact(row.commissionEarned)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {row.isActive ? 'Активна' : 'Заблокирована'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        disabled={!moneyOk}
                        title={moneyOk ? 'Пополнить кассу' : 'Financial activation pending'}
                        onClick={() => setMoney({ cashierId: row.id, kind: 'fund' })}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${
                          moneyOk ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Пополнить
                      </button>
                      <button
                        type="button"
                        disabled={!moneyOk}
                        title={moneyOk ? 'Инкассация' : 'Financial activation pending'}
                        onClick={() => setMoney({ cashierId: row.id, kind: 'collect' })}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${
                          moneyOk ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Инкассация
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === row.id}
                        onClick={async () => {
                          setPendingId(row.id);
                          setError('');
                          try {
                            await setManagerCashierFrozen({ cashierId: row.id, frozen: row.isActive });
                            onNotice(row.isActive ? `Касса ${row.fullName || row.login} заблокирована` : `Касса ${row.fullName || row.login} разблокирована`);
                            await load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                          } finally {
                            setPendingId(null);
                          }
                        }}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-50 ${
                          row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {row.isActive ? 'Блокировать' : 'Разблокировать'}
                      </button>
                    </div>
                    {!moneyOk && (
                      <p className="text-[10px] text-amber-700 mt-1 text-right">Financial activation pending</p>
                    )}
                  </td>
                </tr>
              );
            })}
            {cashiers.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  {error ? 'Кассы недоступны' : 'Касс в вашей сети пока нет'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {money && (
        <MoneyDialog
          kind={money.kind}
          cashierId={money.cashierId}
          onClose={() => setMoney(null)}
          onDone={async () => {
            setMoney(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function ManagerCashierDetail({
  cashier,
  op,
  onBack,
}: {
  cashier: BackofficeCashier;
  op?: ManagerOperationalCashier;
  onBack: () => void;
}) {
  const [ledger, setLedger] = useState<CashierLedgerEntry[]>([]);
  const [transfers, setTransfers] = useState<unknown[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchManagerCashierLedger({ cashierId: cashier.id }).catch(() => []),
      fetchManagerTransfers().catch(() => ({ rows: [] as unknown[] })),
    ]).then(([legacy, canon]) => {
      if (cancelled) return;
      setLedger(legacy);
      const rows = Array.isArray(canon.rows) ? canon.rows : [];
      setTransfers(rows.filter((row) => JSON.stringify(row).includes(cashier.id)));
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'История недоступна');
    });
    return () => {
      cancelled = true;
    };
  }, [cashier.id]);

  return (
    <section>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 mb-4">
        <ArrowLeft className="w-4 h-4" />
        К списку касс
      </button>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
        <h2 className="text-2xl font-extrabold text-ink-900">{cashier.fullName}</h2>
        <p className="text-sm text-gray-500">{cashier.login} · {cashier.city} · {cashier.pointName}</p>
        <p className="mt-3 text-sm font-extrabold">
          {op ? formatTmtmCompact(op.availableBalance) : 'недоступен'}
          <span className="text-xs font-semibold text-gray-500">
            {' '}· {op?.status || '—'} · {op?.migrationState || '—'}
          </span>
        </p>
      </div>
      <h3 className="text-lg font-bold mb-2">Каноническая история</h3>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
        {transfers.length === 0 ? (
          <p className="text-sm text-gray-500">Канонических переводов нет</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((row, idx) => {
              const rec = row && typeof row === 'object' ? row as Record<string, unknown> : {};
              return (
                <div key={String(rec.id ?? idx)} className="flex justify-between text-xs border-b border-slate-100 pb-2">
                  <span>{String(rec.transfer_type ?? rec.transferType ?? 'transfer')} · {String(rec.created_at ?? rec.createdAt ?? '')}</span>
                  <span className="font-bold tabular-nums">{formatTmtmCompact(Number(rec.amount))}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <h3 className="text-lg font-bold mb-2">Журнал кассы</h3>
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        {ledger.length === 0 ? (
          <p className="text-sm text-gray-500">Операций нет</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((row) => (
              <div key={row.id} className="flex justify-between text-xs border-b border-slate-100 pb-2">
                <span>{row.type} · {row.createdAt}</span>
                <span className="font-bold tabular-nums">{formatTmtmCompact(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CreateCashierForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [pointName, setPointName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await postManagerCashier({
        login,
        fullName,
        city,
        pointName,
        email,
        temporaryPassword,
      });
      setTemporaryPassword('');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать кассира');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mb-5 bg-white border border-slate-200 rounded-2xl p-4 grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-xs font-semibold text-gray-500 block">
        Логин
        <input value={login} autoComplete="off" onChange={(e) => setLogin(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      <label className="text-xs font-semibold text-gray-500 block">
        Полное имя
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      <label className="text-xs font-semibold text-gray-500 block">
        Город
        <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      <label className="text-xs font-semibold text-gray-500 block">
        Название / адрес точки
        <input value={pointName} onChange={(e) => setPointName(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      <label className="text-xs font-semibold text-gray-500 block">
        Email
        <input type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      <label className="text-xs font-semibold text-gray-500 block">
        Временный пароль
        <input type="password" value={temporaryPassword} autoComplete="new-password" onChange={(e) => setTemporaryPassword(e.target.value)} className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none" />
      </label>
      {error && <p className="md:col-span-2 text-xs font-bold text-red-600">{error}</p>}
      <div className="md:col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200">Отмена</button>
        <button type="submit" disabled={busy} className="text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50">
          {busy ? 'Создание…' : 'Создать кассира'}
        </button>
      </div>
    </form>
  );
}

function MoneyDialog({
  kind,
  cashierId,
  onClose,
  onDone,
}: {
  kind: 'fund' | 'collect';
  cashierId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idempotency, setIdempotency] = useState<{ key: string; fingerprint: string } | null>(null);

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Сумма должна быть больше 0');
      return;
    }
    const fingerprint = `${kind}:${cashierId}:${n}`;
    const slot = retainIdempotencyKey(idempotency, fingerprint);
    setIdempotency(slot);
    setBusy(true);
    setError('');
    try {
      if (kind === 'fund') {
        await postManagerFund({ cashierId, amount: n, idempotencyKey: slot.key });
      } else {
        await postManagerCollect({ cashierId, amount: n, idempotencyKey: slot.key });
      }
      await onDone();
    } catch (err) {
      if (!isAmbiguousStaffError(err)) setIdempotency(null);
      setError(err instanceof Error ? err.message : 'Ошибка перевода');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 px-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <h3 className="font-extrabold text-ink-900 mb-3">{kind === 'fund' ? 'Пополнить кассу' : 'Инкассация'}</h3>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none mb-3"
          placeholder="Сумма TMTM"
        />
        {error && <p className="text-xs font-bold text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="text-sm font-semibold px-3 py-2 rounded-xl border">Отмена</button>
          <button type="button" disabled={busy} onClick={() => void submit()} className="text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50">
            {busy ? 'Отправка…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
