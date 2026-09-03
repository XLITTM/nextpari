import type { BetSelection } from '../types';
import { acceptLsportsSelection } from './sportsOddGuard';

export const ODD_LONG_PRESS_MS = 520;
export const ODD_MOVE_CANCEL_PX = 12;

export type OddPressAction = 'quickBet' | 'coupon' | 'blocked' | 'none';

export interface OddPressEvent {
  type: 'down' | 'move' | 'up' | 'cancel' | 'click';
  x?: number;
  y?: number;
  now?: number;
}

export function createOddPressController(options: {
  selection: BetSelection;
  now?: () => number;
  longPressMs?: number;
  onQuickBet: (selection: BetSelection) => void;
  onCoupon: (selection: BetSelection) => void;
}) {
  const longPressMs = options.longPressMs ?? ODD_LONG_PRESS_MS;
  const now = options.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let startX = 0;
  let startY = 0;
  let holding = false;
  let longPressFired = false;
  let suppressClick = false;

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function accepted(): BetSelection | null {
    return acceptLsportsSelection(options.selection);
  }

  function handle(event: OddPressEvent): OddPressAction {
    if (event.type === 'down') {
      const selection = accepted();
      if (!selection) return 'blocked';
      holding = true;
      longPressFired = false;
      suppressClick = false;
      startedAt = event.now ?? now();
      startX = event.x ?? 0;
      startY = event.y ?? 0;
      clearTimer();
      timer = setTimeout(() => {
        if (!holding || longPressFired) return;
        const next = accepted();
        if (!next) return;
        longPressFired = true;
        suppressClick = true;
        options.onCoupon(next);
      }, longPressMs);
      return 'none';
    }

    if (event.type === 'move' && holding) {
      const dx = (event.x ?? startX) - startX;
      const dy = (event.y ?? startY) - startY;
      if ((dx * dx) + (dy * dy) > ODD_MOVE_CANCEL_PX * ODD_MOVE_CANCEL_PX) {
        holding = false;
        suppressClick = true;
        clearTimer();
      }
      return 'none';
    }

    if (event.type === 'cancel') {
      holding = false;
      suppressClick = true;
      clearTimer();
      return 'none';
    }

    if (event.type === 'up') {
      const wasHolding = holding;
      const wasLong = longPressFired;
      holding = false;
      clearTimer();
      if (!wasHolding || wasLong) {
        if (wasLong) suppressClick = true;
        return wasLong ? 'coupon' : 'none';
      }
      const elapsed = (event.now ?? now()) - startedAt;
      if (elapsed >= longPressMs) {
        const selection = accepted();
        if (!selection) return 'blocked';
        longPressFired = true;
        suppressClick = true;
        options.onCoupon(selection);
        return 'coupon';
      }
      suppressClick = true;
      const selection = accepted();
      if (!selection) return 'blocked';
      options.onQuickBet(selection);
      return 'quickBet';
    }

    if (event.type === 'click') {
      if (suppressClick || longPressFired) {
        suppressClick = false;
        return 'none';
      }
      const selection = accepted();
      if (!selection) return 'blocked';
      options.onQuickBet(selection);
      return 'quickBet';
    }

    return 'none';
  }

  return {
    handle,
    dispose: clearTimer,
    get suppressedClick() {
      return suppressClick || longPressFired;
    },
  };
}
