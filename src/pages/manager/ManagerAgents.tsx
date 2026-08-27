import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm } from '../portals/PortalChrome';

export function ManagerAgents() {
  const session = useAuthStore((s) => s.session);
  const managerId = session?.id ?? '';
  const me = useHierarchyStore((s) => s.staff.find((row) => row.id === managerId));
  const agents = useHierarchyStore((s) => s.agentsOf(managerId));
  const createAgent = useHierarchyStore((s) => s.createAgent);
  const creditAgent = useHierarchyStore((s) => s.creditAgent);
  const [form, setForm] = useState({ login: '', password: '', fullName: '', city: '', pointName: '', float: '1000' });
  const [amount, setAmount] = useState('500');
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
        <h2 className="text-xl font-extrabold text-ink-900">Кассы менеджера</h2>
        <p className="text-sm text-slate-500">
          Доступно к выдаче: <span className="font-bold text-ink-800">{formatTmtm(me?.balance ?? 0)}</span>
        </p>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {notice && <p className="text-sm font-semibold text-brand-700">{notice}</p>}
      <form
        className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => {
            createAgent({ managerId, ...form, float: Number(form.float) });
            setForm({ login: '', password: '', fullName: '', city: '', pointName: '', float: '1000' });
          });
        }}
      >
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Логин агента" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="ФИО" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input className="bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Точка / касса" value={form.pointName} onChange={(e) => setForm({ ...form, pointName: e.target.value })} />
        <div className="flex gap-2">
          <input className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-semibold" placeholder="Остаток" value={form.float} onChange={(e) => setForm({ ...form, float: e.target.value })} />
          <button type="submit" className="px-4 rounded-xl bg-ink-900 text-white text-sm font-bold">Создать</button>
        </div>
      </form>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {agents.map((row) => (
          <div key={row.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-extrabold">{row.fullName}</p>
              <p className="text-xs text-slate-500">{row.login} · {row.pointName}</p>
            </div>
            <p className="text-sm font-black tabular-nums">{formatTmtm(row.balance)}</p>
            <div className="flex gap-2">
              <input className="w-24 bg-slate-100 rounded-lg px-2 py-1.5 text-sm font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold"
                onClick={() => run(() => creditAgent(managerId, row.id, Number(amount)))}
              >
                Пополнить
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">Нет касс в вашей сети</p>}
      </div>
    </div>
  );
}
