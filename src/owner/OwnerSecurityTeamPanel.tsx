import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  fetchOwnerSecurityStaff,
  fetchOwnerSecurityTeamActivity,
  formatBackofficeDateTime,
  postOwnerSecurityStaff,
  postOwnerSecurityStaffResetPassword,
  postOwnerSecurityStaffStatus,
  type OwnerSecurityStaffRow,
  type OwnerSecurityTeamActivity,
} from './services';

export function OwnerSecurityTeamPanel() {
  const [rows, setRows] = useState<OwnerSecurityStaffRow[]>([]);
  const [activity, setActivity] = useState<OwnerSecurityTeamActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextRows, nextActivity] = await Promise.all([
        fetchOwnerSecurityStaff(),
        fetchOwnerSecurityTeamActivity(),
      ]);
      setRows(nextRows);
      setActivity(nextActivity);
    } catch (err) {
      setRows([]);
      setActivity([]);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить службу безопасности');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Служба безопасности</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Owner создаёт сотрудников Security. Пароль не хранится и не показывается.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white">
            <Plus className="w-4 h-4" />
            Создать сотрудника
          </button>
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {creating && (
        <CreateSecurityStaffForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
      <div className="space-y-4">
        {rows.map((row) => (
          <SecurityStaffCard key={row.authUserId || row.login} row={row} onChanged={load} />
        ))}
        {rows.length === 0 && !loading && (
          <p className="text-sm text-gray-500 bg-white rounded-2xl border border-slate-200 px-4 py-6">Сотрудников Security нет</p>
        )}
      </div>
      <div className="mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-extrabold">Лента действий</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Время</th>
              <th className="px-4 py-3">Сотрудник</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Игрок / цель</th>
              <th className="px-4 py-3">Причина</th>
              <th className="px-4 py-3">Результат</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((row, index) => (
              <tr key={`${row.at}-${index}`} className="border-t border-slate-100">
                <td className="px-4 py-3">{row.at ? formatBackofficeDateTime(row.at) : '—'}</td>
                <td className="px-4 py-3">{row.employeeName || row.employeeLogin || '—'}</td>
                <td className="px-4 py-3">{row.action}</td>
                <td className="px-4 py-3">{row.playerPublicId || row.target || '—'}</td>
                <td className="px-4 py-3">{row.reason || '—'}</td>
                <td className="px-4 py-3">{row.result || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function metricLine(label: string, metrics: OwnerSecurityStaffRow['metrics']['h24']) {
  return `${label}: просмотр ${metrics.reviewed} · закрыто ${metrics.resolved} · отклонено ${metrics.dismissed} · ограничено ${metrics.restrictionsApplied} · снято ${metrics.restrictionsRemoved}`;
}

function SecurityStaffCard({
  row,
  onChanged,
}: {
  row: OwnerSecurityStaffRow;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: 'active' | 'disabled') => {
    setBusy(true);
    setError('');
    try {
      await postOwnerSecurityStaffStatus({ authUserId: row.authUserId, status });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!password.trim()) {
      setError('Укажите временный пароль');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postOwnerSecurityStaffResetPassword({
        authUserId: row.authUserId,
        temporaryPassword: password,
      });
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-ink-900">{row.displayName || '—'}</p>
          <p className="text-xs text-gray-500">{row.login} · {row.status}</p>
          <p className="text-xs text-gray-400 mt-1">
            Создан {row.createdAt ? formatBackofficeDateTime(row.createdAt) : '—'}
            {' · '}активность {row.lastActivityAt ? formatBackofficeDateTime(row.lastActivityAt) : 'нет'}
          </p>
        </div>
        <div className="flex gap-2">
          {row.status === 'active' ? (
            <button type="button" disabled={busy} onClick={() => void setStatus('disabled')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100">Отключить</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void setStatus('active')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-800">Включить</button>
          )}
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-600 space-y-1">
        <p>{metricLine('24 часа', row.metrics.h24)}</p>
        <p>{metricLine('7 дней', row.metrics.d7)}</p>
        <p>{metricLine('30 дней', row.metrics.d30)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Новый временный пароль"
          className="text-sm border border-slate-200 rounded-xl px-3 py-2"
        />
        <button type="button" disabled={busy} onClick={() => void resetPassword()} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-ink-900 text-white">
          Сбросить пароль
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function CreateSecurityStaffForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await postOwnerSecurityStaff({ login, displayName, temporaryPassword });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать сотрудника');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
      <h3 className="font-extrabold mb-3">Новый сотрудник Security</h3>
      <div className="grid md:grid-cols-3 gap-2">
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" className="text-sm border border-slate-200 rounded-xl px-3 py-2" />
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Отображаемое имя" className="text-sm border border-slate-200 rounded-xl px-3 py-2" />
        <input type="password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder="Временный пароль" className="text-sm border border-slate-200 rounded-xl px-3 py-2" />
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" disabled={busy} onClick={() => void submit()} className="font-bold">Создать</button>
      </div>
    </div>
  );
}
