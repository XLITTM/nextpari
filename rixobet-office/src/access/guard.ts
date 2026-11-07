import type { AccessDecision, OfficeRoute } from './model';
import type { OfficeSession } from './session';
import { homeFor, matchRoute } from '../nav/catalog';
import { sessionHas } from './session';

export function canAccess(session: OfficeSession | null, route: OfficeRoute): boolean {
  if (!session) return false;
  if (session.role !== route.role) return false;
  return sessionHas(session, route.permission);
}

export function accessDecision(session: OfficeSession | null, pathname: string, search: string): AccessDecision {
  void search;
  const route = matchRoute(pathname);
  if (!route) return session ? 'deny' : 'login';
  if (!session) return 'login';
  return canAccess(session, route) ? 'allow' : 'deny';
}

export function landingPath(session: OfficeSession, requested: string | null): string {
  const home = homeFor(session.role);
  if (!requested || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('://')) {
    return home;
  }
  const path = requested.split('?')[0]?.split('#')[0] ?? home;
  return accessDecision(session, path, '') === 'allow' ? path : home;
}

export function browserRole(): null {
  return null;
}
