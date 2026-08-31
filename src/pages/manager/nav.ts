export type ManagerOfficePage = 'agents' | 'reports' | 'players' | 'risks';

export function managerOfficeLocation(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) return hash.replace(/\/+$/, '') || '/';
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function managerOfficePage(loc = managerOfficeLocation()): ManagerOfficePage {
  if (loc.includes('/reports') || loc.includes('/finance') || loc.includes('/shift')) return 'reports';
  if (loc.includes('/players')) return 'players';
  if (loc.includes('/risk')) return 'risks';
  return 'agents';
}

export function goManagerOffice(page: ManagerOfficePage = 'agents') {
  const href =
    page === 'reports' ? '/#/manager/dashboard/reports'
      : page === 'players' ? '/#/manager/dashboard/players'
        : page === 'risks' ? '/#/manager/dashboard/risks'
          : '/#/manager/dashboard';
  window.history.pushState({ managerOffice: page }, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('hashchange'));
}

export function goManagerLogin() {
  window.history.pushState({ managerOffice: 'login' }, '', '/#/manager');
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('hashchange'));
}
