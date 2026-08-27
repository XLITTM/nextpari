import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { homePathForRole, type StaffRole } from '../routes/portal';
import { useHierarchyStore } from './hierarchyStore';

export type { StaffRole };

export interface StaffSession {
  id: string;
  login: string;
  fullName: string;
  role: StaffRole;
  region?: string;
  managerId?: string | null;
}

interface AuthStore {
  session: StaffSession | null;
  login: (login: string, password: string, portal: StaffRole) => { session: StaffSession; redirectTo: string };
  logout: () => void;
}

const SESSION_KEY = 'nextpari-staff-session';

export function loadStaffSession(): StaffSession | null {
  return useAuthStore.getState().session;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      session: null,
      login: (login, password, _portal) => {
        const staff = useHierarchyStore.getState().findStaff(login, password);
        if (!staff) throw new Error('Неверный логин или пароль');
        const session: StaffSession = {
          id: staff.id,
          login: staff.login,
          fullName: staff.fullName,
          role: staff.role,
          region: staff.region,
          managerId: staff.managerId,
        };
        set({ session });
        return { session, redirectTo: homePathForRole(staff.role) };
      },
      logout: () => set({ session: null }),
    }),
    { name: SESSION_KEY, partialize: (state) => ({ session: state.session }) },
  ),
);
