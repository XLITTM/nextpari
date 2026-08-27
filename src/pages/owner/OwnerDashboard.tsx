import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm, StatCard } from '../portals/PortalChrome';

export function OwnerDashboard() {
  const staff = useHierarchyStore((s) => s.staff);
  const sportRevenue = useHierarchyStore((s) => s.sportRevenue);
  const casinoRevenue = useHierarchyStore((s) => s.casinoRevenue);
  const managers = staff.filter((row) => row.role === 'MANAGER');
  const agents = staff.filter((row) => row.role === 'AGENT');
  const owner = staff.find((row) => row.role === 'OWNER');
  const networkFloat = agents.reduce((sum, row) => sum + row.balance, 0);
  const managerFloat = managers.reduce((sum, row) => sum + row.balance, 0);
  const totalRevenue = sportRevenue + casinoRevenue;
  const regions = managers.map((row) => ({
    name: row.region || 'Регион',
    manager: row.fullName,
    balance: row.balance,
    tills: agents.filter((agent) => agent.managerId === row.id).reduce((sum, agent) => sum + agent.balance, 0),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">Сеть NextPari</h2>
        <p className="text-sm text-slate-500">Выручка, регионы и остатки касс</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Казна владельца" value={formatTmtm(owner?.balance ?? 0)} />
        <StatCard label="Выручка сети" value={formatTmtm(totalRevenue)} hint="Спорт + казино" />
        <StatCard label="Балансы менеджеров" value={formatTmtm(managerFloat)} />
        <StatCard label="Остаток во всех кассах" value={formatTmtm(networkFloat)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <article className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">Прибыль по спорту</p>
          <p className="mt-2 text-3xl font-black text-brand-700 tabular-nums">{formatTmtm(sportRevenue)}</p>
        </article>
        <article className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">Прибыль по казино</p>
          <p className="mt-2 text-3xl font-black text-violet-700 tabular-nums">{formatTmtm(casinoRevenue)}</p>
        </article>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold">Балансы регионов</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {regions.map((row) => (
            <div key={row.name + row.manager} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink-900">{row.name}</p>
                <p className="text-xs text-slate-500">{row.manager}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold tabular-nums">{formatTmtm(row.balance)}</p>
                <p className="text-[11px] text-slate-400">кассы {formatTmtm(row.tills)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
