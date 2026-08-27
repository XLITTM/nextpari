import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import type { StaffRole } from '../../routes/portal';
import { navigatePortal } from '../../routes/portal';
import type { StaffSession } from '../../stores/authStore';

export function formatTmtm(value: number) {
  return `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM`;
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </article>
  );
}

export function PortalShell({
  session,
  title,
  nav,
  onLogout,
  children,
}: {
  session: StaffSession;
  title: string;
  nav: Array<{ href: string; label: string; active: boolean }>;
  onLogout: () => void;
  children: ReactNode;
}) {
  const badge: Record<StaffRole, string> = {
    OWNER: 'Владелец',
    MANAGER: `Менеджер${session.region ? ` · ${session.region}` : ''}`,
    AGENT: 'Кассир',
  };
  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="hidden md:flex w-64 shrink-0 bg-ink-950 text-white flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">{title}</h1>
          <p className="text-xs text-ink-400 mt-2 leading-snug">{session.fullName}</p>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            {badge[session.role]}
          </span>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          {nav.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigatePortal(item.href)}
              className={`text-left px-3 py-2.5 rounded-xl text-sm font-semibold ${
                item.active ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
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
      <div className="flex-1 min-w-0">
        <header className="md:hidden bg-ink-950 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-bold">NextPari</p>
            <p className="text-sm font-extrabold">{title}</p>
          </div>
          <button type="button" onClick={onLogout} className="text-xs font-bold text-ink-300">
            Выйти
          </button>
        </header>
        <div className="md:hidden overflow-x-auto bg-white border-b border-slate-200 px-3 py-2 flex gap-2">
          {nav.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigatePortal(item.href)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${
                item.active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <main className="p-4 md:p-6 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
