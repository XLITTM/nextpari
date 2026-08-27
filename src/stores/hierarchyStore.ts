import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StaffRole } from '../routes/portal';

export type HierarchyOpType =
  | 'manager_credit'
  | 'manager_debit'
  | 'agent_credit'
  | 'player_deposit'
  | 'player_payout'
  | 'cashier_bet'
  | 'shift_close';

export interface StaffMember {
  id: string;
  login: string;
  password: string;
  fullName: string;
  role: StaffRole;
  region?: string;
  managerId?: string | null;
  city?: string;
  pointName?: string;
  balance: number;
  commissionRate: number;
  commissionEarned: number;
  createdAt: string;
  blocked?: boolean;
  blockedBy?: 'owner' | 'manager' | null;
}

export interface NetworkPlayer {
  id: string;
  publicId: string;
  phone: string;
  name: string;
  balance: number;
  agentId: string | null;
}

export interface HierarchyOp {
  id: string;
  type: HierarchyOpType;
  actorId: string;
  targetId: string;
  amount: number;
  note: string;
  createdAt: string;
  shiftId?: string;
}

export interface CashShift {
  id: string;
  agentId: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  closingFloat: number | null;
  deposits: number;
  payouts: number;
  bets: number;
}

interface HierarchyState {
  staff: StaffMember[];
  players: NetworkPlayer[];
  ops: HierarchyOp[];
  shifts: CashShift[];
  sportRevenue: number;
  casinoRevenue: number;
  findStaff: (login: string, password: string) => StaffMember | undefined;
  staffById: (id: string) => StaffMember | undefined;
  managers: () => StaffMember[];
  agentsOf: (managerId: string) => StaffMember[];
  allAgents: () => StaffMember[];
  createManager: (params: {
    login: string;
    password: string;
    fullName: string;
    region: string;
    deposit: number;
  }) => StaffMember;
  adjustManager: (managerId: string, amount: number, actorId: string) => void;
  createAgent: (params: {
    managerId: string;
    login: string;
    password: string;
    fullName: string;
    city: string;
    pointName: string;
    float: number;
  }) => StaffMember;
  creditAgent: (managerId: string, agentId: string, amount: number) => void;
  findPlayer: (query: string) => NetworkPlayer | undefined;
  depositPlayer: (agentId: string, query: string, amount: number) => HierarchyOp;
  payoutPlayer: (agentId: string, query: string, amount: number) => HierarchyOp;
  placeCashierBet: (agentId: string, query: string, amount: number) => HierarchyOp;
  openShift: (agentId: string) => CashShift;
  closeShift: (agentId: string) => CashShift;
  shiftOps: (agentId: string) => HierarchyOp[];
  managerTurnover: (managerId: string) => { turnover: number; commission: number; deposits: number };
  toggleAgentBlockStatus: (agentId: string, blockedBy: 'owner' | 'manager') => void;
  updateAgentBalance: (agentId: string, amount: number) => void;
}

const OWNER_ID = 'staff-owner';
const M1 = 'staff-manager-1';
const M2 = 'staff-manager-2';
const A1 = 'staff-agent-1';
const A2 = 'staff-agent-2';
const A3 = 'staff-agent-3';

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function requireAgent(staff: StaffMember[], agentId: string) {
  const agent = staff.find((row) => row.id === agentId && row.role === 'AGENT');
  if (!agent) throw new Error('Касса не найдена');
  return agent;
}

