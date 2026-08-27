import { useEffect, useState, type ComponentType } from 'react';
import { ClipboardList, LogOut, Shield, Store, User, UserCheck } from 'lucide-react';
import { PlayersTab } from '../../components/backoffice/PlayersTab';
import {
  clearNetworkManagerSession,
  isManagerLoginPath,
  loadNetworkManagerSession,
  networkManagerLogin,
  type ManagerSession,
} from '../../lib/backoffice';
import { useBackofficeStore } from '../../stores/backofficeStore';
import { ManagerAgentsPage } from './ManagerAgentsPage';
import { ManagerFinancePage } from './ManagerFinancePage';
import { goManagerLogin, goManagerOffice, managerOfficePage, type ManagerOfficePage } from './nav';

function formatTmt(value: number) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} TMT`;
}

export function ManagerOfficeLayout() {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    document.title = 'NextPari — Кабинет управляющего сетью';
    const saved = loadNetworkManagerSession();
    setSession(saved);
    setBooting(false);
    if (saved && isManagerLoginPath()) goManagerOffice('agents');
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кабинета…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <ManagerPortalLogin
        onSuccess={(next) => {
          setSession(next);
          goManagerOffice('agents');
        }}
      />
    );
  }

  return (
    <ManagerOfficeShell
      session={session}
      onLogout={() => {
        clearNetworkManagerSession();
        setSession(null);
        goManagerLogin();
      }}
    />
  );
}

function ManagerPortalLogin({ onSuccess }: { onSuccess: (session: ManagerSession) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      onSuccess(await networkManagerLogin(login, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900 leading-tight">NextPari · Кабинет Управляющего Сетью</h1>
          </div>
        </div>
        {error && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Логин менеджера</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Логин менеджера"
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">PIN / Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••"
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-lg font-bold tracking-[0.4em] text-center outline-none mb-4"
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="w-full bg-ink-900 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {submitting ? 'Вход…' : 'Войти'}
        </button>
      </div>
    </div>
  );
}

function ManagerOfficeShell({
  session,
  onLogout,
}: {
  session: ManagerSession;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<ManagerOfficePage>(() => managerOfficePage());
  const [notice, setNotice] = useState('');
  const limit = useBackofficeStore((s) => s.managerLimit(session.id));
  const hydrate = useBackofficeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    const sync = () => setPage(managerOfficePage());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [hydrate]);

  const go = (next: ManagerOfficePage) => {
    setPage(next);
    goManagerOffice(next);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">Управляющий сетью</h1>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            Кабинет менеджера
          </span>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <NavBtn active={page === 'agents'} onClick={() => go('agents')} icon={Store} label="Мои Кассы / Агенты" />
          <NavBtn active={page === 'reports'} onClick={() => go('reports')} icon={ClipboardList} label="Отчет по смене" />
          <NavBtn active={page === 'players'} onClick={() => go('players')} icon={UserCheck} label="Игроки" />
        </nav>
        <div className="mt-auto p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-300 hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="bg-ink-950 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <span>Управляющий: {session.fullName}</span>
            <span className="tabular-nums">Доступный баланс сети: {formatTmt(limit)}</span>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-6 overflow-x-auto">
          {notice && (
            <div className="mb-4 bg-brand-50 border border-brand-200 text-brand-800 text-sm font-semibold rounded-xl px-4 py-2.5">
              {notice}
            </div>
          )}
          {page === 'agents' && <ManagerAgentsPage session={session} onNotice={setNotice} />}
          {page === 'reports' && <ManagerFinancePage session={session} />}
          {page === 'players' && <PlayersTab session={session} onNotice={setNotice} />}
        </main>
      </div>
    </div>
  );
}

function NavBtn({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold ${
        active ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
