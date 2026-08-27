import { create } from 'zustand';
import {
  adjustCashierBalanceDirect,
  cashiersOfManager,
  managerCollectCashier,
  managerCreditCashier,
  managerLimitOf,
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
  managerLimit: (managerId: string) => number;
  toggleAgentBlockStatus: (agentId: string, blockedBy: CashierBlockedBy) => BackofficeCashier;
  updateAgentBalance: (agentId: string, amount: number) => BackofficeCashier;
  creditAgentFromLimit: (managerId: string, agentId: string, amount: number) => BackofficeCashier;
  collectAgentToManager: (managerId: string, agentId: string, amount: number) => BackofficeCashier;
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
  cashiers: peekNetworkCashiers() ?? [],
  managers: peekNetworkManagers() ?? [],
  hydrate: () => set({
    cashiers: peekNetworkCashiers() ?? [],
    managers: peekNetworkManagers() ?? [],
  }),
  agentsOf: (managerId) => (get().cashiers ?? []).filter((row) => row?.managerId === managerId),
  managerLimit: (managerId) => Number(managerLimitOf(managerId ?? '')) || 0,
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
  creditAgentFromLimit: (managerId, agentId, amount) => {
    const next = managerCreditCashier(managerId, agentId, amount);
    mirrorHierarchyAgent(next);
    get().hydrate();
    return next;
  },
  collectAgentToManager: (managerId, agentId, amount) => {
    const next = managerCollectCashier(managerId, agentId, amount);
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

export function creditAgentFromLimit(managerId: string, agentId: string, amount: number) {
  return useBackofficeStore.getState().creditAgentFromLimit(managerId, agentId, amount);
}

export function collectAgentToManager(managerId: string, agentId: string, amount: number) {
  return useBackofficeStore.getState().collectAgentToManager(managerId, agentId, amount);
}

export function useManagerNetwork(managerId: string | null | undefined) {
  const cashiers = useBackofficeStore((s) => s.cashiers);
  const managers = useBackofficeStore((s) => s.managers);
  const hydrate = useBackofficeStore((s) => s.hydrate);
  const managerAgents = (cashiers ?? []).filter((row) => row?.managerId === managerId);
  const currentManager = (managers ?? []).find((row) => row?.id === managerId) ?? null;
  const limit = Number(currentManager?.allocatedBalance ?? managerLimitOf(managerId ?? '')) || 0;
  return { managerAgents, currentManager, limit, hydrate };
}
