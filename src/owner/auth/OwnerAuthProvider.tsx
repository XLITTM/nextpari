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
  clearOwnerAuthStorage,
  loginOwnerViaGateway,
  logoutOwnerViaGateway,
  ownerAuthErrorMessage,
  restoreOwnerViaGateway,
  type OwnerStaffContext,
} from './ownerAuth';

interface OwnerAuthContextValue {
  loading: boolean;
  staff: OwnerStaffContext | null;
  deniedMessage: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);

function clearBrowserOwnerStorage() {
  try {
    clearOwnerAuthStorage(window.localStorage);
  } catch {
    /* ignore */
  }
  try {
    clearOwnerAuthStorage(window.sessionStorage);
  } catch {
    /* ignore */
  }
}

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<OwnerStaffContext | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');

  const restore = useCallback(async () => {
    try {
      const next = await restoreOwnerViaGateway(fetch);
      setStaff(next);
      if (next) setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      setDeniedMessage(ownerAuthErrorMessage(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearBrowserOwnerStorage();
    void restore();
  }, [restore]);

  const signIn = useCallback(async (email: string, password: string) => {
    setDeniedMessage('');
    setLoading(true);
    try {
      const next = await loginOwnerViaGateway(fetch, email, password);
      clearBrowserOwnerStorage();
      setStaff(next);
      setDeniedMessage('');
    } catch (err) {
      setStaff(null);
      const message = ownerAuthErrorMessage(err instanceof Error ? err.message : '');
      setDeniedMessage(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutOwnerViaGateway(fetch);
    clearBrowserOwnerStorage();
    setStaff(null);
    setDeniedMessage('');
  }, []);

  const value = useMemo(
    () => ({ loading, staff, deniedMessage, signIn, signOut }),
    [loading, staff, deniedMessage, signIn, signOut],
  );

  return (
    <OwnerAuthContext.Provider value={value}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error('useOwnerAuth must be used inside OwnerAuthProvider');
  return ctx;
}
