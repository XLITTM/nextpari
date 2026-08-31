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
  clearCashierAuthStorage,
  cashierAuthErrorMessage,
  loginCashierViaGateway,
  logoutCashierViaGateway,
  restoreCashierViaGateway,
  type CashierStaffContext,
} from './cashierAuth';

interface CashierAuthContextValue {
  loading: boolean;
  staff: CashierStaffContext | null;
  deniedMessage: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const CashierAuthContext = createContext<CashierAuthContextValue | null>(null);

function clearBrowserCashierStorage() {
  try {
    clearCashierAuthStorage(window.localStorage);
  } catch {
    /* ignore */
  }
  try {
    clearCashierAuthStorage(window.sessionStorage);
  } catch {
    /* ignore */
  }
}

export function CashierAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<CashierStaffContext | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');

  const restore = useCallback(async () => {
    try {
      const next = await restoreCashierViaGateway(fetch);
      setStaff(next);
      if (next) setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      setDeniedMessage(cashierAuthErrorMessage(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearBrowserCashierStorage();
    void restore();
  }, [restore]);

  const signIn = useCallback(async (email: string, password: string) => {
    setDeniedMessage('');
    setLoading(true);
    try {
      const next = await loginCashierViaGateway(fetch, email, password);
      clearBrowserCashierStorage();
      setStaff(next);
      setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      const message = cashierAuthErrorMessage(err instanceof Error ? err.message : '');
      setDeniedMessage(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutCashierViaGateway(fetch);
    clearBrowserCashierStorage();
    setStaff(null);
    setDeniedMessage('');
  }, []);

  const value = useMemo(
    () => ({ loading, staff, deniedMessage, signIn, signOut }),
    [loading, staff, deniedMessage, signIn, signOut],
  );

  return (
    <CashierAuthContext.Provider value={value}>
      {children}
    </CashierAuthContext.Provider>
  );
}

export function useCashierAuth() {
  const ctx = useContext(CashierAuthContext);
  if (!ctx) throw new Error('useCashierAuth must be used inside CashierAuthProvider');
  return ctx;
}
