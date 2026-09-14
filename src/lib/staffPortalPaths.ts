function staffLocation(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) return hash.replace(/\/+$/, '') || '/';
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function isBackofficePath(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'admin' || host.startsWith('admin.')) return true;
  const loc = staffLocation();
  return loc === '/backoffice' || loc.startsWith('/backoffice/');
}

export function isManagerPortalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const loc = staffLocation();
  if (loc === '/manager' || loc.startsWith('/manager/')) return true;
  if (loc === '/manager-login') return true;
  if (loc === '/manager-office' || loc.startsWith('/manager-office/')) return true;
  return false;
}

export function isManagerOfficePath(): boolean {
  return isManagerPortalPath();
}

export function isSecurityPortalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const loc = staffLocation();
  return loc === '/security' || loc.startsWith('/security/');
}

export function isManagerLoginPath(): boolean {
  const loc = staffLocation();
  return loc === '/manager' || loc === '/manager-login' || loc === '/manager/login';
}
