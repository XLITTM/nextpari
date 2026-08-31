import { useEffect, useState, type ComponentType } from 'react';
import { ClipboardList, LogOut, Shield, Store, User, UserCheck } from 'lucide-react';
import { isManagerLoginPath } from '../../lib/backoffice';
import { useManagerAuth } from '../../manager/auth/ManagerAuthProvider';
import { ManagerAgentsPage } from './ManagerAgentsPage';
import { ManagerFinancePage } from './ManagerFinancePage';
import { ManagerPlayersPage } from './ManagerPlayersPage';
import { goManagerLogin, goManagerOffice, managerOfficePage, type ManagerOfficePage } from './nav';

function Loader({ label = 'Загрузка кабинета…' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center">
      <p className="text-sm font-semibold text-ink-400">{label}</p>
    </div>
  );
}

export function ManagerOfficeLayout() {
  const { loading, staff, deniedMessage, signOut } = useManagerAuth();

  useEffect(() => {
    document.title = 'NextPari — Кабинет управляющего сетью';
  }, []);

  useEffect(() => {
    if (staff && isManagerLoginPath()) goManagerOffice('agents');
  }, [staff]);

  if (loading) return <Loader />;

  if (!staff) {
    return <ManagerPortalLogin deniedMessage={deniedMessage} />;
  }

  return (
    <ManagerOfficeShell
      displayName={staff.displayName || 'Менеджер'}
      onLogout={() => {
        void signOut().then(() => goManagerLogin());
      }}
    />
  );
}

function ManagerPortalLogin({ deniedMessage }: { deniedMessage: string }) {
  const { signIn } = useManagerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      goManagerOffice('agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = error || deniedMessage;

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">NextPari · Manager</p>
            <h1 className="text-xl font-extrabold text-ink-900 leading-tight">Кабинет Управляющего Сетью</h1>
            <p className="text-xs text-gray-500 mt-0.5">Вход по email и паролю</p>
          </div>
        </div>
        {shownError && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {shownError}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Email</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Пароль</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-4"
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
  displayName,
  onLogout,
}: {
  displayName: string;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<ManagerOfficePage>(() => managerOfficePage());
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const sync = () => setPage(managerOfficePage());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

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
        <nav className="p-3 flex-col gap-1 flex">
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
            <span>Управляющий: {displayName}</span>
            <span className="tabular-nums text-amber-200">Операционный баланс: staging · 0 TMT</span>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-6 overflow-x-auto">
          {notice && (
            <div className="mb-4 bg-brand-50 border border-brand-200 text-brand-800 text-sm font-semibold rounded-xl px-4 py-2.5">
              {notice}
            </div>
          )}
          {page === 'agents' && <ManagerAgentsPage onNotice={setNotice} />}
          {page === 'reports' && <ManagerFinancePage />}
          {page === 'players' && <ManagerPlayersPage />}
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
      {Icon ? <Icon className="w-4 h-4" /> : null}
      {label}
    </button>
  );
}
