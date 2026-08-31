import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  authenticateOwnerWithPassword,
  clearOwnerAuthStorage,
  restoreOwnerStaffSession,
  signOutOwner,
  type OwnerAuthPorts,
  type OwnerStaffContext,
} from './ownerAuth';
import { getOwnerAccessToken, ownerSupabase } from './ownerSupabase';

interface OwnerAuthContextValue {
  loading: boolean;
  session: Session | null;
  staff: OwnerStaffContext | null;
  accessToken: string | null;
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

function accessDeniedMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = raw.replace(/^.*ERROR:\s*/i, '').replace(/\s+Where:[\s\S]*$/i, '').trim();
  if (code.includes('STAFF_ACCOUNT_NOT_FOUND')) return 'Доступ запрещён: сотрудник не найден';
  if (code.includes('OWNER_REQUIRED')) return 'Доступ запрещён: требуется роль владельца';
  if (code.includes('STAFF_ACCOUNT_BLOCKED')) return 'Доступ запрещён: аккаунт заблокирован';
  if (code.includes('STAFF_ACCOUNT_DISABLED')) return 'Доступ запрещён: аккаунт отключён';
  if (code === 'EMAIL_PASSWORD_REQUIRED') return 'Введите email и пароль';
  if (code === 'AUTH_FAILED' || code.toLowerCase().includes('invalid login')) {
    return 'Неверный email или пароль';
  }
  return code || 'Доступ запрещён';
}

function livePorts(): OwnerAuthPorts {
  return {
    async signInWithPassword({ email, password }) {
      const { data, error } = await ownerSupabase.auth.signInWithPassword({ email, password });
      return { session: data.session, error };
    },
    async signOut() {
      await ownerSupabase.auth.signOut();
      clearBrowserOwnerStorage();
    },
    async getSession() {
      const { data } = await ownerSupabase.auth.getSession();
      return data.session;
    },
    async currentStaffContext() {
      const { data, error } = await ownerSupabase.rpc('current_staff_context');
      if (error) throw error;
      return data;
    },
  };
}

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<OwnerStaffContext | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');

  const applyRestored = useCallback(async () => {
    try {
      const restored = await restoreOwnerStaffSession(livePorts());
      if (!restored) {
        setSession(null);
        setStaff(null);
        setAccessToken(null);
        return;
      }
      const { data } = await ownerSupabase.auth.getSession();
      setSession(data.session ?? null);
      setStaff(restored.staff);
      setAccessToken(restored.accessToken);
      setDeniedMessage('');
    } catch (err) {
      setSession(null);
      setStaff(null);
      setAccessToken(null);
      setDeniedMessage(accessDeniedMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void applyRestored().then(() => {
      if (!active) return;
    });

    const { data: sub } = ownerSupabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setStaff(null);
        setAccessToken(null);
        setLoading(false);
        return;
      }
      void applyRestored();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applyRestored]);

  const signIn = useCallback(async (email: string, password: string) => {
    setDeniedMessage('');
    setLoading(true);
    try {
      const result = await authenticateOwnerWithPassword(livePorts(), email, password);
      const { data } = await ownerSupabase.auth.getSession();
      setSession(data.session ?? null);
      setStaff(result.staff);
      setAccessToken(result.accessToken);
      setDeniedMessage('');
    } catch (err) {
      setSession(null);
      setStaff(null);
      setAccessToken(null);
      const message = accessDeniedMessage(err);
      setDeniedMessage(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutOwner(livePorts());
    setSession(null);
    setStaff(null);
    setAccessToken(null);
    setDeniedMessage('');
  }, []);

  const value = useMemo(
    () => ({ loading, session, staff, accessToken, deniedMessage, signIn, signOut }),
    [loading, session, staff, accessToken, deniedMessage, signIn, signOut],
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

export async function ownerBearerTokenForOnboarding(): Promise<string | null> {
  return getOwnerAccessToken();
}
