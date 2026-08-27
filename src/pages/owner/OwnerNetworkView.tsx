import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm } from '../portals/PortalChrome';

export function OwnerNetworkView() {
  const managers = useHierarchyStore((s) => s.staff.filter((row) => row.role === 'MANAGER'));
  const agents = useHierarchyStore((s) => s.staff.filter((row) => row.role === 'AGENT'));
  const players = useHierarchyStore((s) => s.players);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">Дерево сети</h2>
        <p className="text-sm text-slate-500">Менеджер → кассы → игроки</p>
      </div>
      <div className="space-y-4">
        {managers.map((manager) => {
          const tills = agents.filter((row) => row.managerId === manager.id);
          return (
            <section key={manager.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-ink-900">{manager.fullName}</p>
                  <p className="text-xs text-slate-500">{manager.region} · {manager.login}</p>
                </div>
                <p className="text-sm font-black tabular-nums">{formatTmtm(manager.balance)}</p>
              </div>
              <div className="mt-3 space-y-3 border-l-2 border-brand-200 pl-4">
                {tills.length === 0 && <p className="text-xs text-slate-400">Касс пока нет</p>}
                {tills.map((agent) => {
                  const linked = players.filter((row) => row.agentId === agent.id);
                  return (
                    <div key={agent.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-ink-800">{agent.fullName}</p>
                          <p className="text-xs text-slate-500">{agent.pointName}</p>
                        </div>
                        <p className="text-xs font-extrabold tabular-nums">{formatTmtm(agent.balance)}</p>
                      </div>
                      <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                        {linked.length === 0 && <li className="text-[11px] text-slate-400">Нет игроков</li>}
                        {linked.map((player) => (
                          <li key={player.id} className="text-xs flex justify-between gap-3">
                            <span className="font-semibold text-slate-700">
                              {player.name} · ID {player.publicId}
                            </span>
                            <span className="tabular-nums text-slate-500">{formatTmtm(player.balance)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
