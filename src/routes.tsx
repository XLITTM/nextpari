import { ManagerOfficeLayout } from './pages/manager/ManagerOfficeLayout';
import { OwnerAuthProvider } from './owner/auth/OwnerAuthProvider';
import { ManagerDashboardScreen } from './owner/ManagerDashboardScreen';
import { MobcashAgentScreen } from './screens/MobcashAgentScreen';
import { isAgentTerminalPath } from './lib/cashier';
import { isBackofficePath, isManagerPortalPath } from './lib/backoffice';

export type StaffPortal = 'owner' | 'manager' | 'agent';

export function currentStaffPortal(): StaffPortal | null {
  if (isAgentTerminalPath()) return 'agent';
  if (isManagerPortalPath()) return 'manager';
  if (isBackofficePath()) return 'owner';
  return null;
}

export function AppRoutes({ portal }: { portal: StaffPortal }) {
  if (portal === 'agent') return <MobcashAgentScreen />;
  if (portal === 'owner') {
    return (
      <OwnerAuthProvider>
        <ManagerDashboardScreen />
      </OwnerAuthProvider>
    );
  }
  return <ManagerOfficeLayout />;
}
