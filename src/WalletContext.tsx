import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchWallet } from './lib/bets';

interface WalletContextValue {
  balance: number;
  publicId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyBalance: (next: number) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const wallet = await fetchWallet();
    if (wallet) {
      setBalance(wallet.balance);
      setPublicId(wallet.publicId);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyBalance = useCallback((next: number) => {
    setBalance(next);
  }, []);

  return (
    <WalletContext.Provider value={{ balance, publicId, loading, refresh, applyBalance }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
