import { create } from 'zustand';

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
  reset: () => void;
}

const EMPTY = {
  publicId: '',
  balance: 0,
  walletId: null as string | null,
  lastWriteAt: 0,
};

export const useUserStore = create<UserStore>()((set) => ({
  ...EMPTY,
  hydrate: (payload) =>
    set({
      publicId: payload.publicId || '',
      balance: Number.isFinite(payload.balance) ? payload.balance : 0,
      walletId: payload.walletId ?? null,
    }),
  setBalance: () => undefined,
  debit: () => false,
  deductBalance: () => false,
  credit: () => undefined,
  reset: () => set({ ...EMPTY }),
}));
