import { useEffect, useMemo, useRef } from 'react';
import type { BetSelection } from '../types';
import { useBetSlip } from '../BetSlipContext';
import { useQuickBet } from '../QuickBetContext';
import { createOddPressController } from '../lib/oddPressController';
import { acceptLsportsSelection } from '../lib/sportsOddGuard';

export function useOddInteraction(selection: BetSelection) {
  const { addSelection } = useBetSlip();
  const { openQuickBet } = useQuickBet();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const controller = useMemo(
    () => createOddPressController({
      get selection() {
        return selectionRef.current;
      },
      onQuickBet: (next) => openQuickBet(next),
      onCoupon: (next) => addSelection(next),
    }),
    [addSelection, openQuickBet],
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const coords = (event: { clientX: number; clientY: number }) => ({
    x: event.clientX,
    y: event.clientY,
  });

  const stop = (event: { preventDefault?: () => void; stopPropagation: () => void }) => {
    event.preventDefault?.();
    event.stopPropagation();
  };

  return {
    onPointerDown: (event: React.PointerEvent) => {
      stop(event);
      controller.handle({ type: 'down', ...coords(event) });
    },
    onPointerMove: (event: React.PointerEvent) => {
      event.stopPropagation();
      controller.handle({ type: 'move', ...coords(event) });
    },
    onPointerUp: (event: React.PointerEvent) => {
      stop(event);
      controller.handle({ type: 'up', ...coords(event) });
    },
    onPointerCancel: (event: React.PointerEvent) => {
      event.stopPropagation();
      controller.handle({ type: 'cancel' });
    },
    onPointerLeave: (event: React.PointerEvent) => {
      event.stopPropagation();
      controller.handle({ type: 'cancel' });
    },
    onClick: (event: React.MouseEvent) => {
      stop(event);
      controller.handle({ type: 'click' });
    },
    onContextMenu: (event: React.MouseEvent) => {
      stop(event);
    },
    onTouchStart: (event: React.TouchEvent) => {
      event.stopPropagation();
    },
  };
}

export function canInteractWithOdd(selection: BetSelection): boolean {
  return acceptLsportsSelection(selection) != null;
}
