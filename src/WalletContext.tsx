import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import {
  persistLocalBalance,
  syncPlayerWallet,
  WALLET_SYNC_EVENT,
  ensureLocalGuest,
  DEMO_PUBLIC_ID,
} from './lib/playerProfile';
import { useUserStore } from './stores/userStore';

interface WalletContextValue {
  balance: number;
  publicId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyBalance: (next: number) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function readCachedWallet() {
  const guest = ensureLocalGuest();
  const stored = useUserStore.getState();
  return {
    publicId: stored.publicId || guest.publicId,
    balance: stored.balance || guest.demoBalance,
    walletId: stored.walletId || guest.walletId,
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const cached = readCachedWallet();
  const [balance, setBalance] = useState(cached.balance);
  const [publicId, setPublicId] = useState<string | null>(cached.publicId);
  const [walletId, setWalletId] = useState<string | null>(cached.walletId);
  const [loading, setLoading] = useState(false);
  const hydrate = useUserStore((state) => state.hydrate);
  const setStoreBalance = useUserStore((state) => state.setBalance);
  const walletIdRef = useRef<string | null>(cached.walletId);

  const applySnapshot = useCallback(
    (next: { publicId: string; balance: number; walletId: string | null }) => {
      setPublicId(next.publicId || DEMO_PUBLIC_ID);
      setBalance((prev) => (next.balance > 0 ? next.balance : prev > 0 ? prev : 1000));
      setWalletId(next.walletId);
      walletIdRef.current = next.walletId;
      persistLocalBalance(next.balance > 0 ? next.balance : useUserStore.getState().balance || 1000);
      hydrate({
        publicId: next.publicId || DEMO_PUBLIC_ID,
        balance: next.balance > 0 ? next.balance : useUserStore.getState().balance || 1000,
        walletId: next.walletId,
      });
    },
    [hydrate],
  );

  const refresh = useCallback(async () => {
    const snapshot = await syncPlayerWallet();
    applySnapshot(snapshot);
    setLoading(false);
  }, [applySnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSync = () => {
      void refresh();
    };
    window.addEventListener(WALLET_SYNC_EVENT, onSync);
    window.addEventListener('focus', onSync);
    document.addEventListener('visibilitychange', onSync);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(WALLET_SYNC_EVENT);
      channel.onmessage = onSync;
    } catch {
      channel = null;
    }

    const poll = window.setInterval(() => {
      void refresh();
    }, 8000);

    return () => {
      window.removeEventListener(WALLET_SYNC_EVENT, onSync);
      window.removeEventListener('focus', onSync);
      document.removeEventListener('visibilitychange', onSync);
      channel?.close();
      window.clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    const filter = walletId ? `id=eq.${walletId}` : publicId ? `public_id=eq.${publicId}` : undefined;
    const live = supabase
      .channel(`wallet-live-${walletId ?? publicId ?? 'guest'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string; balance?: number; public_id?: string } | undefined;
          if (!row) return;
          if (walletIdRef.current && row.id && row.id !== walletIdRef.current) return;
          if (typeof row.balance === 'number' && row.balance > 0) {
            setBalance(row.balance);
            persistLocalBalance(row.balance);
            setStoreBalance(row.balance);
          }
          if (row.public_id) setPublicId(String(row.public_id).replace(/\D/g, '') || publicId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(live);
    };
  }, [publicId, setStoreBalance, walletId]);

  const applyBalance = useCallback(
    (next: number) => {
      const safe = Number(Math.max(0, next).toFixed(2));
      setBalance(safe);
      persistLocalBalance(safe);
      setStoreBalance(safe);
    },
    [setStoreBalance],
  );

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
