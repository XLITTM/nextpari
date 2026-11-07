import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmMfa, requestLogin, requestLogout, restoreSession } from '../api/operations';
import type { FailureReason } from '../api/http';
import type { OfficeSession } from '../access/session';

export type Connection = 'checking' | 'disconnected' | 'ready';

export type LoginOutcome =
  | { ok: true; challengeId: string }
  | { ok: false; reason: FailureReason };

export type MfaOutcome = { ok: true } | { ok: false; reason: FailureReason };

export interface AuthState {
  ready: boolean;
  connection: Connection;
  session: OfficeSession | null;
  login(email: string, password: string): Promise<LoginOutcome>;
  confirmMfa(challengeId: string, code: string): Promise<MfaOutcome>;
  logout(): Promise<FailureReason | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection>('checking');
  const [session, setSession] = useState<OfficeSession | null>(null);

  useEffect(() => {
    let live = true;
    void restoreSession().then((result) => {
      if (!live) return;
      if (result.ok) {
        setSession(result.data);
        setConnection('ready');
      } else {
        setSession(null);
        setConnection('disconnected');
      }
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginOutcome> => {
    const result = await requestLogin(email, password);
    if (!result.ok) return result;
    return { ok: true, challengeId: result.data.challengeId };
  }, []);

  const confirm = useCallback(async (challengeId: string, code: string): Promise<MfaOutcome> => {
    const result = await confirmMfa(challengeId, code);
    if (!result.ok) return result;
    setSession(result.data);
    setConnection('ready');
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    setConnection('disconnected');
    return requestLogout();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ready, connection, session, login, confirmMfa: confirm, logout }),
    [ready, connection, session, login, confirm, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthTestProvider({
  session,
  children,
}: {
  session: OfficeSession | null;
  children: ReactNode;
}) {
  const value = useMemo<AuthState>(
    () => ({
      ready: true,
      connection: session ? 'ready' : 'disconnected',
      session,
      login: async () => ({ ok: false, reason: 'disconnected' }),
      confirmMfa: async () => ({ ok: false, reason: 'disconnected' }),
      logout: async () => 'disconnected',
    }),
    [session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth provider is missing');
  return value;
}
