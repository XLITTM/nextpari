import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ensureLocalGuest } from '@/lib/playerProfile';

interface UserStore {
  publicId: string;
  balance: number;
  walletId: string | null;
  hydrate: (payload: { publicId: string; balance: number; walletId: string | null }) => void;
  setBalance: (balance: number) => void;
}

function bootUser() {
  if (typeof window === 'undefined') {
    return { publicId: '', balance: 0, walletId: null as string | null };
  }
  const guest = ensureLocalGuest();
  return {
    publicId: guest.publicId,
    balance: guest.demoBalance,
    walletId: guest.walletId,
  };
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      ...bootUser(),
      hydrate: (payload) => set(payload),
      setBalance: (balance) => set({ balance }),
    }),
    {
      name: 'nextpari-user',
      partialize: (state) => ({
        publicId: state.publicId,
        balance: state.balance,
        walletId: state.walletId,
      }),
    },
  ),
);
