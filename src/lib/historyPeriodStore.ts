import { useSyncExternalStore } from 'react';
import type { HistoryPeriodSelection } from './historyPeriodFilter';

const DEFAULT_PERIOD: HistoryPeriodSelection = { kind: 'all' };

let current: HistoryPeriodSelection = DEFAULT_PERIOD;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getHistoryPeriodSelection(): HistoryPeriodSelection {
  return current;
}

export function setHistoryPeriodSelection(next: HistoryPeriodSelection) {
  current = {
    kind: next.kind,
    from: next.from,
    to: next.to,
  };
  emit();
}

export function subscribeHistoryPeriodSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHistoryPeriodSelection(): HistoryPeriodSelection {
  return useSyncExternalStore(
    subscribeHistoryPeriodSelection,
    getHistoryPeriodSelection,
    getHistoryPeriodSelection,
  );
}
