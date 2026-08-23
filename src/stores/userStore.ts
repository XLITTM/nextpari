import { create } from 'zustand';

interface UserStore {
  publicId: string;
  balance: number;
  walletId: string | null;
  hydrate: (payload: { publicId: string; balance: number; walletId: string | null }) => void;
  setBalance: (balance: number) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  publicId: '',
  balance: 0,
  walletId: null,
  hydrate: (payload) => set(payload),
  setBalance: (balance) => set({ balance }),
}));
