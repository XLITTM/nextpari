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
  formatTmtmCompact,
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
  | { type: 'player'; publicId?: string };

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

export function ownerTreasuryIsActive(overview: OwnerTreasuryOverview | null | undefined): boolean {
  return isOperationalAccountActive({
    status: overview?.treasury?.status,
    migrationState: overview?.treasury?.migrationState,
  });
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
  const available = overview?.treasury?.availableBalance;

  return (
    <section className="mb-5">
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Казна владельца</p>
            <h2 className="text-xl font-extrabold text-ink-900 mt-0.5">Казна владельца</h2>
            <p className="text-sm text-gray-500 mt-1">
              Доступно в казне:{' '}
              <span className="font-extrabold text-ink-900 tabular-nums">
                {loading ? '…' : formatTmtmOrUnavailable(available)}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              status: {overview?.treasury?.status || '—'} · migrationState:{' '}
              {overview?.treasury?.migrationState || '—'}
            </p>
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
            + Пополнить менеджера
          </button>
          <button
            type="button"
            disabled={!treasuryActive}
            title={treasuryActive ? 'Пополнить кассу' : 'Казна не активна'}
            onClick={() => setDialog({ type: 'cashier' })}
            className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Пополнить кассу
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
                  {formatTmtmCompact(row.amount)}
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
    if (state.type !== 'manager' || state.manager) return undefined;
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
    if (state.type !== 'cashier' || state.cashier) return undefined;
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
              operationalBalance: null,
              operationalStatus: row.isActive ? 'active' : 'blocked',
              operationalMigrationState: '',
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
    if (state.type !== 'manager') return null;
    if (state.manager) return state.manager;
    return managers.find((row) => row.managerId === managerId) ?? null;
  }, [state, managers, managerId]);

  const selectedCashier = useMemo(() => {
    if (state.type !== 'cashier') return null;
    if (state.cashier) return state.cashier;
    return cashiers.find((row) => row.cashierId === cashierId) ?? null;
  }, [state, cashiers, cashierId]);

  const targetActive = useMemo(() => {
    if (state.type === 'capital' || state.type === 'player') return true;
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

  const enabled = liveTreasuryActive && targetActive && !busy;
  const title = state.type === 'capital'
    ? 'Внести капитал'
    : state.type === 'manager'
      ? 'Пополнить менеджера'
      : state.type === 'cashier'
        ? 'Пополнить кассу напрямую'
        : 'Пополнить баланс игрока';

  const submit = async () => {
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
      const ok = window.confirm(`Внести ${n} TMTM в казну владельца?`);
      if (!ok) return;
      const fingerprint = ownerCapitalFingerprint(n, trimmedNote);
      const slot = retainIdempotencyKey(idempotency, fingerprint);
      setIdempotency(slot);
      setBusy(true);
      setError('');
      try {
        const result = await postOwnerCapitalIn({
          amount: n,
          idempotencyKey: slot.key,
          note: trimmedNote,
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

    const fingerprint = ownerFundFingerprint(state.type, targetId, n, trimmedNote);
    const slot = retainIdempotencyKey(idempotency, fingerprint);
    setIdempotency(slot);
    setBusy(true);
    setError('');
    try {
      const result = await postOwnerFund({
        targetType: state.type,
        targetId,
        amount: n,
        idempotencyKey: slot.key,
        note: trimmedNote || null,
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
        {!liveTreasuryActive && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            Казна не активна — денежные операции отключены
          </p>
        )}
        {state.type === 'manager' && !state.manager && (
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
        {state.type === 'cashier' && !state.cashier && (
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
        <label className="block text-xs font-semibold text-gray-500 mb-3">
          Сумма TMTM
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-500 mb-3">
          {state.type === 'capital' ? 'Комментарий / основание' : 'Комментарий (необязательно)'}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-ink-900 outline-none resize-none"
          />
        </label>
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
                  : state.type === 'cashier'
                    ? 'Пополнить напрямую'
                    : 'Пополнить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
