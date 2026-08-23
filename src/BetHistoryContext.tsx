import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchBets } from './lib/bets';
import type { BetHistoryEntry } from './types';

interface BetHistoryContextValue {
  entries: BetHistoryEntry[];
  loading: boolean;
  addBet: (entry: BetHistoryEntry) => void;
  refresh: () => Promise<void>;
}

const BetHistoryContext = createContext<BetHistoryContextValue | null>(null);

export function BetHistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<BetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchBets();
    setEntries(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addBet = useCallback((entry: BetHistoryEntry) => {
    setEntries((prev) => [entry, ...prev]);
  }, []);

  return (
    <BetHistoryContext.Provider value={{ entries, loading, addBet, refresh }}>
      {children}
    </BetHistoryContext.Provider>
  );
}

export function useBetHistory() {
  const ctx = useContext(BetHistoryContext);
  if (!ctx) throw new Error('useBetHistory must be used within BetHistoryProvider');
  return ctx;
}
