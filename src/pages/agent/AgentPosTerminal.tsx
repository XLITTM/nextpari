import { useEffect, useMemo, useState } from 'react';
import { Banknote, LogOut, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useHierarchyStore } from '../../stores/hierarchyStore';
import { formatTmtm, formatWhen } from '../portals/PortalChrome';
import { navigatePortal } from '../../routes/portal';

type PosAction = 'deposit' | 'payout' | 'bet';

export function AgentPosTerminal() {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const handleLogout = () => {
    logout();
    navigatePortal('/agent/login');
  };
  const agentId = session?.id ?? '';
  const agent = useHierarchyStore((s) => s.staff.find((row) => row.id === agentId));
  const openShift = useHierarchyStore((s) => s.openShift);
  const closeShift = useHierarchyStore((s) => s.closeShift);
  const shiftOps = useHierarchyStore((s) => s.shiftOps(agentId));
  const depositPlayer = useHierarchyStore((s) => s.depositPlayer);
  const payoutPlayer = useHierarchyStore((s) => s.payoutPlayer);
  const placeCashierBet = useHierarchyStore((s) => s.placeCashierBet);
  const findPlayer = useHierarchyStore((s) => s.findPlayer);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('100');
  const [action, setAction] = useState<PosAction>('deposit');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [zReport, setZReport] = useState('');

  useEffect(() => {
    if (agentId) openShift(agentId);
  }, [agentId, openShift]);

  const found = useMemo(() => (query ? findPlayer(query) : undefined), [query, findPlayer, shiftOps.length]);

  const run = (fn: () => void) => {
    setError('');
    setNotice('');
    setZReport('');
    try {
      fn();
      setNotice('Операция проведена');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка кассы');
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <header className="px-4 py-4 flex items-center justify-between border-b border-white/10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-bold">Mobcash</p>
          <h1 className="text-lg font-extrabold">Терминал кассы</h1>
          <p className="text-xs text-ink-400">{agent?.pointName || session?.fullName}</p>
        </div>
        <button type="button" onClick={handleLogout} className="text-ink-300">
          <LogOut className="w-5 h-5" />
        </button>
      </header>
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="rounded-2xl bg-brand-600 p-4 shadow-lg shadow-brand-900/30">
          <p className="text-xs font-semibold text-white/80">Остаток кассы</p>
          <p className="mt-1 text-3xl font-black tabular-nums">{formatTmtm(agent?.balance ?? 0)}</p>
        </div>
        {error && <p className="text-sm font-semibold text-red-300">{error}</p>}
        {notice && <p className="text-sm font-semibold text-emerald-300">{notice}</p>}
        {zReport && <p className="text-sm font-semibold text-amber-200 whitespace-pre-line">{zReport}</p>}
        <div className="bg-ink-900 rounded-2xl p-4 space-y-3">
          <label className="text-xs font-semibold text-ink-400">Поиск игрока · ID / телефон</label>
          <div className="flex items-center gap-2 bg-ink-800 rounded-xl px-3">
            <Search className="w-4 h-4 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="729767 или 65 111122"
              className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            />
          </div>
          {found && (
            <p className="text-xs text-ink-300">
              {found.name} · ID {found.publicId} · счёт {formatTmtm(found.balance)}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['deposit', 'Депозит'],
              ['payout', 'Выплата'],
              ['bet', 'Ставка'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAction(id)}
                className={`py-2 rounded-xl text-xs font-bold ${action === id ? 'bg-brand-600' : 'bg-ink-800 text-ink-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-ink-800 rounded-xl px-3 py-3 text-center text-lg font-black tabular-nums outline-none"
          />
          <button
            type="button"
            onClick={() =>
              run(() => {
                if (action === 'deposit') depositPlayer(agentId, query, Number(amount));
                else if (action === 'payout') payoutPlayer(agentId, query, Number(amount));
                else placeCashierBet(agentId, query, Number(amount));
              })
            }
            className="w-full bg-white text-ink-950 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
          >
            <Banknote className="w-4 h-4" />
            {action === 'deposit' ? 'Принять депозит' : action === 'payout' ? 'Выплатить выигрыш' : 'Принять ставку от кассы'}
          </button>
        </div>
        <div className="bg-ink-900 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold">Смена</h2>
            <button
              type="button"
              onClick={() =>
                run(() => {
                  const closed = closeShift(agentId);
                  setZReport(
                    `Z-отчёт закрыт\nДепозиты ${formatTmtm(closed.deposits)}\nВыплаты ${formatTmtm(closed.payouts)}\nСтавки ${formatTmtm(closed.bets)}\nОстаток ${formatTmtm(closed.closingFloat ?? 0)}`,
                  );
                })
              }
              className="text-xs font-bold bg-amber-500 text-ink-950 px-3 py-1.5 rounded-lg"
            >
              Z-отчёт
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {shiftOps.map((row) => (
              <div key={row.id} className="flex justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-ink-100">{row.note}</p>
                  <p className="text-ink-500">{formatWhen(row.createdAt)}</p>
                </div>
                <p className="font-black tabular-nums">{formatTmtm(row.amount)}</p>
              </div>
            ))}
            {shiftOps.length === 0 && <p className="text-xs text-ink-500">Операций за смену пока нет</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
