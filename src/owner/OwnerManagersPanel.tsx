import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { isOperationalAccountActive } from '../shared/staff/financeGate';
import { OwnerMoneyDialog, ownerTreasuryIsActive, type OwnerMoneyDialogState } from './OwnerMoneyControls';
import {
  fetchOwnerCashierLedger,
  fetchOwnerManagerDetail,
  fetchOwnerManagers,
  fetchOwnerTreasury,
  formatTmtmCompact,
  postOwnerManager,
  type CashierLedgerEntry,
  type OwnerManagerCashierRow,
  type OwnerManagerRow,
} from './services';

export function OwnerManagersPanel() {
  const [rows, setRows] = useState<OwnerManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fund, setFund] = useState<OwnerMoneyDialogState | null>(null);
  const [treasuryActive, setTreasuryActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, treasury] = await Promise.all([
        fetchOwnerManagers(),
        fetchOwnerTreasury().catch(() => null),
      ]);
      setRows(list);
      setTreasuryActive(ownerTreasuryIsActive(treasury));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить менеджеров');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (openId) {
    return (
      <OwnerManagerDetail
        managerId={openId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Менеджеры</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Загрузка…' : `${rows.length} управляющих · канонические данные`}
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
            Создать менеджера
          </button>
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {creating && (
        <CreateManagerForm
          onCancel={() => setCreating(false)}
          onCreated={async (created) => {
            setCreating(false);
            await load();
            setOpenId(created.managerId);
          }}
        />
      )}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Менеджер</th>
              <th className="px-4 py-3">Сеть</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3 text-right">Операционный баланс</th>
              <th className="px-4 py-3">Кассы</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.managerId || row.login} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-bold text-ink-900">{row.fullName || '—'}</p>
                  <p className="text-xs text-gray-500">{row.login} · {row.status || '—'}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{row.managerId || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.networkName || '—'}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{row.networkId || '—'}</p>
                </td>
                <td className="px-4 py-3 text-xs font-semibold">
                  {row.authBound ? 'привязан' : 'нет привязки'}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-extrabold tabular-nums">
                    {row.operationalBalance == null ? 'недоступен' : formatTmtmCompact(row.operationalBalance)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {row.operationalStatus || '—'} · {row.operationalMigrationState || '—'}
                  </p>
                </td>
                <td className="px-4 py-3 font-semibold">{row.cashierCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={
                        !treasuryActive
                        || !isOperationalAccountActive({
                          status: row.operationalStatus,
                          migrationState: row.operationalMigrationState,
                        })
                      }
                      title={
                        treasuryActive && isOperationalAccountActive({
                          status: row.operationalStatus,
                          migrationState: row.operationalMigrationState,
                        })
                          ? 'Пополнить'
                          : 'Казна или менеджер не активны'
                      }
                      onClick={() => setFund({ type: 'manager', manager: row })}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-brand-600 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      Пополнить
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.managerId)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-ink-900 text-white"
                    >
                      Открыть
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  {error ? 'Менеджеры недоступны' : 'Менеджеров пока нет'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {fund && (
        <OwnerMoneyDialog
          state={fund}
          treasuryActive={treasuryActive}
          onClose={() => setFund(null)}
          onSuccess={async () => {
            await load();
          }}
        />
      )}
    </section>
  );
}

function CreateManagerForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (row: OwnerManagerRow) => Promise<void>;
}) {
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const created = await postOwnerManager({
        login,
        fullName,
        networkName,
        email,
        temporaryPassword,
      });
      setTemporaryPassword('');
      await onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать менеджера');
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
      <Field label="Логин" value={login} onChange={setLogin} autoComplete="off" />
      <Field label="Полное имя" value={fullName} onChange={setFullName} />
      <Field label="Название сети" value={networkName} onChange={setNetworkName} />
      <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="off" />
      <Field
        label="Временный пароль"
        value={temporaryPassword}
        onChange={setTemporaryPassword}
        type="password"
        autoComplete="new-password"
      />
      {error && <p className="md:col-span-2 text-xs font-bold text-red-600">{error}</p>}
      <div className="md:col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200">
          Отмена
        </button>
        <button type="submit" disabled={busy} className="text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50">
          {busy ? 'Создание…' : 'Создать'}
        </button>
      </div>
    </form>
  );
}

