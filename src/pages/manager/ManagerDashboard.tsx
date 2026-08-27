import { useAuthStore } from '../../stores/authStore';
import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm, StatCard } from '../portals/PortalChrome';

export function ManagerDashboard() {
  const session = useAuthStore((s) => s.session);
  const staff = useHierarchyStore((s) => s.staff);
  const ops = useHierarchyStore((s) => s.ops);
  const me = (staff || []).find((row) => row?.id === session?.id);
  const managerAgents = (staff || []).filter((row) => row?.role === 'AGENT' && row?.managerId === session?.id);
  const mineIds = new Set(managerAgents.map((row) => row.id));
  const turnover = (ops || [])
    .filter((row) => row?.type === 'cashier_bet' && mineIds.has(row.targetId))
    .reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
  const commission = managerAgents.reduce((sum, row) => sum + (Number(row?.commissionEarned) || 0), 0);
  const tillFloat = managerAgents.reduce((sum, row) => sum + (Number(row?.balance) || 0), 0);

  if (!session) {
    return (
      <div className="py-16 text-center text-sm font-semibold text-slate-500">
        Загрузка кабинета…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">Кабинет менеджера</h2>
        <p className="text-sm text-slate-500">{me?.region || 'Регион'} · только ваши кассы</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Доступный баланс" value={formatTmtm(me?.balance ?? 0)} />
        <StatCard label="Дневной оборот касс" value={formatTmtm(turnover)} />
        <StatCard label="Комиссия" value={formatTmtm(commission)} hint={`${me?.commissionRate ?? 8}%`} />
        <StatCard label="Остаток в кассах" value={formatTmtm(tillFloat)} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold">Кассы региона</h3>
        </div>
        {managerAgents.map((row) => (
          <div key={row.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{row?.fullName || row?.login || 'Кассир'}</p>
              <p className="text-xs text-slate-500">{row?.pointName || '—'}</p>
            </div>
            <p className="text-sm font-black tabular-nums">{formatTmtm(row?.balance ?? 0)}</p>
          </div>
        ))}
        {managerAgents.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">Касс пока нет</p>}
      </div>
    </div>
  );
}
