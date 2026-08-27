import { useEffect, useMemo, useState } from 'react';
import { OwnerDashboard } from '../pages/owner/OwnerDashboard';
import { OwnerManagers } from '../pages/owner/OwnerManagers';
import { OwnerNetworkView } from '../pages/owner/OwnerNetworkView';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { ManagerAgents } from '../pages/manager/ManagerAgents';
import { ManagerReports } from '../pages/manager/ManagerReports';
import { AgentPosTerminal } from '../pages/agent/AgentPosTerminal';
import { PortalLogin } from '../pages/portals/PortalLogin';
import { PortalShell } from '../pages/portals/PortalChrome';
import {
  PORTAL_HOME,
  PORTAL_LOGIN,
  ROLE_BY_PORTAL,
  navigatePortal,
  parsePortalRoute,
  type PortalRoute,
} from './portal';
import { useAuthStore } from '../stores/authStore';

function readRoute(): PortalRoute {
  const parsed = parsePortalRoute();
  if (parsed) return parsed;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'agent' || host.startsWith('agent.')) return { portal: 'agent', page: 'home', isLogin: false };
  }
  return { portal: 'owner', page: 'login', isLogin: true };
}

export function PortalApp() {
  const [route, setRoute] = useState<PortalRoute>(readRoute);
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const required = ROLE_BY_PORTAL[route.portal];

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (route.page === 'legacy') {
      navigatePortal(session ? PORTAL_HOME[session.role] : PORTAL_LOGIN.OWNER);
      return;
    }
    if (route.isLogin && session?.role === required) {
      navigatePortal(PORTAL_HOME[session.role]);
      return;
    }
    if (!route.isLogin && !session) {
      navigatePortal(PORTAL_LOGIN[required]);
      return;
    }
    if (!route.isLogin && session && session.role !== required) {
      navigatePortal(PORTAL_HOME[session.role]);
    }
  }, [route, session, required]);

  const handleLogout = () => {
    logout();
    navigatePortal(PORTAL_LOGIN[required]);
  };

  const ownerNav = useMemo(
    () => [
      { href: '/owner', label: 'Дашборд', active: route.page === 'home' },
      { href: '/owner/managers', label: 'Менеджеры', active: route.page === 'managers' },
      { href: '/owner/network', label: 'Сеть', active: route.page === 'network' },
    ],
    [route.page],
  );
  const managerNav = useMemo(
    () => [
      { href: '/manager', label: 'Дашборд', active: route.page === 'home' },
      { href: '/manager/agents', label: 'Кассы', active: route.page === 'agents' },
      { href: '/manager/reports', label: 'Отчёты', active: route.page === 'reports' },
    ],
    [route.page],
  );

  if (route.isLogin || !session || session.role !== required) {
    return <PortalLogin portal={required} />;
  }

  if (session.role === 'AGENT') {
    return <AgentPosTerminal />;
  }

  if (session.role === 'OWNER') {
    return (
      <PortalShell session={session} title="Кабинет владельца" nav={ownerNav} onLogout={handleLogout}>
        {route.page === 'managers' ? <OwnerManagers /> : route.page === 'network' ? <OwnerNetworkView /> : <OwnerDashboard />}
      </PortalShell>
    );
  }

  return (
    <PortalShell session={session} title="Кабинет менеджера" nav={managerNav} onLogout={handleLogout}>
      {route.page === 'agents' ? <ManagerAgents /> : route.page === 'reports' ? <ManagerReports /> : <ManagerDashboard />}
    </PortalShell>
  );
}
