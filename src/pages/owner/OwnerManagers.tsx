import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm } from '../portals/PortalChrome';

export function OwnerManagers() {
  const session = useAuthStore((s) => s.session);
  const managers = useHierarchyStore((s) => s.staff.filter((row) => row.role === 'MANAGER'));
  const createManager = useHierarchyStore((s) => s.createManager);
  const adjustManager = useHierarchyStore((s) => s.adjustManager);
  const [form, setForm] = useState({ login: '', password: '', fullName: '', region: '', deposit: '10000' });
  const [amount, setAmount] = useState('1000');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = (fn: () => void) => {
    setError('');
    setNotice('');
    try {
      fn();
      setNotice('Готово');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">Менеджеры</h2>
        <p className="text-sm text-slate-500">Создание, пополнение и списание депозита региона</p>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {notice && <p className="text-sm font-semibold text-brand-700">{notice}</p>}
      <form
        className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => {
            createManager({
              login: form.login,
              password: form.password,
              fullName: form.fullName,
              region: form.region,
              deposit: Number(form.deposit),
            });
            setForm({ login: '', password: '', fullName: '', region: '', deposit: '10000' });
          });
        }}
      >
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Логин" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Имя" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Регион" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        <div className="flex gap-2">
          <input className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Депозит" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
          <button type="submit" className="px-4 rounded-xl bg-ink-900 text-white text-sm font-bold">Создать</button>
        </div>
      </form>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {managers.map((row) => (
          <div key={row.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-ink-900">{row.fullName}</p>
              <p className="text-xs text-slate-500">{row.login} · {row.region}</p>
            </div>
            <p className="text-sm font-black tabular-nums">{formatTmtm(row.balance)}</p>
            <div className="flex gap-2">
              <input className="w-24 bg-slate-100 rounded-lg px-2 py-1.5 text-sm font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold"
                onClick={() => run(() => adjustManager(row.id, Number(amount), session?.id ?? ''))}
              >
                +
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                onClick={() => run(() => adjustManager(row.id, -Math.abs(Number(amount)), session?.id ?? ''))}
              >
                −
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
