export type StaffRole = 'OWNER' | 'MANAGER' | 'AGENT';
export type PortalId = 'owner' | 'manager' | 'agent';

export interface PortalRoute {
  portal: PortalId;
  page: string;
  isLogin: boolean;
}

export const PORTAL_HOME: Record<StaffRole, string> = {
  OWNER: '/backoffice',
  MANAGER: '/manager-office',
  AGENT: '/agent',
};

export const PORTAL_LOGIN: Record<StaffRole, string> = {
  OWNER: '/backoffice',
  MANAGER: '/manager-office',
  AGENT: '/agent',
};

export const ROLE_BY_PORTAL: Record<PortalId, StaffRole> = {
  owner: 'OWNER',
  manager: 'MANAGER',
  agent: 'AGENT',
};

export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function parsePortalRoute(path = currentPath()): PortalRoute | null {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/backoffice' || clean.startsWith('/backoffice/')) {
    return { portal: 'owner', page: 'home', isLogin: false };
  }
  if (clean === '/manager-office' || clean.startsWith('/manager-office/')) {
    return { portal: 'manager', page: 'home', isLogin: false };
  }
  if (clean === '/agent' || clean.startsWith('/agent/')) {
    return { portal: 'agent', page: clean === '/agent/login' ? 'login' : 'home', isLogin: clean === '/agent/login' };
  }
  const match = clean.match(/^\/(owner|manager|agent)(?:\/(.*))?$/);
  if (!match) return null;
  const portal = match[1] as PortalId;
  const rest = (match[2] ?? '').replace(/\/+$/, '');
  return {
    portal,
    page: rest || 'home',
    isLogin: rest === 'login',
  };
}

export function isStaffPortalPath(path = currentPath()): boolean {
  return parsePortalRoute(path) != null;
}

export function homePathForRole(role: StaffRole, _requestedPortal?: StaffRole): string {
  return PORTAL_HOME[role];
}

export function navigatePortal(path: string) {
  if (typeof window === 'undefined') return;
  if (currentPath() === path) return;
  window.location.assign(path);
}
