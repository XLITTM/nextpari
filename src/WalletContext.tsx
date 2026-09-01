import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchPlayerMe, walletViewFromSnapshot } from './lib/playerAuth';
import { useUserStore } from './stores/userStore';

interface WalletContextValue {
  balance: number;
  publicId: string | null;
  loading: boolean;
  available: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  applyBalance: (next: number) => void;
  applyServerBalance: (next: number) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrate = useUserStore((state) => state.hydrate);
  const resetUser = useUserStore((state) => state.reset);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fetchPlayerMe();
      const next = walletViewFromSnapshot(snapshot);
      setBalance(next.balance);
      setPublicId(next.publicId);
      setAvailable(next.available);
      setError(next.error);
      if (!next.available) {
        resetUser();
        return;
      }
      hydrate({
        publicId: next.publicId ?? '',
        balance: next.balance,
        walletId: null,
      });
    } catch (err) {
      setAvailable(false);
      setError(err instanceof Error ? err.message : 'WALLET_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, [hydrate, resetUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyBalance = useCallback((_next: number) => {
    /* Browser cannot mint or change canonical balance. */
  }, []);

  const applyServerBalance = useCallback((next: number) => {
    if (!Number.isFinite(next) || next < 0) return;
    const safe = Number(next.toFixed(2));
    setBalance(safe);
    hydrate({
      publicId: publicId ?? '',
      balance: safe,
      walletId: null,
    });
  }, [hydrate, publicId]);

  return (
    <WalletContext.Provider value={{ balance, publicId, loading, available, error, refresh, applyBalance, applyServerBalance }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function formatPlayerMoney(balance: number, available: boolean, loading?: boolean): string {
  if (loading) return '…';
  if (!available) return 'недоступен';
  return `${Number(balance).toLocaleString('ru-RU')} TMTM`;
}
