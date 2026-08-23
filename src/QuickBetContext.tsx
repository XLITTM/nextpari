import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { BetSelection } from './types';

interface QuickBetContextValue {
  pendingSelection: BetSelection | null;
  openQuickBet: (selection: BetSelection) => void;
  closeQuickBet: () => void;
}

const QuickBetContext = createContext<QuickBetContextValue | null>(null);

export function QuickBetProvider({ children }: { children: ReactNode }) {
  const [pendingSelection, setPendingSelection] = useState<BetSelection | null>(null);

  const openQuickBet = useCallback((selection: BetSelection) => {
    setPendingSelection(selection);
  }, []);

  const closeQuickBet = useCallback(() => {
    setPendingSelection(null);
  }, []);

  return (
    <QuickBetContext.Provider value={{ pendingSelection, openQuickBet, closeQuickBet }}>
      {children}
    </QuickBetContext.Provider>
  );
}

export function useQuickBet() {
  const ctx = useContext(QuickBetContext);
  if (!ctx) throw new Error('useQuickBet must be used within QuickBetProvider');
  return ctx;
}
