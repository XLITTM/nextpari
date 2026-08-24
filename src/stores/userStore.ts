import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEMO_BALANCE, DEMO_PUBLIC_ID, ensureLocalGuest, persistLocalBalance } from '@/lib/playerProfile';

interface UserStore {
  publicId: string;
  balance: number;
  walletId: string | null;
  lastWriteAt: number;
  hydrate: (payload: { publicId: string; balance: number; walletId: string | null }) => void;
  setBalance: (balance: number) => void;
  debit: (amount: number) => boolean;
  deductBalance: (amount: number) => boolean;
  credit: (amount: number) => void;
}

function readPersistedUser(): { publicId: string; balance: number; walletId: string | null } | null {
  try {
    const raw = localStorage.getItem('user-store');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { publicId?: string; balance?: number; walletId?: string | null } };
    const state = parsed.state ?? (parsed as { publicId?: string; balance?: number; walletId?: string | null });
    const publicId = String(state.publicId ?? '').replace(/\D/g, '');
    const balance = Number(state.balance);
    if (!publicId && !(balance > 0)) return null;
    return {
      publicId: publicId || DEMO_PUBLIC_ID,
      balance: balance > 0 ? balance : DEMO_BALANCE,
      walletId: state.walletId ?? null,
    };
  } catch {
    return null;
  }
}

function bootUser() {
  if (typeof window === 'undefined') {
    return { publicId: DEMO_PUBLIC_ID, balance: DEMO_BALANCE, walletId: null as string | null };
  }
  const persisted = readPersistedUser();
  const guest = ensureLocalGuest();
  return {
    publicId: persisted?.publicId || guest.publicId || DEMO_PUBLIC_ID,
    balance: persisted?.balance || guest.demoBalance || DEMO_BALANCE,
    walletId: persisted?.walletId ?? guest.walletId,
  };
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      ...bootUser(),
      lastWriteAt: 0,
      hydrate: (payload) =>
        set({
          publicId: payload.publicId || get().publicId || DEMO_PUBLIC_ID,
          balance: payload.balance >= 0 ? payload.balance : get().balance > 0 ? get().balance : DEMO_BALANCE,
          walletId: payload.walletId ?? get().walletId,
        }),
      setBalance: (balance) => {
        const next = Number(Math.max(0, balance).toFixed(2));
        if (!Number.isFinite(next)) return;
        persistLocalBalance(next);
        set({ balance: next, lastWriteAt: Date.now() });
      },
      debit: (amount) => {
        const stake = Number(amount);
        if (!Number.isFinite(stake) || stake <= 0) return false;
        const current = get().balance;
        if (current < stake) return false;
        const next = Number((current - stake).toFixed(2));
        persistLocalBalance(next);
        set({ balance: next, lastWriteAt: Date.now() });
        return true;
      },
      deductBalance: (amount) => get().debit(amount),
      credit: (amount) => {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) return;
        const next = Number((get().balance + value).toFixed(2));
        persistLocalBalance(next);
        set({ balance: next, lastWriteAt: Date.now() });
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({
        publicId: state.publicId,
        balance: state.balance,
        walletId: state.walletId,
      }),
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<UserStore>;
        return {
          ...current,
          publicId: incoming.publicId || current.publicId || DEMO_PUBLIC_ID,
          balance:
            incoming.balance && incoming.balance > 0
              ? incoming.balance
              : current.balance > 0
                ? current.balance
                : DEMO_BALANCE,
          walletId: incoming.walletId ?? current.walletId,
        };
      },
    },
  ),
);
