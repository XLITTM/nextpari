import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, RefreshCw, X } from 'lucide-react';
import {
  isAmbiguousStaffError,
  isOperationalAccountActive,
  retainIdempotencyKey,
} from '../shared/staff/financeGate';
import {
  fetchOwnerCashiers,
  fetchOwnerCashierOperationalMap,
  fetchOwnerManagers,
  fetchOwnerTreasury,
  formatBackofficeDateTime,
  formatOperationalAmount,
  formatTmtmCompact,
  postOwnerAddCashierCurrency,
  postOwnerAddManagerCurrency,
  postOwnerCapitalIn,
  postOwnerFund,
  type OwnerManagerRow,
  type OwnerMoneyResult,
  type OwnerTreasuryOverview,
  type OwnerTreasuryTransfer,
} from './services';
import { ownerCapitalFingerprint, ownerFundFingerprint } from './ownerMoney';

export { ownerCapitalFingerprint, ownerFundFingerprint } from './ownerMoney';

const TRANSFER_LABELS: Record<string, string> = {
  CAPITAL_IN: 'Внесение капитала',
  TREASURY_TO_MANAGER: 'Казна → менеджер',
  TREASURY_TO_CASHIER: 'Казна → касса',
  TREASURY_TO_PLAYER: 'Казна → игрок',
};

export type OwnerMoneyDialogState =
  | { type: 'capital' }
  | { type: 'manager'; manager?: OwnerManagerRow }
  | { type: 'cashier'; cashier?: OwnerCashierFundTarget }
  | { type: 'player'; publicId?: string }
  | { type: 'addManagerCurrency' }
  | { type: 'addCashierCurrency' };

export interface OwnerCashierFundTarget {
  cashierId: string;
  fullName: string;
  login: string;
  operationalBalance: number | null;
  operationalStatus: string;
  operationalMigrationState: string;
}

export function formatTmtmOrUnavailable(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return 'недоступен';
  return formatTmtmCompact(value);
}

const DISPLAY_CURRENCIES = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'] as const;

export function ownerTreasuryIsActive(overview: OwnerTreasuryOverview | null | undefined): boolean {
  if (isOperationalAccountActive({
    status: overview?.treasury?.status,
    migrationState: overview?.treasury?.migrationState,
  })) return true;
  return (overview?.accounts ?? []).some((row) => isOperationalAccountActive({
    status: row.status,
    migrationState: row.migrationState,
  }));
}

