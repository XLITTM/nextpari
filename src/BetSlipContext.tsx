import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { BetSelection } from './types';

interface BetSlipContextValue {
  selections: BetSelection[];
  addSelection: (selection: BetSelection) => void;
  removeSelection: (matchId: string, outcome: string) => void;
  clearAll: () => void;
  isSelectionActive: (matchId: string, outcome: string, market?: string) => boolean;
  count: number;
}

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const addSelection = useCallback((selection: BetSelection) => {
    setSelections((prev) => {
      if (prev.some((row) => row.id === selection.id)) {
        return prev.filter((row) => row.id !== selection.id);
      }
      return [...prev.filter((row) => row.matchId !== selection.matchId), selection];
    });
  }, []);

  const removeSelection = useCallback((matchId: string, outcome: string) => {
    setSelections((prev) =>
      prev.filter((s) => !(s.matchId === matchId && s.outcome === outcome))
    );
  }, []);

  const clearAll = useCallback(() => setSelections([]), []);

  const isSelectionActive = useCallback(
    (matchId: string, outcome: string, market?: string) =>
      selections.some(
        (row) =>
          row.matchId === matchId &&
          row.outcome === outcome &&
          (market ? row.market === market : true),
      ),
    [selections],
  );

  return (
    <BetSlipContext.Provider
      value={{ selections, addSelection, removeSelection, clearAll, isSelectionActive, count: selections.length }}
    >
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error('useBetSlip must be used within BetSlipProvider');
  return ctx;
}
