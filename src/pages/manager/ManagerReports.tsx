import { useAuthStore } from '../../stores/authStore';
import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm, formatWhen } from '../portals/PortalChrome';

export function ManagerReports() {
  const session = useAuthStore((s) => s.session);
  const managerId = session?.id ?? '';
  const agents = useHierarchyStore((s) => s.agentsOf(managerId));
  const ops = useHierarchyStore((s) => s.ops.filter((row) => agents.some((agent) => agent.id === row.actorId || agent.id === row.targetId)));
  const shifts = useHierarchyStore((s) => s.shifts.filter((row) => agents.some((agent) => agent.id === row.agentId)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">Отчёты по агентам</h2>
        <p className="text-sm text-slate-500">Смены и выручка только ваших касс</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold">Смены</h3>
        </div>
        {shifts.slice(0, 12).map((row) => {
          const agent = agents.find((item) => item.id === row.agentId);
          return (
            <div key={row.id} className="px-4 py-3 border-b border-slate-100 last:border-0 text-sm">
              <div className="flex justify-between gap-3">
                <p className="font-bold">{agent?.fullName ?? 'Касса'}</p>
                <p className="text-xs text-slate-500">{row.closedAt ? 'Закрыта' : 'Открыта'}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formatWhen(row.openedAt)}
                {row.closedAt ? ` → ${formatWhen(row.closedAt)}` : ''}
              </p>
              <p className="text-xs mt-1 tabular-nums">
                депозиты {formatTmtm(row.deposits)} · выплаты {formatTmtm(row.payouts)} · ставки {formatTmtm(row.bets)}
              </p>
            </div>
          );
        })}
        {shifts.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">Смен пока нет</p>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold">Операции</h3>
        </div>
        {ops.slice(0, 20).map((row) => (
          <div key={row.id} className="px-4 py-2.5 border-b border-slate-100 last:border-0 flex justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold">{row.note}</p>
              <p className="text-[11px] text-slate-400">{formatWhen(row.createdAt)}</p>
            </div>
            <p className="font-black tabular-nums">{formatTmtm(row.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
