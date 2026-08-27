import { create } from 'zustand';
import {
  adjustCashierBalanceDirect,
  cashiersOfManager,
  peekNetworkCashiers,
  peekNetworkManagers,
  subscribeNetworkSync,
  toggleCashierBlock,
  type BackofficeCashier,
  type CashierBlockedBy,
  type NetworkManager,
} from '../lib/backoffice';
import { useHierarchyStore } from './hierarchyStore';

export type { CashierBlockedBy };

interface BackofficeNetworkState {
  cashiers: BackofficeCashier[];
  managers: NetworkManager[];
  hydrate: () => void;
  agentsOf: (managerId: string) => BackofficeCashier[];
  toggleAgentBlockStatus: (agentId: string, blockedBy: CashierBlockedBy) => BackofficeCashier;
  updateAgentBalance: (agentId: string, amount: number) => BackofficeCashier;
}

function mirrorHierarchyAgent(cashier: BackofficeCashier) {
  const staff = useHierarchyStore.getState().staff;
  if (!staff.some((row) => row.role === 'AGENT' && row.login === cashier.login)) return;
  useHierarchyStore.setState({
    staff: staff.map((row) => (
      row.role === 'AGENT' && row.login === cashier.login
        ? {
            ...row,
            balance: cashier.floatBalance,
            blocked: !cashier.isActive,
            blockedBy: cashier.blockedBy,
          }
        : row
    )),
  });
}

export const useBackofficeStore = create<BackofficeNetworkState>((set, get) => ({
  cashiers: peekNetworkCashiers(),
  managers: peekNetworkManagers(),
  hydrate: () => set({
    cashiers: peekNetworkCashiers(),
    managers: peekNetworkManagers(),
  }),
  agentsOf: (managerId) => get().cashiers.filter((row) => row.managerId === managerId),
  toggleAgentBlockStatus: (agentId, blockedBy) => {
    const next = toggleCashierBlock(agentId, blockedBy);
    mirrorHierarchyAgent(next);
    get().hydrate();
    return next;
  },
  updateAgentBalance: (agentId, amount) => {
    const next = adjustCashierBalanceDirect(agentId, amount);
    mirrorHierarchyAgent(next);
    get().hydrate();
    return next;
  },
}));

if (typeof window !== 'undefined') {
  subscribeNetworkSync(() => useBackofficeStore.getState().hydrate());
}

export function toggleAgentBlockStatus(agentId: string, blockedBy: CashierBlockedBy) {
  return useBackofficeStore.getState().toggleAgentBlockStatus(agentId, blockedBy);
}

export function updateAgentBalance(agentId: string, amount: number) {
  return useBackofficeStore.getState().updateAgentBalance(agentId, amount);
}

export function agentsOfManager(managerId: string) {
  return cashiersOfManager(managerId);
}