function OwnerManagerDetail({
  managerId,
  onBack,
}: {
  managerId: string;
  onBack: () => void;
}) {
  const [manager, setManager] = useState<OwnerManagerRow | null>(null);
  const [cashiers, setCashiers] = useState<OwnerManagerCashierRow[]>([]);
  const [openCashier, setOpenCashier] = useState<OwnerManagerCashierRow | null>(null);
  const [ledger, setLedger] = useState<CashierLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [fund, setFund] = useState<OwnerMoneyDialogState | null>(null);
  const [treasuryActive, setTreasuryActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, treasury] = await Promise.all([
        fetchOwnerManagerDetail(managerId),
        fetchOwnerTreasury().catch(() => null),
      ]);
      setManager(detail.manager);
      setCashiers(detail.cashiers);
      setTreasuryActive(ownerTreasuryIsActive(treasury));
    } catch (err) {
      setManager(null);
      setCashiers([]);
      setError(err instanceof Error ? err.message : 'Не удалось открыть менеджера');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openCashier) {
      setLedger([]);
      return undefined;
    }
    let cancelled = false;
    void fetchOwnerCashierLedger({ cashierId: openCashier.cashierId })
      .then((rows) => {
        if (!cancelled) setLedger(rows);
      })
      .catch(() => {
        if (!cancelled) setLedger([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openCashier]);

  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        К списку менеджеров
      </button>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Загрузка…</p>}
      {manager && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
          <h2 className="text-2xl font-extrabold text-ink-900">{manager.fullName}</h2>
          <p className="text-sm text-gray-500">{manager.login} · {manager.status}</p>
          <p className="text-xs text-gray-400 font-mono mt-1">{manager.managerId}</p>
          <p className="mt-3 text-sm">
            Сеть: <span className="font-semibold">{manager.networkName}</span>
            <span className="block text-[10px] text-gray-400 font-mono">{manager.networkId}</span>
          </p>
          <p className="mt-2 text-sm">
            Операционный баланс:{' '}
            <span className="font-extrabold">
              {manager.operationalBalance == null ? 'недоступен' : formatTmtmCompact(manager.operationalBalance)}
            </span>
            <span className="text-xs text-gray-500">
              {' '}· {manager.operationalStatus || '—'} · {manager.operationalMigrationState || '—'}
            </span>
          </p>
          <p className="mt-1 text-xs font-semibold">
            Auth: {manager.authBound ? 'привязан' : 'нет привязки'}
          </p>
          <button
            type="button"
            disabled={
              !treasuryActive
              || !isOperationalAccountActive({
                status: manager.operationalStatus,
                migrationState: manager.operationalMigrationState,
              })
            }
            title={
              treasuryActive && isOperationalAccountActive({
                status: manager.operationalStatus,
                migrationState: manager.operationalMigrationState,
              })
                ? 'Пополнить'
                : 'Казна или менеджер не активны'
            }
            onClick={() => setFund({ type: 'manager', manager })}
            className="mt-3 text-xs font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Пополнить
          </button>
        </div>
      )}
      <h3 className="text-lg font-bold mb-3">Кассы сети</h3>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Кассир</th>
              <th className="px-4 py-3">Точка</th>
              <th className="px-4 py-3 text-right">Остаток</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cashiers.map((row) => (
              <tr
                key={row.cashierId}
                className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                onClick={() => setOpenCashier(row)}
              >
                <td className="px-4 py-3">
                  <p className="font-bold">{row.fullName}</p>
                  <p className="text-xs text-gray-500">{row.login}</p>
                </td>
                <td className="px-4 py-3">{row.city} · {row.pointName}</td>
                <td className="px-4 py-3 text-right font-extrabold tabular-nums">
                  {row.operationalBalance == null ? 'недоступен' : formatTmtmCompact(row.operationalBalance)}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.operationalStatus || '—'} · {row.operationalMigrationState || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={
                      !treasuryActive
                      || !isOperationalAccountActive({
                        status: row.operationalStatus,
                        migrationState: row.operationalMigrationState,
                      })
                    }
                    title={
                      treasuryActive && isOperationalAccountActive({
                        status: row.operationalStatus,
                        migrationState: row.operationalMigrationState,
                      })
                        ? 'Пополнить напрямую из казны'
                        : 'Казна или касса не активны'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setFund({
                        type: 'cashier',
                        cashier: {
                          cashierId: row.cashierId,
                          fullName: row.fullName,
                          login: row.login,
                          operationalBalance: row.operationalBalance,
                          operationalStatus: row.operationalStatus,
                          operationalMigrationState: row.operationalMigrationState,
                        },
                      });
                    }}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-ink-900 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    Пополнить напрямую
                  </button>
                </td>
              </tr>
            ))}
            {cashiers.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Касс в сети пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {openCashier && (
        <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-extrabold text-ink-900">{openCashier.fullName}</h3>
          <p className="text-xs text-gray-500">{openCashier.login} · {openCashier.city} · {openCashier.pointName}</p>
          <p className="text-sm mt-2 font-extrabold">
            {openCashier.operationalBalance == null ? 'недоступен' : formatTmtmCompact(openCashier.operationalBalance)}
            <span className="text-xs font-semibold text-gray-500">
              {' '}· {openCashier.operationalStatus} · {openCashier.operationalMigrationState}
            </span>
          </p>
          <button
            type="button"
            disabled={
              !treasuryActive
              || !isOperationalAccountActive({
                status: openCashier.operationalStatus,
                migrationState: openCashier.operationalMigrationState,
              })
            }
            title={
              treasuryActive && isOperationalAccountActive({
                status: openCashier.operationalStatus,
                migrationState: openCashier.operationalMigrationState,
              })
                ? 'Пополнить напрямую из казны'
                : 'Казна или касса не активны'
            }
            onClick={() => setFund({
              type: 'cashier',
              cashier: {
                cashierId: openCashier.cashierId,
                fullName: openCashier.fullName,
                login: openCashier.login,
                operationalBalance: openCashier.operationalBalance,
                operationalStatus: openCashier.operationalStatus,
                operationalMigrationState: openCashier.operationalMigrationState,
              },
            })}
            className="mt-3 text-xs font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Пополнить напрямую
          </button>
          <h4 className="mt-4 text-sm font-bold">История кассы</h4>
          {ledger.length === 0 ? (
            <p className="text-xs text-gray-500 mt-2">Операций нет</p>
          ) : (
            <div className="mt-2 space-y-2">
              {ledger.map((row) => (
                <div key={row.id} className="flex justify-between text-xs border-b border-slate-100 pb-2">
                  <span>{row.type} · {row.createdAt}</span>
                  <span className="font-bold tabular-nums">{formatTmtmCompact(row.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {fund && (
        <OwnerMoneyDialog
          state={fund}
          treasuryActive={treasuryActive}
          onClose={() => setFund(null)}
          onSuccess={async () => {
            await load();
          }}
        />
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="text-xs font-semibold text-gray-500 block">
      {label}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
      />
    </label>
  );
}
