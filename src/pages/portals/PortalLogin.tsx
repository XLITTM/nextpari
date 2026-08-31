import { useState } from 'react';
import { Shield, User } from 'lucide-react';
import type { StaffRole } from '../../routes/portal';
import { PORTAL_LOGIN, navigatePortal } from '../../routes/portal';
import { useAuthStore } from '../../stores/authStore';

const COPY: Record<StaffRole, { title: string; hint: string; demo: string }> = {
  OWNER: {
    title: 'Кабинет владельца',
    hint: 'Сеть, менеджеры и кассы',
    demo: 'owner / 0000',
  },
  MANAGER: {
    title: 'Кабинет менеджера',
    hint: 'Кассы региона и оборот',
    demo: '',
  },
  AGENT: {
    title: 'Терминал кассира',
    hint: 'Вход по email и паролю',
    demo: '',
  },
};

export function PortalLogin({ portal }: { portal: StaffRole }) {
  const copy = COPY[portal];
  const loginFn = useAuthStore((s) => s.login);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setError('');
    setBusy(true);
    try {
      const result = loginFn(login, password, portal);
      navigatePortal(result.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
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
            <h1 className="text-xl font-extrabold text-ink-900">{copy.title}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{copy.hint}</p>
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
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-lg font-bold tracking-[0.3em] text-center outline-none mb-4"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full bg-ink-900 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {busy ? 'Вход…' : 'Войти'}
        </button>
        {copy.demo ? (
          <p className="mt-4 text-[11px] text-gray-500">
            Демо: <span className="font-bold text-gray-700">{copy.demo}</span>
          </p>
        ) : null}
        <div className="mt-3 flex gap-2 text-[11px] font-semibold">
          {(['OWNER', 'MANAGER', 'AGENT'] as StaffRole[])
            .filter((role) => role !== portal)
            .map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => navigatePortal(PORTAL_LOGIN[role])}
                className="text-brand-700 hover:underline"
              >
                {role === 'OWNER' ? 'Владелец' : role === 'MANAGER' ? 'Менеджер' : 'Кассир'}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
