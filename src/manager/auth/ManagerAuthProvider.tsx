import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearManagerAuthStorage,
  loginManagerViaGateway,
  logoutManagerViaGateway,
  managerAuthErrorMessage,
  restoreManagerViaGateway,
  type ManagerStaffContext,
} from './managerAuth';

interface ManagerAuthContextValue {
  loading: boolean;
  staff: ManagerStaffContext | null;
  deniedMessage: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const ManagerAuthContext = createContext<ManagerAuthContextValue | null>(null);

function clearBrowserManagerStorage() {
  try {
    clearManagerAuthStorage(window.localStorage);
  } catch {
    /* ignore */
  }
  try {
    clearManagerAuthStorage(window.sessionStorage);
  } catch {
    /* ignore */
  }
}

export function ManagerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<ManagerStaffContext | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');

  const restore = useCallback(async () => {
    try {
      const next = await restoreManagerViaGateway(fetch);
      setStaff(next);
      if (next) setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      setDeniedMessage(managerAuthErrorMessage(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearBrowserManagerStorage();
    void restore();
  }, [restore]);

  const signIn = useCallback(async (email: string, password: string) => {
    setDeniedMessage('');
    setLoading(true);
    try {
      const next = await loginManagerViaGateway(fetch, email, password);
      clearBrowserManagerStorage();
      setStaff(next);
      setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      const message = managerAuthErrorMessage(err instanceof Error ? err.message : '');
      setDeniedMessage(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutManagerViaGateway(fetch);
    clearBrowserManagerStorage();
    setStaff(null);
    setDeniedMessage('');
  }, []);

  const value = useMemo(
    () => ({ loading, staff, deniedMessage, signIn, signOut }),
    [loading, staff, deniedMessage, signIn, signOut],
  );

  return (
    <ManagerAuthContext.Provider value={value}>
      {children}
    </ManagerAuthContext.Provider>
  );
}

export function useManagerAuth() {
  const ctx = useContext(ManagerAuthContext);
  if (!ctx) throw new Error('useManagerAuth must be used inside ManagerAuthProvider');
  return ctx;
}
