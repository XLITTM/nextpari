import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL, SECTION_LABEL, type NavSection, type OfficeRole } from '../access/model';
import type { OfficeSession } from '../access/session';
import { BRAND } from '../brand';
import { routesFor } from '../nav/catalog';
import { Wordmark } from './mark';

const SECTION_ORDER: readonly NavSection[] = ['main', 'people', 'money', 'reports', 'review', 'control'];

export function PortalFrame({
  role,
  session,
  linkBase,
  banner,
  onExit,
  exitLabel,
  denied,
  children,
}: {
  role: OfficeRole;
  session: OfficeSession | null;
  linkBase: string;
  banner?: string;
  onExit: () => void;
  exitLabel: string;
  denied: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const routes = routesFor(role);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="rx-shell">
      {banner ? <p className="rx-preview">{banner}</p> : null}
      <aside className={open ? 'rx-sidebar rx-open' : 'rx-sidebar'}>
        <div className="rx-brand">
          <Wordmark compact />
          <small>
            OFFICE · {BRAND.code}
          </small>
        </div>
        <nav aria-label="Разделы" onClick={() => setOpen(false)}>
          {SECTION_ORDER.map((section) => {
            const items = routes.filter((route) => route.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="rx-section">
                <p>{SECTION_LABEL[section]}</p>
                {items.map((route) => (
                  <NavLink key={route.path} to={`${linkBase}${route.path}`} end>
                    {route.nav}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      {open ? <button className="rx-backdrop" type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} /> : null}
      <div className="rx-main">
        <header className="rx-top">
          <button
            className="rx-menu"
            type="button"
            aria-expanded={open}
            aria-label="Меню"
            onClick={() => setOpen((value) => !value)}
          >
            Меню
          </button>
          <div className="rx-identity">
            <strong>{ROLE_LABEL[role]}</strong>
            <span>{session ? session.displayName : 'Сессия не выдана'}</span>
          </div>
          <span className={banner || !session ? 'rx-pill' : 'rx-pill rx-pill-live'}>
            {banner || !session ? 'Не подключено' : 'Сессия сервера'}
          </span>
          <button className="rx-btn rx-btn-ghost" type="button" onClick={onExit}>
            {exitLabel}
          </button>
        </header>
        {denied ? (
          <p className="rx-denied" role="status">
            Недостаточно прав для этого раздела.
          </p>
        ) : null}
        <div className="rx-content">{children}</div>
      </div>
    </div>
  );
}
