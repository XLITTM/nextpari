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
import { useHierarchyStore, type StaffMember } from './hierarchyStore';

export type { CashierBlockedBy };

type ManagerRef = string | { id?: string | null; login?: string | null } | null | undefined;

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

function managerRefParts(ref: ManagerRef): { id: string; login: string } {
  if (ref == null) return { id: '', login: '' };
  if (typeof ref === 'string') return { id: ref.trim(), login: ref.trim().toLowerCase() };
  return {
    id: String(ref.id ?? '').trim(),
    login: String(ref.login ?? '').trim().toLowerCase(),
  };
}

function managerMatchKeys(manager: { id?: string | null; login?: string | null } | null, extra: string[] = []): Set<string> {
  return new Set(
    [manager?.id, manager?.login, ...extra].filter((value): value is string => Boolean(value)),
  );
}

function staffToCashier(row: StaffMember): BackofficeCashier {
  return {
    id: row.id,
    login: row.login,
    fullName: row.fullName,
    city: row.city ?? '',
    pointName: row.pointName ?? 'Касса',
    floatBalance: Number(row.balance) || 0,
    commissionEarned: Number(row.commissionEarned) || 0,
    commissionRate: Number(row.commissionRate) || 1,
    isActive: !row.blocked,
    blockedBy: row.blockedBy ?? null,
    dailyTurnover: 0,
    networkId: null,
    managerId: row.managerId ?? null,
  };
}

function staffToManager(row: StaffMember): NetworkManager {
  return {
    id: row.id,
    login: row.login,
    fullName: row.fullName,
    region: row.region ?? '',
    allocatedBalance: Number(row.balance) || 0,
    networkId: '',
    networkName: row.region || 'Сеть',
    isActive: !row.blocked,
    createdAt: row.createdAt,
    cashierCount: 0,
  };
}

function resolveNetworkManager(
  managers: NetworkManager[],
  staff: StaffMember[],
  ref: ManagerRef,
): NetworkManager | null {
  const { id, login } = managerRefParts(ref);
  const fromNetwork =
    (id ? managers.find((row) => row.id === id) : undefined)
    ?? (login ? managers.find((row) => row.login.toLowerCase() === login) : undefined)
    ?? null;
  if (fromNetwork) return fromNetwork;
  const fromStaff = staff.find((row) => (
    row.role === 'MANAGER'
    && ((id && row.id === id) || (login && row.login.toLowerCase() === login))
  ));
  return fromStaff ? staffToManager(fromStaff) : null;
}

function cashiersForManager(
  cashiers: BackofficeCashier[],
  staff: StaffMember[],
  manager: NetworkManager | null,
  ref: ManagerRef,
): BackofficeCashier[] {
  const { id, login } = managerRefParts(ref);
  const keys = managerMatchKeys(manager, [id, login]);
  const fromNetwork = (cashiers ?? []).filter((row) => Boolean(row.managerId && keys.has(row.managerId)));
  const fromStaff = staff.filter((row) => (
    row.role === 'AGENT' && Boolean(row.managerId && keys.has(row.managerId))
  ));
  const byLogin = new Map<string, BackofficeCashier>();
  for (const row of fromNetwork) byLogin.set(row.login.toLowerCase(), row);
  for (const row of fromStaff) {
    const key = row.login.toLowerCase();
    if (!byLogin.has(key)) byLogin.set(key, staffToCashier(row));
  }
  return [...byLogin.values()];
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
  agentsOf: (managerId) => cashiersForManager(get().cashiers ?? [], [], resolveNetworkManager(get().managers ?? [], [], managerId), managerId),
  managerLimit: (managerId) => {
    const manager = resolveNetworkManager(get().managers ?? [], [], managerId);
    return Number(manager?.allocatedBalance ?? managerLimitOf(manager?.id ?? managerId ?? '')) || 0;
  },
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

export function useManagerNetwork(sessionOrId: ManagerRef) {
  const cashiers = useBackofficeStore((s) => s.cashiers);
  const managers = useBackofficeStore((s) => s.managers);
  const hydrate = useBackofficeStore((s) => s.hydrate);
  const staff = useHierarchyStore((s) => s.staff);
  const currentManager = resolveNetworkManager(managers ?? [], staff ?? [], sessionOrId);
  const managerAgents = cashiersForManager(cashiers ?? [], staff ?? [], currentManager, sessionOrId);
  const { id, login } = managerRefParts(sessionOrId);
  const hierarchyBalance = staff.find((row) => (
    row.role === 'MANAGER' && ((id && row.id === id) || (login && row.login.toLowerCase() === login))
  ))?.balance;
  const limit = Number(
    currentManager?.allocatedBalance
    ?? hierarchyBalance
    ?? managerLimitOf(currentManager?.id ?? id || login),
  ) || 0;
  return { managerAgents, currentManager, limit, hydrate };
}
