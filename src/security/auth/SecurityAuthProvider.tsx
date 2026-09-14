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
  clearSecurityAuthStorage,
  loginSecurityViaGateway,
  logoutSecurityViaGateway,
  restoreSecurityViaGateway,
  securityAuthErrorMessage,
  type SecurityStaffContext,
} from './securityAuth';

interface SecurityAuthContextValue {
  loading: boolean;
  staff: SecurityStaffContext | null;
  deniedMessage: string;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SecurityAuthContext = createContext<SecurityAuthContextValue | null>(null);

function clearBrowserSecurityStorage() {
  try {
    clearSecurityAuthStorage(window.localStorage);
  } catch {
    /* ignore */
  }
  try {
    clearSecurityAuthStorage(window.sessionStorage);
  } catch {
    /* ignore */
  }
}

export function SecurityAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<SecurityStaffContext | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');

  const restore = useCallback(async () => {
    try {
      const next = await restoreSecurityViaGateway(fetch);
      setStaff(next);
      if (next) setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      setDeniedMessage(securityAuthErrorMessage(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearBrowserSecurityStorage();
    void restore();
  }, [restore]);

  const signIn = useCallback(async (login: string, password: string) => {
    setDeniedMessage('');
    setLoading(true);
    try {
      const next = await loginSecurityViaGateway(fetch, login, password);
      clearBrowserSecurityStorage();
      setStaff(next);
      setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      const message = securityAuthErrorMessage(err instanceof Error ? err.message : '');
      setDeniedMessage(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutSecurityViaGateway(fetch);
    clearBrowserSecurityStorage();
    setStaff(null);
    setDeniedMessage('');
  }, []);

  const value = useMemo(
    () => ({ loading, staff, deniedMessage, signIn, signOut }),
    [loading, staff, deniedMessage, signIn, signOut],
  );

  return (
    <SecurityAuthContext.Provider value={value}>
      {children}
    </SecurityAuthContext.Provider>
  );
}

export function useSecurityAuth() {
  const ctx = useContext(SecurityAuthContext);
  if (!ctx) throw new Error('useSecurityAuth must be used inside SecurityAuthProvider');
  return ctx;
}
