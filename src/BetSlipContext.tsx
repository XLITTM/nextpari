import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { addSlipSelection, removeSlipSelection } from './lib/sportsPlaceSlip';
import type { BetSelection } from './types';

interface BetSlipContextValue {
  selections: BetSelection[];
  addSelection: (selection: BetSelection) => void;
  removeSelection: (matchId: string, outcome: string) => void;
  clearAll: () => void;
  applyOddsUpdates: (updates: { id: string; odds: number }[]) => void;
  isSelectionActive: (matchId: string, outcome: string, market?: string) => boolean;
  count: number;
}

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const addSelection = useCallback((selection: BetSelection) => {
    setSelections((prev) => addSlipSelection(prev, selection));
  }, []);

  const removeSelection = useCallback((matchId: string, outcome: string) => {
    setSelections((prev) => removeSlipSelection(prev, matchId, outcome));
  }, []);

  const clearAll = useCallback(() => setSelections([]), []);

  const applyOddsUpdates = useCallback((updates: { id: string; odds: number }[]) => {
    if (!updates.length) return;
    const byId = new Map(updates.map((row) => [row.id, row.odds]));
    setSelections((prev) =>
      prev.map((row) => {
        const nextOdds = byId.get(row.id);
        return nextOdds != null ? { ...row, odds: nextOdds } : row;
      }),
    );
  }, []);

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
      value={{ selections, addSelection, removeSelection, clearAll, applyOddsUpdates, isSelectionActive, count: selections.length }}
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
