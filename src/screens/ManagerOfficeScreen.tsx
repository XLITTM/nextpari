import { useEffect, useState } from 'react';
import { Building2, LogOut, Shield, User, Users } from 'lucide-react';
import { PlayersTab } from '../components/backoffice/PlayersTab';
import {
  clearManagerSession,
  ensureStaffPortalHome,
  fetchMyManagerLimit,
  formatTmtmCompact,
  loadManagerSession,
  managerLogin,
  type ManagerSession,
} from '../lib/backoffice';
import { AgentsPanel } from './ManagerDashboardScreen';

type OfficeTab = 'agents' | 'players';

export function ManagerOfficeScreen() {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    document.title = 'NextPari — Кабинет менеджера';
    const saved = loadManagerSession();
    if (saved && !ensureStaffPortalHome(saved)) return;
    setSession(saved);
    setBooting(false);
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кабинета…</p>
      </div>
    );
  }

  if (!session) {
    return <ManagerOfficeLogin onSuccess={setSession} />;
  }

  return (
    <ManagerOfficeShell
      session={session}
      onLogout={() => {
        clearManagerSession();
        setSession(null);
      }}
    />
  );
}

function ManagerOfficeLogin({ onSuccess }: { onSuccess: (session: ManagerSession) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const next = await managerLogin(login, password);
      if (!ensureStaffPortalHome(next)) return;
      onSuccess(next);
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
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">NextPari</p>
            <h1 className="text-xl font-extrabold text-ink-900">Кабинет менеджера</h1>
          </div>
        </div>
        {error && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Логин</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="manager01"
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Пароль</label>
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
        <p className="mt-4 text-[11px] text-gray-500">
          Демо: <span className="font-bold text-gray-700">manager01</span> / <span className="font-bold text-gray-700">1111</span>
        </p>
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
  const [tab, setTab] = useState<OfficeTab>('agents');
  const [notice, setNotice] = useState('');
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    void fetchMyManagerLimit(session).then(setLimit).catch(() => setLimit(0));
  }, [session, notice]);

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">Кабинет менеджера</h1>
          <p className="text-xs text-ink-400 mt-2 leading-snug">{session.fullName}</p>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            Manager · {session.networkName}
          </span>
          {limit != null && (
            <p className="text-[11px] text-ink-400 mt-3">
              Лимит: <span className="font-bold text-white">{formatTmtmCompact(limit)}</span>
            </p>
          )}
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setTab('agents')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold ${
              tab === 'agents' ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Кассы и агенты
          </button>
          <button
            type="button"
            onClick={() => setTab('players')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold ${
              tab === 'players' ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            Игроки
          </button>
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

      <main className="flex-1 min-w-0 p-6 overflow-x-auto">
        {notice && (
          <div className="mb-4 bg-brand-50 border border-brand-200 text-brand-800 text-sm font-semibold rounded-xl px-4 py-2.5">
            {notice}
          </div>
        )}
        {tab === 'agents' && <AgentsPanel session={session} onNotice={setNotice} />}
        {tab === 'players' && <PlayersTab session={session} onNotice={setNotice} />}
      </main>
    </div>
  );
}
