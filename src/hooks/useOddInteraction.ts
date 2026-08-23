import { useCallback } from 'react';
import type { BetSelection } from '../types';
import { useBetSlip } from '../BetSlipContext';

export function useOddInteraction(selection: BetSelection) {
  const { addSelection } = useBetSlip();

  const stop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      addSelection(selection);
    },
    [addSelection, selection]
  );

  return {
    onClick,
    onPointerDown: stop,
    onPointerUp: stop,
    onPointerMove: stop,
    onPointerLeave: stop,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onTouchStart: stop,
  };
}
