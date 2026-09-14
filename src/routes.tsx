import { ManagerOfficeLayout } from './pages/manager/ManagerOfficeLayout';
import { ManagerAuthProvider } from './manager/auth/ManagerAuthProvider';
import { OwnerAuthProvider } from './owner/auth/OwnerAuthProvider';
import { CashierAuthProvider } from './cashier/auth/CashierAuthProvider';
import { ManagerDashboardScreen } from './owner/ManagerDashboardScreen';
import { MobcashAgentScreen } from './screens/MobcashAgentScreen';
import { isAgentTerminalPath } from './cashier/isAgentPath';
import { isBackofficePath, isManagerPortalPath, isSecurityPortalPath } from './lib/staffPortalPaths';
import { SecurityAuthProvider } from './security/auth/SecurityAuthProvider';
import { SecurityDashboard } from './security/SecurityDashboard';

export type StaffPortal = 'owner' | 'manager' | 'agent' | 'security';

export function currentStaffPortal(): StaffPortal | null {
  if (isAgentTerminalPath()) return 'agent';
  if (isManagerPortalPath()) return 'manager';
  if (isSecurityPortalPath()) return 'security';
  if (isBackofficePath()) return 'owner';
  return null;
}

export function AppRoutes({ portal }: { portal: StaffPortal }) {
  if (portal === 'agent') {
    return (
      <CashierAuthProvider>
        <MobcashAgentScreen />
      </CashierAuthProvider>
    );
  }
  if (portal === 'owner') {
    return (
      <OwnerAuthProvider>
        <ManagerDashboardScreen />
      </OwnerAuthProvider>
    );
  }
  if (portal === 'security') {
    return (
      <SecurityAuthProvider>
        <SecurityDashboard />
      </SecurityAuthProvider>
    );
  }
  return (
    <ManagerAuthProvider>
      <ManagerOfficeLayout />
    </ManagerAuthProvider>
  );
}
