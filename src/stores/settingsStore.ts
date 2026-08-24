import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OddsChangePolicy } from '../lib/liveMarketCheck';

interface SettingsStore {
  oddsChangePolicy: OddsChangePolicy;
  setOddsChangePolicy: (policy: OddsChangePolicy) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      oddsChangePolicy: 'increase',
      setOddsChangePolicy: (oddsChangePolicy) => set({ oddsChangePolicy }),
    }),
    { name: 'nextpari-settings' },
  ),
);