function seed(): Pick<HierarchyState, 'staff' | 'players' | 'ops' | 'shifts' | 'sportRevenue' | 'casinoRevenue'> {
  return {
    sportRevenue: 18420,
    casinoRevenue: 9630,
    staff: [
      {
        id: OWNER_ID,
        login: 'owner',
        password: '0000',
        fullName: 'Владелец NextPari',
        role: 'OWNER',
        balance: 250000,
        commissionRate: 0,
        commissionEarned: 0,
        createdAt: '2026-01-10T08:00:00.000Z',
      },
      {
        id: M1,
        login: 'manager01',
        password: '1111',
        fullName: 'Мерет Аннаев',
        role: 'MANAGER',
        region: 'Ашхабад',
        balance: 42000,
        commissionRate: 8,
        commissionEarned: 1860,
        createdAt: '2026-03-01T09:00:00.000Z',
      },
      {
        id: M2,
        login: 'manager02',
        password: '2222',
        fullName: 'Айна Оразова',
        role: 'MANAGER',
        region: 'Мары',
        balance: 18500,
        commissionRate: 8,
        commissionEarned: 740,
        createdAt: '2026-04-12T09:00:00.000Z',
      },
      {
        id: A1,
        login: 'agent01',
        password: '1234',
        fullName: 'Азат Мередов',
        role: 'AGENT',
        managerId: M1,
        region: 'Ашхабад',
        city: 'Ашхабад',
        pointName: 'Точка №12 · ул. Махтумкули',
        balance: 5000,
        commissionRate: 1,
        commissionEarned: 142.5,
        createdAt: '2026-05-02T10:00:00.000Z',
      },
      {
        id: A2,
        login: 'agent02',
        password: '1234',
        fullName: 'Гульшат Бердыева',
        role: 'AGENT',
        managerId: M2,
        region: 'Мары',
        city: 'Мары',
        pointName: 'Точка №3 · базар «Гёкдепе»',
        balance: 2800,
        commissionRate: 1,
        commissionEarned: 86.4,
        createdAt: '2026-05-18T10:00:00.000Z',
      },
      {
        id: A3,
        login: 'agent03',
        password: '1234',
        fullName: 'Сердар Халлыев',
        role: 'AGENT',
        managerId: M1,
        region: 'Ашхабад',
        city: 'Ашхабад',
        pointName: 'Точка №4 · ТЦ «Беркарар»',
        balance: 3100,
        commissionRate: 1,
        commissionEarned: 98,
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ],
    players: [
      { id: 'pl-1', publicId: '729767', phone: '99365111122', name: 'Wiktoriya S.', balance: 1000, agentId: A1 },
      { id: 'pl-2', publicId: '645912', phone: '99365443210', name: 'Батыр М.', balance: 420, agentId: A1 },
      { id: 'pl-3', publicId: '882341', phone: '99364900011', name: 'Мая Н.', balance: 80, agentId: A2 },
    ],
    ops: [
      {
        id: 'op-1',
        type: 'player_deposit',
        actorId: A1,
        targetId: 'pl-2',
        amount: 200,
        note: 'Депозит игрока 645912',
        createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
        shiftId: 'shift-open-a1',
      },
      {
        id: 'op-2',
        type: 'player_payout',
        actorId: A1,
        targetId: 'pl-1',
        amount: 150,
        note: 'Выплата игроку 729767',
        createdAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
        shiftId: 'shift-open-a1',
      },
      {
        id: 'op-3',
        type: 'cashier_bet',
        actorId: A1,
        targetId: 'pl-1',
        amount: 50,
        note: 'Ставка от кассы',
        createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
        shiftId: 'shift-open-a1',
      },
    ],
    shifts: [
      {
        id: 'shift-open-a1',
        agentId: A1,
        openedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
        closedAt: null,
        openingFloat: 4900,
        closingFloat: null,
        deposits: 200,
        payouts: 150,
        bets: 50,
      },
    ],
  };
}

export const useHierarchyStore = create<HierarchyState>()(
  persist(
    (set, get) => {
      const ensureShift = (agentId: string): CashShift => {
        const existing = get().shifts.find((row) => row.agentId === agentId && !row.closedAt);
        if (existing) return existing;
        const agent = requireAgent(get().staff, agentId);
        const shift: CashShift = {
          id: uid('shift'),
          agentId,
          openedAt: nowIso(),
          closedAt: null,
          openingFloat: agent.balance,
          closingFloat: null,
          deposits: 0,
          payouts: 0,
          bets: 0,
        };
        set({ shifts: [shift, ...get().shifts] });
        return shift;
      };

      const tillOp = (agentId: string, query: string, amount: number, type: 'player_deposit' | 'player_payout' | 'cashier_bet') => {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) throw new Error('Укажите сумму');
        const agent = requireAgent(get().staff, agentId);
        if (agent.blocked) throw new Error('Касса заблокирована. Депозиты и выплаты недоступны.');
        if (agent.balance < value) throw new Error('Недостаточно средств в кассе');
        const q = query.replace(/\s+/g, '').toLowerCase();
        let player = get().players.find(
          (row) =>
            row.publicId === q ||
            row.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
            row.publicId.includes(q),
        );
        if (!player) {
          if (type !== 'player_deposit') throw new Error('Игрок не найден');
          const publicId = query.replace(/\D/g, '').slice(-6) || uid('pid').replace(/\D/g, '').slice(-6);
          player = {
            id: uid('pl'),
            publicId: publicId || uid('id').slice(-6),
            phone: q.replace(/\D/g, ''),
            name: `Игрок ${publicId}`,
            balance: 0,
            agentId,
          };
        }
        if (type === 'player_payout' && player.balance < value) {
          throw new Error('Недостаточно средств на счёте игрока');
        }
        const shift = ensureShift(agentId);
        const tillAfter = money(agent.balance - value);
        const playerAfter =
          type === 'player_payout'
            ? money(player.balance - value)
            : type === 'player_deposit'
              ? money(player.balance + value)
              : player.balance;
        const op: HierarchyOp = {
          id: uid('op'),
          type,
          actorId: agent.id,
          targetId: player.id,
          amount: money(value),
          note:
            type === 'player_deposit'
              ? `Депозит игрока ${player.publicId}`
              : type === 'player_payout'
                ? `Выплата игроку ${player.publicId}`
                : `Ставка от кассы · ${player.publicId}`,
          createdAt: nowIso(),
          shiftId: shift.id,
        };
        const commission = type === 'cashier_bet' ? money(value * (agent.commissionRate / 100)) : 0;
        const known = get().players.some((row) => row.id === player!.id);
        set({
          staff: get().staff.map((row) =>
            row.id === agent.id
              ? { ...row, balance: tillAfter, commissionEarned: money(row.commissionEarned + commission) }
              : row,
          ),
          players: known
            ? get().players.map((row) =>
                row.id === player!.id ? { ...row, balance: playerAfter, agentId: agent.id } : row,
              )
            : [{ ...player, balance: playerAfter, agentId: agent.id }, ...get().players],
          ops: [op, ...get().ops],
          shifts: get().shifts.map((row) =>
            row.id === shift.id
              ? {
                  ...row,
                  deposits: row.deposits + (type === 'player_deposit' ? value : 0),
                  payouts: row.payouts + (type === 'player_payout' ? value : 0),
                  bets: row.bets + (type === 'cashier_bet' ? value : 0),
                }
              : row,
          ),
        });
        return op;
      };

      return {
        ...seed(),
        findStaff: (login, password) =>
          get().staff.find(
            (row) => row.login.toLowerCase() === login.trim().toLowerCase() && row.password === password,
          ),
        staffById: (id) => get().staff.find((row) => row.id === id),
        managers: () => get().staff.filter((row) => row.role === 'MANAGER'),
        agentsOf: (managerId) => get().staff.filter((row) => row.role === 'AGENT' && row.managerId === managerId),
        allAgents: () => get().staff.filter((row) => row.role === 'AGENT'),
        createManager: (params) => {
          const login = params.login.trim().toLowerCase();
          if (!login || !params.password) throw new Error('Укажите логин и пароль');
          if (get().staff.some((row) => row.login.toLowerCase() === login)) throw new Error('Логин уже занят');
          const deposit = Number(params.deposit);
          if (!Number.isFinite(deposit) || deposit <= 0) throw new Error('Укажите выделенный депозит');
          const owner = get().staff.find((row) => row.role === 'OWNER');
          if (!owner || owner.balance < deposit) throw new Error('Недостаточно средств у владельца');
          const created: StaffMember = {
            id: uid('mgr'),
            login,
            password: params.password,
            fullName: params.fullName.trim() || login,
            role: 'MANAGER',
            region: params.region.trim() || 'Регион',
            balance: money(deposit),
            commissionRate: 8,
            commissionEarned: 0,
            createdAt: nowIso(),
          };
          set({
            staff: get()
              .staff.map((row) => (row.id === owner.id ? { ...row, balance: money(row.balance - deposit) } : row))
              .concat(created),
            ops: [
              {
                id: uid('op'),
                type: 'manager_credit',
                actorId: owner.id,
                targetId: created.id,
                amount: money(deposit),
                note: `Депозит менеджера ${created.fullName}`,
                createdAt: nowIso(),
              },
              ...get().ops,
            ],
          });
          return created;
        },
        adjustManager: (managerId, amount, actorId) => {
          const delta = Number(amount);
          if (!Number.isFinite(delta) || delta === 0) throw new Error('Укажите сумму');
          const manager = get().staff.find((row) => row.id === managerId && row.role === 'MANAGER');
          if (!manager) throw new Error('Менеджер не найден');
          const owner =
            get().staff.find((row) => row.id === actorId && row.role === 'OWNER') ??
            get().staff.find((row) => row.role === 'OWNER');
          if (!owner) throw new Error('Владелец не найден');
          if (delta > 0 && owner.balance < delta) throw new Error('Недостаточно средств у владельца');
          if (delta < 0 && manager.balance < Math.abs(delta)) throw new Error('Недостаточно средств у менеджера');
          set({
            staff: get().staff.map((row) => {
              if (row.id === manager.id) return { ...row, balance: money(row.balance + delta) };
              if (row.id === owner.id) return { ...row, balance: money(row.balance - delta) };
              return row;
            }),
            ops: [
              {
                id: uid('op'),
                type: delta > 0 ? 'manager_credit' : 'manager_debit',
                actorId: owner.id,
                targetId: manager.id,
                amount: money(Math.abs(delta)),
                note: delta > 0 ? `Пополнение ${manager.fullName}` : `Списание ${manager.fullName}`,
                createdAt: nowIso(),
              },
              ...get().ops,
            ],
          });
        },
        createAgent: (params) => {
          const manager = get().staff.find((row) => row.id === params.managerId && row.role === 'MANAGER');
          if (!manager) throw new Error('Менеджер не найден');
          const float = Number(params.float);
          if (!Number.isFinite(float) || float <= 0) throw new Error('Укажите стартовый остаток кассы');
          if (manager.balance < float) throw new Error('Недостаточно средств на балансе менеджера');
          const login = params.login.trim().toLowerCase();
          if (!login || !params.password) throw new Error('Укажите логин и пароль');
          if (get().staff.some((row) => row.login.toLowerCase() === login)) throw new Error('Логин уже занят');
          const created: StaffMember = {
            id: uid('agt'),
            login,
            password: params.password,
            fullName: params.fullName.trim() || login,
            role: 'AGENT',
            managerId: manager.id,
            region: manager.region,
            city: params.city.trim() || manager.region || 'Город',
            pointName: params.pointName.trim() || 'Касса',
            balance: money(float),
            commissionRate: 1,
            commissionEarned: 0,
            createdAt: nowIso(),
          };
          set({
            staff: get()
              .staff.map((row) => (row.id === manager.id ? { ...row, balance: money(row.balance - float) } : row))
              .concat(created),
            ops: [
              {
                id: uid('op'),
                type: 'agent_credit',
                actorId: manager.id,
                targetId: created.id,
                amount: money(float),
                note: `Открытие кассы ${created.pointName}`,
                createdAt: nowIso(),
              },
              ...get().ops,
            ],
            shifts: [
              {
                id: uid('shift'),
                agentId: created.id,
                openedAt: nowIso(),
                closedAt: null,
                openingFloat: money(float),
                closingFloat: null,
                deposits: 0,
                payouts: 0,
                bets: 0,
              },
              ...get().shifts,
            ],
          });
          return created;
        },
        creditAgent: (managerId, agentId, amount) => {
          const value = Number(amount);
          if (!Number.isFinite(value) || value <= 0) throw new Error('Укажите сумму пополнения');
          const manager = get().staff.find((row) => row.id === managerId && row.role === 'MANAGER');
          if (!manager) throw new Error('Менеджер не найден');
          const agent = requireAgent(get().staff, agentId);
          if (agent.managerId !== manager.id) throw new Error('Касса не принадлежит этому менеджеру');
          if (manager.balance < value) throw new Error('Недостаточно средств на балансе менеджера');
          set({
            staff: get().staff.map((row) => {
              if (row.id === manager.id) return { ...row, balance: money(row.balance - value) };
              if (row.id === agent.id) return { ...row, balance: money(row.balance + value) };
              return row;
            }),
            ops: [
              {
                id: uid('op'),
                type: 'agent_credit',
                actorId: manager.id,
                targetId: agent.id,
                amount: money(value),
                note: `Пополнение кассы ${agent.pointName}`,
                createdAt: nowIso(),
              },
              ...get().ops,
            ],
          });
        },
        findPlayer: (query) => {
          const q = query.replace(/\s+/g, '').toLowerCase();
          if (!q) return undefined;
          const digits = q.replace(/\D/g, '');
          return get().players.find(
            (row) => row.publicId === q || row.publicId.includes(q) || (digits.length >= 4 && row.phone.includes(digits)),
          );
        },
        depositPlayer: (agentId, query, amount) => tillOp(agentId, query, amount, 'player_deposit'),
        payoutPlayer: (agentId, query, amount) => tillOp(agentId, query, amount, 'player_payout'),
        placeCashierBet: (agentId, query, amount) => tillOp(agentId, query, amount, 'cashier_bet'),
        openShift: (agentId) => ensureShift(agentId),
        closeShift: (agentId) => {
          const agent = requireAgent(get().staff, agentId);
          const open = ensureShift(agentId);
          const closed: CashShift = { ...open, closedAt: nowIso(), closingFloat: agent.balance };
          set({
            shifts: get().shifts.map((row) => (row.id === open.id ? closed : row)),
            ops: [
              {
                id: uid('op'),
                type: 'shift_close',
                actorId: agentId,
                targetId: agentId,
                amount: agent.balance,
                note: `Z-отчёт · депозиты ${closed.deposits} · выплаты ${closed.payouts} · ставки ${closed.bets}`,
                createdAt: nowIso(),
                shiftId: closed.id,
              },
              ...get().ops,
            ],
          });
          ensureShift(agentId);
          return closed;
        },
        shiftOps: (agentId) => {
          const open = get().shifts.find((row) => row.agentId === agentId && !row.closedAt);
          if (!open) return [];
          return get().ops.filter((row) => row.shiftId === open.id);
        },
        managerTurnover: (managerId) => {
          const agentIds = new Set(get().agentsOf(managerId).map((row) => row.id));
          const today = nowIso().slice(0, 10);
          const dayOps = get().ops.filter((row) => agentIds.has(row.actorId) && row.createdAt.slice(0, 10) === today);
          const deposits = dayOps.filter((row) => row.type === 'player_deposit').reduce((sum, row) => sum + row.amount, 0);
          const payouts = dayOps.filter((row) => row.type === 'player_payout').reduce((sum, row) => sum + row.amount, 0);
          const bets = dayOps.filter((row) => row.type === 'cashier_bet').reduce((sum, row) => sum + row.amount, 0);
          const turnover = deposits + bets;
          const manager = get().staffById(managerId);
          const commission = money(((Math.max(0, turnover - payouts) * (manager?.commissionRate ?? 8)) / 100));
          return { turnover, commission, deposits };
        },
        toggleAgentBlockStatus: (agentId, blockedBy) => {
          const agent = requireAgent(get().staff, agentId);
          if (agent.blocked && agent.blockedBy === 'owner' && blockedBy === 'manager') {
            throw new Error('Касса заблокирована владельцем. Разблокировать может только владелец.');
          }
          const nextBlocked = !agent.blocked;
          set({
            staff: get().staff.map((row) => (
              row.id === agent.id
                ? { ...row, blocked: nextBlocked, blockedBy: nextBlocked ? blockedBy : null }
                : row
            )),
          });
        },
        updateAgentBalance: (agentId, amount) => {
          const value = Number(amount);
          if (!Number.isFinite(value) || value === 0) throw new Error('Укажите сумму корректировки');
          const agent = requireAgent(get().staff, agentId);
          const next = money(agent.balance + value);
          if (next < 0) throw new Error('Недостаточно средств в кассе для списания');
          set({
            staff: get().staff.map((row) => (row.id === agent.id ? { ...row, balance: next } : row)),
          });
        },
      };
    },
    { name: 'nextpari-hierarchy' },
  ),
);

export const useNetworkStore = useHierarchyStore;