export function OwnerTreasuryPanel({
  onAfterMoney,
}: {
  onAfterMoney?: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<OwnerTreasuryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<OwnerMoneyDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await fetchOwnerTreasury());
    } catch (err) {
      setOverview(null);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить казну');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const treasuryActive = ownerTreasuryIsActive(overview);
  const cards = (overview?.accounts?.length ? overview.accounts : [
    overview?.treasury,
  ].filter(Boolean)) as NonNullable<OwnerTreasuryOverview['accounts']>;

  return (
    <section className="mb-5">
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Казна</p>
            <h2 className="text-xl font-extrabold text-ink-900 mt-0.5">Казна</h2>
            <p className="text-xs text-gray-500 mt-1">
              {cards.length || 6} валютных счетов · балансы разделены, без общего итога
            </p>
            <p className="text-xs font-semibold text-ink-700 mt-1">Доступно в казне по каждой валюте отдельно</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
        {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {(cards.length ? cards : DISPLAY_CURRENCIES.map((currency) => ({
            currency,
            availableBalance: 0,
            status: '',
            migrationState: '',
            version: null,
          }))).map((row) => (
            <div key={row.currency} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">{row.currency}</p>
              <p className="text-lg font-extrabold tabular-nums text-ink-900 mt-1">
                {loading ? '…' : formatOperationalAmount(row.availableBalance, row.currency)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            disabled={!treasuryActive}
            title={treasuryActive ? 'Внести капитал' : 'Казна не активна'}
            onClick={() => setDialog({ type: 'capital' })}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Landmark className="w-4 h-4" />
            + Внести капитал
          </button>
        </div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Быстрые переводы:</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!treasuryActive}
            title={treasuryActive ? 'Пополнить менеджера' : 'Казна не активна'}
            onClick={() => setDialog({ type: 'manager' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Выдать менеджеру
          </button>
          <button
            type="button"
            disabled={!treasuryActive}
            title={treasuryActive ? 'Пополнить кассу' : 'Казна не активна'}
            onClick={() => setDialog({ type: 'cashier' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Выдать кассиру
          </button>
          <button
            type="button"
            disabled={!treasuryActive}
            title={treasuryActive ? 'Пополнить игрока' : 'Казна не активна'}
            onClick={() => setDialog({ type: 'player' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Пополнить игрока
          </button>
          <button
            type="button"
            onClick={() => setDialog({ type: 'addManagerCurrency' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-slate-100 text-ink-900"
          >
            Добавить валютный счёт менеджеру
          </button>
          <button
            type="button"
            onClick={() => setDialog({ type: 'addCashierCurrency' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-slate-100 text-ink-900"
          >
            Добавить валютный счёт кассиру
          </button>
        </div>
      </article>
      <OwnerTreasuryHistory rows={overview?.recentTransfers ?? []} />
      {dialog && (
        <OwnerMoneyDialog
          state={dialog}
          treasuryActive={treasuryActive}
          onClose={() => setDialog(null)}
          onSuccess={async () => {
            await load();
            if (onAfterMoney) await onAfterMoney();
          }}
        />
      )}
    </section>
  );
}

function OwnerTreasuryHistory({ rows }: { rows: OwnerTreasuryTransfer[] }) {
  const visible = rows.filter((row) => (
    row.transferType === 'CAPITAL_IN'
    || row.transferType === 'TREASURY_TO_MANAGER'
    || row.transferType === 'TREASURY_TO_CASHIER'
    || row.transferType === 'TREASURY_TO_PLAYER'
  ));

  return (
    <article className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-ink-900">История казны</h3>
        <p className="text-xs text-gray-500">Последние канонические операции</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Дата</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2 text-right">Сумма</th>
              <th className="px-4 py-2">Назначение</th>
              <th className="px-4 py-2">Роль</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id || row.transferNo} className="border-t border-slate-100">
                <td className="px-4 py-2 text-xs text-gray-600">
                  {row.createdAt ? formatBackofficeDateTime(row.createdAt) : '—'}
                </td>
                <td className="px-4 py-2">
                  <p className="font-semibold">{TRANSFER_LABELS[row.transferType] || row.transferType}</p>
                  <p className="text-[10px] text-gray-400">{row.transferType}</p>
                </td>
                <td className="px-4 py-2 text-right font-extrabold tabular-nums">
                  {formatOperationalAmount(row.amount, row.currency)}
                </td>
                <td className="px-4 py-2 text-xs font-mono text-gray-600">{row.targetReference || '—'}</td>
                <td className="px-4 py-2 text-xs font-semibold">{row.actorRole || '—'}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Операций казны пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function OwnerMoneyDialog({
  state,
  treasuryActive,
  onClose,
  onSuccess,
}: {
  state: OwnerMoneyDialogState;
  treasuryActive: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<OwnerMoneyResult | null>(null);
  const [idempotency, setIdempotency] = useState<{ key: string; fingerprint: string } | null>(null);
  const [managers, setManagers] = useState<OwnerManagerRow[]>([]);
  const [cashiers, setCashiers] = useState<OwnerCashierFundTarget[]>([]);
  const [managerId, setManagerId] = useState(state.type === 'manager' ? state.manager?.managerId ?? '' : '');
  const [cashierId, setCashierId] = useState(state.type === 'cashier' ? state.cashier?.cashierId ?? '' : '');
  const [publicId, setPublicId] = useState(state.type === 'player' ? state.publicId ?? '' : '');
  const [liveTreasuryActive, setLiveTreasuryActive] = useState(treasuryActive);
  const [currency, setCurrency] = useState('TMT');

  useEffect(() => {
    let cancelled = false;
    void fetchOwnerTreasury()
      .then((overview) => {
        if (!cancelled) setLiveTreasuryActive(ownerTreasuryIsActive(overview));
      })
      .catch(() => {
        if (!cancelled) setLiveTreasuryActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if ((state.type !== 'manager' && state.type !== 'addManagerCurrency') || (state.type === 'manager' && state.manager)) return undefined;
    let cancelled = false;
    void fetchOwnerManagers()
      .then((rows) => {
        if (!cancelled) setManagers(rows);
      })
      .catch(() => {
        if (!cancelled) setManagers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if ((state.type !== 'cashier' && state.type !== 'addCashierCurrency') || (state.type === 'cashier' && state.cashier)) return undefined;
    let cancelled = false;
    void fetchOwnerCashierOperationalMap()
      .then((map) => {
        if (cancelled) return;
        setCashiers(Object.values(map));
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const rows = await fetchOwnerCashiers();
          if (!cancelled) {
            setCashiers(rows.map((row) => ({
              cashierId: row.id,
              fullName: row.fullName,
              login: row.login,
              operationalBalance: row.operationalBalance,
              operationalStatus: row.operationalStatus ?? '',
              operationalMigrationState: row.operationalMigrationState ?? '',
            })));
          }
        } catch {
          if (!cancelled) setCashiers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const selectedManager = useMemo(() => {
    if (state.type !== 'manager' && state.type !== 'addManagerCurrency') return null;
    if (state.type === 'manager' && state.manager) return state.manager;
    return managers.find((row) => row.managerId === managerId) ?? null;
  }, [state, managers, managerId]);

  const selectedCashier = useMemo(() => {
    if (state.type !== 'cashier' && state.type !== 'addCashierCurrency') return null;
    if (state.type === 'cashier' && state.cashier) return state.cashier;
    return cashiers.find((row) => row.cashierId === cashierId) ?? null;
  }, [state, cashiers, cashierId]);

  const targetActive = useMemo(() => {
    if (state.type === 'capital' || state.type === 'player' || state.type === 'addManagerCurrency' || state.type === 'addCashierCurrency') return true;
    if (state.type === 'manager') {
      return isOperationalAccountActive({
        status: selectedManager?.operationalStatus,
        migrationState: selectedManager?.operationalMigrationState,
      });
    }
    return isOperationalAccountActive({
      status: selectedCashier?.operationalStatus,
      migrationState: selectedCashier?.operationalMigrationState,
    });
  }, [state.type, selectedManager, selectedCashier]);

  const moneyAction = state.type === 'capital' || state.type === 'manager' || state.type === 'cashier' || state.type === 'player';
  const enabled = (moneyAction ? liveTreasuryActive && targetActive : true) && !busy;
  const title = state.type === 'capital'
    ? 'Внести капитал'
    : state.type === 'manager'
      ? 'Выдать менеджеру'
      : state.type === 'cashier'
        ? 'Выдать кассиру'
        : state.type === 'addManagerCurrency'
          ? 'Добавить валютный счёт менеджеру'
          : state.type === 'addCashierCurrency'
            ? 'Добавить валютный счёт кассиру'
            : 'Пополнить баланс игрока';

  const submit = async () => {
    if (state.type === 'addManagerCurrency' || state.type === 'addCashierCurrency') {
      const targetId = state.type === 'addManagerCurrency'
        ? selectedManager?.managerId ?? managerId
        : selectedCashier?.cashierId ?? cashierId;
      if (!targetId) {
        setError('Выберите получателя');
        return;
      }
      setBusy(true);
      setError('');
      try {
        if (state.type === 'addManagerCurrency') {
          await postOwnerAddManagerCurrency({ managerId: targetId, currency });
        } else {
          await postOwnerAddCashierCurrency({ cashierId: targetId, currency });
        }
        await onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка создания счёта');
      } finally {
        setBusy(false);
      }
      return;
    }

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Сумма должна быть больше 0');
      return;
    }
    const trimmedNote = note.trim();
    if (state.type === 'capital' && !trimmedNote) {
      setError('Комментарий / основание обязательны');
      return;
    }
    if (state.type === 'capital') {
      const ok = window.confirm(`Внести ${n} ${currency} в казну владельца?`);
      if (!ok) return;
      const fingerprint = ownerCapitalFingerprint(n, trimmedNote) + ':' + currency;
      const slot = retainIdempotencyKey(idempotency, fingerprint);
      setIdempotency(slot);
      setBusy(true);
      setError('');
      try {
        const result = await postOwnerCapitalIn({
          amount: currency === 'TMT' ? n : amount,
          idempotencyKey: slot.key,
          note: trimmedNote,
          currency,
        });
        setSuccess(result);
        setIdempotency(null);
        await onSuccess();
      } catch (err) {
        if (!isAmbiguousStaffError(err)) setIdempotency(null);
        setError(err instanceof Error ? err.message : 'Ошибка внесения капитала');
      } finally {
        setBusy(false);
      }
      return;
    }

    const targetId = state.type === 'manager'
      ? selectedManager?.managerId ?? ''
      : state.type === 'cashier'
        ? selectedCashier?.cashierId ?? ''
        : publicId.trim();
    if (!targetId) {
      setError(state.type === 'player' ? 'Укажите public_id игрока' : 'Выберите получателя');
      return;
    }
    if (state.type === 'player' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      setError('Укажите public_id игрока, не wallet UUID');
      return;
    }
    if (!targetActive) {
      setError('OPERATIONAL_ACCOUNT_NOT_ACTIVE');
      return;
    }

    if (state.type !== 'manager' && state.type !== 'cashier' && state.type !== 'player') {
      return;
    }
    const fingerprint = ownerFundFingerprint(state.type, targetId, n, trimmedNote) + ':' + currency;
    const slot = retainIdempotencyKey(idempotency, fingerprint);
    setIdempotency(slot);
    setBusy(true);
    setError('');
    try {
      const result = await postOwnerFund({
        targetType: state.type,
        targetId,
        amount: currency === 'TMT' || state.type === 'player' ? n : amount,
        idempotencyKey: slot.key,
        note: trimmedNote || null,
        currency: state.type === 'player' ? 'TMT' : currency,
      });
      setSuccess(result);
      setIdempotency(null);
      await onSuccess();
    } catch (err) {
      if (!isAmbiguousStaffError(err)) setIdempotency(null);
      setError(err instanceof Error ? err.message : 'Ошибка перевода');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрыть" />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-extrabold text-ink-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!liveTreasuryActive && moneyAction && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            Казна не активна — денежные операции отключены
          </p>
        )}
        {(state.type === 'manager' || state.type === 'addManagerCurrency') && !(state.type === 'manager' && state.manager) && (
          <label className="block text-xs font-semibold text-gray-500 mb-3">
            Менеджер
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
            >
              <option value="">Выберите менеджера</option>
              {managers.map((row) => (
                <option key={row.managerId} value={row.managerId}>
                  {row.fullName || row.login} · {row.login}
                </option>
              ))}
            </select>
          </label>
        )}
        {state.type === 'manager' && selectedManager && (
          <div className="text-xs text-gray-600 mb-3 space-y-0.5">
            <p><span className="font-semibold">Имя:</span> {selectedManager.fullName || '—'}</p>
            <p><span className="font-semibold">Логин:</span> {selectedManager.login || '—'}</p>
            <p><span className="font-semibold">Сеть:</span> {selectedManager.networkName || '—'}</p>
            <p>
              <span className="font-semibold">Остаток:</span>{' '}
              {formatTmtmOrUnavailable(selectedManager.operationalBalance)}
            </p>
            {!targetActive && (
              <p className="font-bold text-red-600">Операционный счёт менеджера не активен</p>
            )}
          </div>
        )}
        {(state.type === 'cashier' || state.type === 'addCashierCurrency') && !(state.type === 'cashier' && state.cashier) && (
          <label className="block text-xs font-semibold text-gray-500 mb-3">
            Касса
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
            >
              <option value="">Выберите кассу</option>
              {cashiers.map((row) => (
                <option key={row.cashierId} value={row.cashierId}>
                  {row.fullName || row.login} · {row.login}
                </option>
              ))}
            </select>
          </label>
        )}
        {state.type === 'cashier' && selectedCashier && (
          <div className="text-xs text-gray-600 mb-3 space-y-0.5">
            <p><span className="font-semibold">Касса:</span> {selectedCashier.fullName || '—'}</p>
            <p><span className="font-semibold">Логин:</span> {selectedCashier.login || '—'}</p>
            <p>
              <span className="font-semibold">Остаток:</span>{' '}
              {formatTmtmOrUnavailable(selectedCashier.operationalBalance)}
            </p>
            {!targetActive && (
              <p className="font-bold text-red-600">Операционный счёт кассы не активен</p>
            )}
          </div>
        )}
        {state.type === 'player' && (
          <label className="block text-xs font-semibold text-gray-500 mb-3">
            Public ID игрока
            <input
              value={publicId}
              onChange={(e) => setPublicId(e.target.value)}
              placeholder="например 110790"
              className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
            />
          </label>
        )}
        {state.type !== 'player' && (
          <label className="block text-xs font-semibold text-gray-500 mb-3">
            Валюта
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
            >
              {DISPLAY_CURRENCIES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
        )}
        {state.type === 'cashier' && moneyAction && (
          <p className="text-xs text-gray-500 mb-3">
            Источник: Казна {currency} → Счёт {currency}
          </p>
        )}
        {state.type === 'manager' && moneyAction && (
          <p className="text-xs text-gray-500 mb-3">
            Источник: Казна {currency} → Счёт менеджера {currency}
          </p>
        )}
        {moneyAction && (
        <label className="block text-xs font-semibold text-gray-500 mb-3">
          Сумма {currency}
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
          />
        </label>
        )}
        {moneyAction && (
        <label className="block text-xs font-semibold text-gray-500 mb-3">
          {state.type === 'capital' ? 'Комментарий / основание' : 'Комментарий (необязательно)'}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none resize-none"
          />
        </label>
        )}
        {error && <p className="text-xs font-bold text-red-600 mb-3">{error}</p>}
        {success && (
          <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3 space-y-0.5">
            <p>Перевод {success.transferId || 'выполнен'}</p>
            {state.type === 'capital' && (
              <p>Новый баланс казны: {formatTmtmOrUnavailable(success.toBalanceAfter ?? success.fromBalanceAfter)}</p>
            )}
            {state.type === 'manager' && (
              <p>Остаток менеджера: {formatTmtmOrUnavailable(success.toBalanceAfter)}</p>
            )}
            {state.type === 'cashier' && (
              <>
                <p>Остаток кассы: {formatTmtmOrUnavailable(success.toBalanceAfter)}</p>
                <p>Остаток казны: {formatTmtmOrUnavailable(success.fromBalanceAfter)}</p>
              </>
            )}
            {state.type === 'player' && (
              <>
                <p>Игрок: {success.playerPublicId || publicId}</p>
                <p>Баланс игрока: {formatTmtmOrUnavailable(success.playerBalanceAfter ?? success.toBalanceAfter)}</p>
                <p>Остаток казны: {formatTmtmOrUnavailable(success.fromBalanceAfter)}</p>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200">
            {success ? 'Закрыть' : 'Отмена'}
          </button>
          {!success && (
            <button
              type="button"
              disabled={!enabled}
              onClick={() => void submit()}
              className="text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white disabled:opacity-50"
            >
              {busy
                ? 'Отправка…'
                : state.type === 'capital'
                  ? 'Внести капитал'
                  : state.type === 'addManagerCurrency' || state.type === 'addCashierCurrency'
                    ? 'Создать счёт'
                    : state.type === 'cashier'
                      ? 'Выдать кассиру'
                      : 'Пополнить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
