import { supabase } from './supabase';
import { type StaffRole } from '../routes/portal';

export type { StaffRole };
export type ManagerRole = 'superadmin' | 'manager';

export interface ManagerSession {
  id: string;
  login: string;
  fullName: string;
  role: ManagerRole;
  networkId: string | null;
  networkName: string;
}

export interface NetworkManager {
  id: string;
  login: string;
  fullName: string;
  region: string;
  allocatedBalance: number;
  networkId: string;
  networkName: string;
  isActive: boolean;
  createdAt: string;
  cashierCount: number;
}

export interface VerticalKpi {
  turnover: number;
  payouts: number;
  ggr: number;
  margin: number;
}

export interface DashboardKpis {
  role: ManagerRole;
  networkName: string;
  turnover: number;
  ggr: number;
  deposits: number;
  payouts: number;
  floatTotal: number;
  series: Array<{ day: string; bets: number; deposits: number }>;
  verticals: {
    sports: VerticalKpi;
    casino: VerticalKpi;
    games: VerticalKpi;
  };
}

export type CashierOpType = 'deposit' | 'payout' | 'topup' | 'collection';
export type LedgerPeriod = 'today' | '7d' | 'month';
export type CashierBlockedBy = 'owner' | 'manager';
export const NETWORK_SYNC_EVENT = 'nextpari-network-sync';
export const NETWORK_SYNC_AT_KEY = 'nextpari-network-sync-at';
export const CASHIER_BLOCKED_MESSAGE = 'Касса заблокирована. Депозиты и выплаты недоступны.';

export interface CashierLedgerEntry {
  id: string;
  cashierId?: string;
  type: CashierOpType;
  playerPublicId: string;
  receiptCode: string;
  amount: number;
  signedAmount: number;
  floatAfter: number | null;
  status: 'completed' | 'failed';
  createdAt: string;
}

export interface BackofficeCashier {
  id: string;
  login: string;
  fullName: string;
  city: string;
  pointName: string;
  floatBalance: number;
  commissionEarned: number;
  commissionRate: number;
  isActive: boolean;
  blockedBy: CashierBlockedBy | null;
  dailyTurnover: number;
  networkId: string | null;
  managerId: string | null;
}

export interface RiskBet {
  id: string;
  matchId: string;
  selection: string;
  odds: number;
  amount: number;
  potentialWin: number;
  status: string;
  homeTeam: string;
  awayTeam: string;
  type: string;
  ticketCode: string;
  createdAt: string;
  suspicious: boolean;
}

const SESSION_KEY = 'nextpari-backoffice-session';
const OWNER_SESSION_KEY = 'nextpari-owner-session';
const MANAGER_SESSION_KEY = 'nextpari-manager-session';
const DEMO_STORE_KEY = 'nextpari-backoffice-demo';
const SUPERADMIN_ID = '00000000-0000-0000-0000-00000000aa01';
const MANAGER_ID = '00000000-0000-0000-0000-00000000aa02';
const NETWORK_ASHGABAT = '11111111-1111-1111-1111-111111111111';
const NETWORK_MARY = '22222222-2222-2222-2222-222222222222';
const AGENT01_ID = '00000000-0000-0000-0000-00000000ca01';
const AGENT02_ID = '00000000-0000-0000-0000-00000000ca02';

interface StoredManager {
  id: string;
  login: string;
  pin: string;
  fullName: string;
  region: string;
  allocatedBalance: number;
  networkId: string;
  networkName: string;
  isActive: boolean;
  createdAt: string;
}

const DEMO_ACCOUNTS: Array<ManagerSession & { pin: string }> = [
  {
    id: SUPERADMIN_ID,
    login: 'owner',
    pin: '0000',
    fullName: 'Владелец NextPari',
    role: 'superadmin',
    networkId: null,
    networkName: 'Вся платформа',
  },
  {
    id: MANAGER_ID,
    login: 'manager01',
    pin: '1111',
    fullName: 'Мерет Аннаев',
    role: 'manager',
    networkId: NETWORK_ASHGABAT,
    networkName: 'Сеть Ашхабад',
  },
];

interface DemoStore {
  cashiers: BackofficeCashier[];
  ledger: CashierLedgerEntry[];
  managers: StoredManager[];
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function demoLedgerSeed(): CashierLedgerEntry[] {
  const agent = '00000000-0000-0000-0000-00000000ca01';
  return [
    {
      id: 'demo-led-1',
      cashierId: agent,
      type: 'deposit',
      playerPublicId: '645912',
      receiptCode: 'MC-20260820-00012',
      amount: 200,
      signedAmount: -200,
      floatAfter: 4800,
      status: 'completed',
      createdAt: hoursAgo(2),
    },
    {
      id: 'demo-led-2',
      cashierId: agent,
      type: 'payout',
      playerPublicId: '882341',
      receiptCode: 'MC-20260820-00011',
      amount: 150,
      signedAmount: 150,
      floatAfter: 5000,
      status: 'completed',
      createdAt: hoursAgo(5),
    },
    {
      id: 'demo-led-3',
      cashierId: agent,
      type: 'topup',
      playerPublicId: 'MANAGER',
      receiptCode: 'MC-20260819-00008',
      amount: 1000,
      signedAmount: 1000,
      floatAfter: 4850,
      status: 'completed',
      createdAt: hoursAgo(26),
    },
    {
      id: 'demo-led-4',
      cashierId: agent,
      type: 'collection',
      playerPublicId: 'CASH',
      receiptCode: 'MC-20260818-00003',
      amount: 800,
      signedAmount: -800,
      floatAfter: 3850,
      status: 'completed',
      createdAt: hoursAgo(50),
    },
    {
      id: 'demo-led-5',
      cashierId: agent,
      type: 'deposit',
      playerPublicId: '645912',
      receiptCode: 'MC-20260817-00002',
      amount: 50,
      signedAmount: -50,
      floatAfter: 4650,
      status: 'failed',
      createdAt: hoursAgo(72),
    },
  ];
}

function emptyManagers(): StoredManager[] {
  return [
    {
      id: MANAGER_ID,
      login: 'manager01',
      pin: '1111',
      fullName: 'Мерет Аннаев',
      region: 'Ашхабад',
      allocatedBalance: 42000,
      networkId: NETWORK_ASHGABAT,
      networkName: 'Сеть Ашхабад',
      isActive: true,
      createdAt: hoursAgo(96),
    },
  ];
}

function emptyDemoStore(): DemoStore {
  return {
    cashiers: [
      {
        id: AGENT01_ID,
        login: 'agent01',
        fullName: 'Азат Мередов',
        city: 'Ашхабад',
        pointName: 'Точка №12 · ул. Махтумкули',
        floatBalance: 5000,
        commissionEarned: 142.5,
        commissionRate: 1,
        isActive: true,
        blockedBy: null,
        dailyTurnover: 350,
        networkId: NETWORK_ASHGABAT,
        managerId: MANAGER_ID,
      },
      {
        id: AGENT02_ID,
        login: 'agent02',
        fullName: 'Гульшат Бердыева',
        city: 'Мары',
        pointName: 'Точка №3 · базар «Гёкдепе»',
        floatBalance: 2800,
        commissionEarned: 86.4,
        commissionRate: 1,
        isActive: true,
        blockedBy: null,
        dailyTurnover: 0,
        networkId: NETWORK_MARY,
        managerId: null,
      },
    ],
    ledger: demoLedgerSeed(),
    managers: emptyManagers(),
  };
}

function withCashierManager(row: BackofficeCashier): BackofficeCashier {
  const hasManager = Object.prototype.hasOwnProperty.call(row, 'managerId');
  const managerId = hasManager
    ? row.managerId
    : (row.id === AGENT01_ID || row.login === 'agent01' ? MANAGER_ID : null);
  return {
    ...row,
    commissionRate: row.commissionRate || 1,
    blockedBy: row.blockedBy ?? null,
    dailyTurnover: Number(row.dailyTurnover) || 0,
    managerId,
  };
}

function loadDemoStore(): DemoStore {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return emptyDemoStore();
    const parsed = JSON.parse(raw) as DemoStore;
    const seed = emptyDemoStore();
    return {
      cashiers: Array.isArray(parsed.cashiers) ? parsed.cashiers.map(withCashierManager) : seed.cashiers,
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : seed.ledger,
      managers: Array.isArray(parsed.managers) && parsed.managers.length ? parsed.managers : seed.managers,
    };
  } catch {
    return emptyDemoStore();
  }
}

function saveDemoStore(store: DemoStore) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
  syncPosFloat(store);
  emitNetworkSync();
}

export function emitNetworkSync() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NETWORK_SYNC_AT_KEY, String(Date.now()));
  window.dispatchEvent(new Event(NETWORK_SYNC_EVENT));
}

export function subscribeNetworkSync(onSync: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onEvent = () => onSync();
  const onStorage = (event: StorageEvent) => {
    if (event.key === NETWORK_SYNC_AT_KEY || event.key === DEMO_STORE_KEY) onSync();
  };
  window.addEventListener(NETWORK_SYNC_EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(NETWORK_SYNC_EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

function syncPosFloat(store: DemoStore) {
  if (typeof localStorage === 'undefined') return;
  const agent = store.cashiers.find((row) => row.id === AGENT01_ID || row.login === 'agent01');
  if (!agent) return;
  try {
    const raw = localStorage.getItem('mobcash-demo-store');
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed.floatBalance = agent.floatBalance;
    localStorage.setItem('mobcash-demo-store', JSON.stringify(parsed));
  } catch {
    /* ignore POS mirror errors */
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isMissingRpc(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = error?.message ?? '';
  return error?.code === 'PGRST202' || /could not find the function/i.test(msg) || /schema cache/i.test(msg);
}

function rpcMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? 'Ошибка бэкофиса';
  return raw.replace(/^.*ERROR:\s*/i, '').replace(/\s+Where:[\s\S]*$/i, '').trim() || 'Ошибка бэкофиса';
}

function parseSession(raw: Record<string, unknown>): ManagerSession {
  const role = str(raw.role) === 'manager' ? 'manager' : 'superadmin';
  return {
    id: str(raw.id),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    role,
    networkId: raw.network_id == null && raw.networkId == null ? null : str(raw.network_id ?? raw.networkId),
    networkName: str(raw.network_name ?? raw.networkName, role === 'superadmin' ? 'Вся платформа' : 'Сеть'),
  };
}

function parseCashier(raw: Record<string, unknown>): BackofficeCashier {
  return {
    id: str(raw.id),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    city: str(raw.city),
    pointName: str(raw.point_name ?? raw.pointName),
    floatBalance: num(raw.float_balance ?? raw.floatBalance),
    commissionEarned: num(raw.commission_earned ?? raw.commissionEarned),
    commissionRate: num(raw.commission_rate ?? raw.commissionRate) || 1,
    isActive: raw.is_active !== false && raw.isActive !== false,
    blockedBy: str(raw.blocked_by ?? raw.blockedBy) === 'owner'
      ? 'owner'
      : str(raw.blocked_by ?? raw.blockedBy) === 'manager' ? 'manager' : null,
    dailyTurnover: num(raw.daily_turnover ?? raw.dailyTurnover),
    networkId: raw.network_id == null && raw.networkId == null ? null : str(raw.network_id ?? raw.networkId),
    managerId: raw.manager_id == null && raw.managerId == null ? null : str(raw.manager_id ?? raw.managerId),
  };
}

function lastDays(count: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function scopedCashiers(session: ManagerSession, list: BackofficeCashier[]): BackofficeCashier[] {
  if (session.role === 'superadmin') return list;
  return list.filter((row) => row.managerId === session.id);
}

function assertCashierScope(session: ManagerSession, row: BackofficeCashier) {
  if (session.role === 'superadmin') return;
  if (row.managerId === session.id) return;
  throw new Error('Эта точка не входит в вашу сеть');
}

function applyCashierBlock(row: BackofficeCashier, frozen: boolean, blockedBy: CashierBlockedBy) {
  if (frozen) {
    row.isActive = false;
    row.blockedBy = blockedBy;
    return;
  }
  if (blockedBy === 'manager' && row.blockedBy === 'owner') {
    throw new Error('Касса заблокирована владельцем. Разблокировать может только владелец.');
  }
  row.isActive = true;
  row.blockedBy = null;
}

function dayStartIso(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function cashierDayTurnover(store: DemoStore, cashierId: string): number {
  return store.ledger
    .filter((row) => row.cashierId === cashierId && row.createdAt >= dayStartIso() && (row.type === 'deposit' || row.type === 'payout'))
    .reduce((sum, row) => sum + row.amount, 0);
}

function withLiveMetrics(store: DemoStore, row: BackofficeCashier): BackofficeCashier {
  return {
    ...row,
    blockedBy: row.blockedBy ?? null,
    dailyTurnover: cashierDayTurnover(store, row.id) || row.dailyTurnover || 0,
  };
}

function toPublicManager(row: StoredManager, cashiers: BackofficeCashier[]): NetworkManager {
  return {
    id: row.id,
    login: row.login,
    fullName: row.fullName,
    region: row.region,
    allocatedBalance: row.allocatedBalance,
    networkId: row.networkId,
    networkName: row.networkName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    cashierCount: cashiers.filter((item) => item.managerId === row.id).length,
  };
}

function managerAccounts(): Array<ManagerSession & { pin: string }> {
  const extra = loadDemoStore().managers.map((row) => ({
    id: row.id,
    login: row.login,
    pin: row.pin,
    fullName: row.fullName,
    role: 'manager' as const,
    networkId: row.networkId,
    networkName: row.networkName,
  }));
  const seen = new Set(DEMO_ACCOUNTS.map((row) => row.login.toLowerCase()));
  return [...DEMO_ACCOUNTS, ...extra.filter((row) => !seen.has(row.login.toLowerCase()))];
}

function debitManagerLimit(store: DemoStore, managerId: string, amount: number) {
  const manager = store.managers.find((row) => row.id === managerId);
  if (!manager) throw new Error('Менеджер не найден');
  if (manager.allocatedBalance < amount) {
    throw new Error('Недостаточно лимита менеджера для выдачи в кассу');
  }
  manager.allocatedBalance = Number((manager.allocatedBalance - amount).toFixed(2));
}

function creditManagerLimit(store: DemoStore, managerId: string, amount: number) {
  const manager = store.managers.find((row) => row.id === managerId);
  if (!manager) return;
  manager.allocatedBalance = Number((manager.allocatedBalance + amount).toFixed(2));
}

export function staffRoleOf(session: ManagerSession): StaffRole {
  return session.role === 'superadmin' ? 'OWNER' : 'MANAGER';
}

function readSession(key: string): ManagerSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = parseSession(asRecord(JSON.parse(raw)));
    return parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, session: ManagerSession) {
  sessionStorage.setItem(key, JSON.stringify({
    id: session.id,
    login: session.login,
    full_name: session.fullName,
    role: session.role,
    network_id: session.networkId,
    network_name: session.networkName,
  }));
}

export function loadOwnerSession(): ManagerSession | null {
  const session = readSession(OWNER_SESSION_KEY);
  if (session?.role === 'superadmin') return session;
  return null;
}

export function saveOwnerSession(session: ManagerSession) {
  writeSession(OWNER_SESSION_KEY, session);
}

export function clearOwnerSession() {
  sessionStorage.removeItem(OWNER_SESSION_KEY);
}

export function loadNetworkManagerSession(): ManagerSession | null {
  const session = readSession(MANAGER_SESSION_KEY);
  if (session?.role === 'manager') return session;
  return null;
}

export function saveNetworkManagerSession(session: ManagerSession) {
  writeSession(MANAGER_SESSION_KEY, session);
}

export function clearNetworkManagerSession() {
  sessionStorage.removeItem(MANAGER_SESSION_KEY);
}

/** @deprecated isolated owner/manager sessions — use loadOwnerSession / loadNetworkManagerSession */
export function loadManagerSession(): ManagerSession | null {
  return loadOwnerSession() ?? loadNetworkManagerSession() ?? readSession(SESSION_KEY);
}

export function saveManagerSession(session: ManagerSession) {
  if (session.role === 'superadmin') saveOwnerSession(session);
  else saveNetworkManagerSession(session);
}

export function clearManagerSession() {
  clearOwnerSession();
  clearNetworkManagerSession();
  sessionStorage.removeItem(SESSION_KEY);
}

export function staffLocation(): string {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) return hash.replace(/\/+$/, '') || '/';
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function isBackofficePath(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'admin' || host.startsWith('admin.')) return true;
  const loc = staffLocation();
  return loc === '/backoffice' || loc.startsWith('/backoffice/');
}

export function isManagerPortalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const loc = staffLocation();
  if (loc === '/manager' || loc.startsWith('/manager/')) return true;
  if (loc === '/manager-login') return true;
  if (loc === '/manager-office' || loc.startsWith('/manager-office/')) return true;
  return false;
}

export function isManagerOfficePath(): boolean {
  return isManagerPortalPath();
}

export function isManagerLoginPath(): boolean {
  const loc = staffLocation();
  return loc === '/manager' || loc === '/manager-login' || loc === '/manager/login';
}

async function authenticateStaff(login: string, pin: string): Promise<ManagerSession> {
  const { data, error } = await supabase.rpc('manager_login', {
    p_login: login.trim(),
    p_pin: pin,
  });
  if (error && isMissingRpc(error)) {
    const found = managerAccounts().find(
      (row) => row.login.toLowerCase() === login.trim().toLowerCase() && row.pin === pin,
    );
    if (!found) throw new Error('Неверный логин или PIN-код');
    return {
      id: found.id,
      login: found.login,
      fullName: found.fullName,
      role: found.role,
      networkId: found.networkId,
      networkName: found.networkName,
    };
  }
  if (error) throw new Error(rpcMessage(error));
  const session = parseSession(asRecord(data));
  if (!session.id) throw new Error('Не удалось войти');
  return session;
}

export async function ownerLogin(login: string, pin: string): Promise<ManagerSession> {
  const session = await authenticateStaff(login, pin);
  if (session.role !== 'superadmin') throw new Error('Неверный логин или PIN-код');
  saveOwnerSession(session);
  return session;
}

export async function networkManagerLogin(login: string, pin: string): Promise<ManagerSession> {
  const session = await authenticateStaff(login, pin);
  if (session.role !== 'manager') throw new Error('Неверный логин или PIN-код');
  saveNetworkManagerSession(session);
  return session;
}

export async function managerLogin(login: string, pin: string): Promise<ManagerSession> {
  return ownerLogin(login, pin).catch(async () => networkManagerLogin(login, pin));
}

async function liveSeriesFromTables(session: ManagerSession): Promise<DashboardKpis['series']> {
  const days = lastDays(14);
  const [{ data: bets }, { data: ops }] = await Promise.all([
    supabase.from('bets').select('amount, created_at'),
    supabase.from('cashier_operations').select('amount, type, status, created_at, cashier_id'),
  ]);
  const cashiers = loadDemoStore().cashiers;
  const allowed = new Set(scopedCashiers(session, cashiers).map((row) => row.id));
  const betMap = new Map<string, number>();
  const depMap = new Map<string, number>();
  for (const day of days) {
    betMap.set(day, 0);
    depMap.set(day, 0);
  }
  for (const row of (bets ?? []) as Record<string, unknown>[]) {
    const day = str(row.created_at).slice(0, 10);
    if (!betMap.has(day)) continue;
    if (session.role === 'superadmin') betMap.set(day, (betMap.get(day) ?? 0) + num(row.amount));
  }
  for (const row of (ops ?? []) as Record<string, unknown>[]) {
    if (str(row.type) !== 'deposit' || str(row.status) !== 'completed') continue;
    if (session.role !== 'superadmin' && !allowed.has(str(row.cashier_id))) continue;
    const day = str(row.created_at).slice(0, 10);
    if (!depMap.has(day)) continue;
    depMap.set(day, (depMap.get(day) ?? 0) + num(row.amount));
  }
  return days.map((day) => ({ day, bets: betMap.get(day) ?? 0, deposits: depMap.get(day) ?? 0 }));
}

function parseVerticalKpi(value: unknown): VerticalKpi {
  const raw = asRecord(value);
  const turnover = num(raw.turnover);
  const payouts = num(raw.payouts);
  const ggr = raw.ggr == null ? turnover - payouts : num(raw.ggr);
  const margin = raw.margin == null
    ? (turnover > 0 ? Number(((ggr / turnover) * 100).toFixed(2)) : 0)
    : num(raw.margin);
  return { turnover, payouts, ggr, margin };
}

function kpiFromTotals(turnover: number, payouts: number): VerticalKpi {
  const ggr = turnover - payouts;
  return {
    turnover,
    payouts,
    ggr,
    margin: turnover > 0 ? Number(((ggr / turnover) * 100).toFixed(2)) : 0,
  };
}

export async function fetchDashboardKpis(session: ManagerSession): Promise<DashboardKpis> {
  const { data, error } = await supabase.rpc('manager_dashboard_stats', { p_manager_id: session.id });
  if (!error) {
    const raw = asRecord(data);
    const seriesRaw = Array.isArray(raw.series) ? raw.series : [];
    const verticalsRaw = asRecord(raw.verticals);
    return {
      role: session.role,
      networkName: str(raw.network_name, session.networkName),
      turnover: num(raw.turnover),
      ggr: num(raw.ggr),
      deposits: num(raw.deposits),
      payouts: num(raw.payouts),
      floatTotal: num(raw.float_total ?? raw.floatTotal),
      series: seriesRaw.map((item) => {
        const row = asRecord(item);
        return {
          day: str(row.day).slice(0, 10),
          bets: num(row.bets),
          deposits: num(row.deposits),
        };
      }),
      verticals: {
        sports: parseVerticalKpi(verticalsRaw.sports),
        casino: parseVerticalKpi(verticalsRaw.casino),
        games: parseVerticalKpi(verticalsRaw.games),
      },
    };
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const cashiers = scopedCashiers(session, loadDemoStore().cashiers);
  const [{ data: bets }, { data: ops }, { data: wagers }] = await Promise.all([
    supabase.from('bets').select('amount, potential_win, status'),
    supabase.from('cashier_operations').select('amount, type, status, cashier_id'),
    supabase.from('product_wagers').select('vertical, stake, payout'),
  ]);
  const betRows = (bets ?? []) as Record<string, unknown>[];
  const opRows = (ops ?? []) as Record<string, unknown>[];
  const wagerRows = (wagers ?? []) as Record<string, unknown>[];
  const allowed = new Set(cashiers.map((row) => row.id));
  const sportsTurn = betRows.reduce((sum, row) => sum + num(row.amount), 0);
  const sportsPay = betRows.reduce((sum, row) => {
    const status = str(row.status);
    if (['won', 'win'].includes(status)) return sum + num(row.potential_win);
    if (['void', 'cancelled'].includes(status)) return sum + num(row.amount);
    return sum;
  }, 0);
  const casinoRows = wagerRows.filter((row) => str(row.vertical) === 'casino');
  const gamesRows = wagerRows.filter((row) => str(row.vertical) === 'games');
  const sports = sportsTurn > 0 ? kpiFromTotals(sportsTurn, sportsPay) : kpiFromTotals(1840, 1430);
  const casino = casinoRows.length
    ? kpiFromTotals(
        casinoRows.reduce((sum, row) => sum + num(row.stake), 0),
        casinoRows.reduce((sum, row) => sum + num(row.payout), 0),
      )
    : kpiFromTotals(1025, 768);
  const games = gamesRows.length
    ? kpiFromTotals(
        gamesRows.reduce((sum, row) => sum + num(row.stake), 0),
        gamesRows.reduce((sum, row) => sum + num(row.payout), 0),
      )
    : kpiFromTotals(450, 322);
  const scopedOps = opRows.filter((row) => session.role === 'superadmin' || allowed.has(str(row.cashier_id)));
  const deposits = scopedOps
    .filter((row) => str(row.type) === 'deposit' && str(row.status) === 'completed')
    .reduce((sum, row) => sum + num(row.amount), 0);
  const payouts = scopedOps
    .filter((row) => str(row.type) === 'payout' && str(row.status) === 'completed')
    .reduce((sum, row) => sum + num(row.amount), 0);
  const series = await liveSeriesFromTables(session);
  const seeded = series.every((row) => row.bets === 0 && row.deposits === 0)
    ? lastDays(14).map((day, index) => ({
        day,
        bets: session.role === 'superadmin' ? 80 + index * 18 : 0,
        deposits: 40 + (index % 5) * 25,
      }))
    : series;

  return {
    role: session.role,
    networkName: session.networkName,
    turnover: session.role === 'superadmin'
      ? sports.turnover + casino.turnover + games.turnover
      : deposits + payouts,
    ggr: session.role === 'superadmin' ? sports.ggr + casino.ggr + games.ggr : 0,
    deposits: deposits || cashiers.reduce((sum, row) => sum + row.floatBalance * 0.12, 0),
    payouts: payouts || cashiers.reduce((sum, row) => sum + row.floatBalance * 0.07, 0),
    floatTotal: cashiers.reduce((sum, row) => sum + row.floatBalance, 0),
    series: seeded,
    verticals: { sports, casino, games },
  };
}

export async function fetchBackofficeCashiers(session: ManagerSession): Promise<BackofficeCashier[]> {
  const { data, error } = await supabase.rpc('manager_list_cashiers', { p_manager_id: session.id });
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => parseCashier(asRecord(row)));
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const fromTable = await supabase
    .from('cashiers')
    .select('id, login, full_name, city, point_name, float_balance, commission_earned, commission_rate, is_active, network_id');
  if (!fromTable.error && fromTable.data?.length) {
    const store = loadDemoStore();
    return scopedCashiers(session, fromTable.data.map((row) => parseCashier(asRecord(row)))).map((row) => withLiveMetrics(store, row));
  }
  const store = loadDemoStore();
  return scopedCashiers(session, store.cashiers).map((row) => withLiveMetrics(store, row));
}

export async function createBackofficeCashier(
  session: ManagerSession,
  params: {
    login: string;
    pin: string;
    fullName: string;
    city: string;
    pointName: string;
    floatBalance: number;
  },
): Promise<void> {
  const { error } = await supabase.rpc('manager_create_cashier', {
    p_manager_id: session.id,
    p_login: params.login,
    p_pin: params.pin,
    p_full_name: params.fullName,
    p_city: params.city,
    p_point_name: params.pointName,
    p_float: params.floatBalance,
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const store = loadDemoStore();
  if (store.cashiers.some((row) => row.login.toLowerCase() === params.login.trim().toLowerCase())) {
    throw new Error('Кассир с таким логином уже существует');
  }
  if (!Number.isFinite(params.floatBalance) || params.floatBalance < 0) {
    throw new Error('Укажите стартовый лимит кассы');
  }
  const managerId = session.role === 'manager' ? session.id : null;
  if (managerId) debitManagerLimit(store, managerId, params.floatBalance);
  store.cashiers.push({
    id: crypto.randomUUID(),
    login: params.login.trim().toLowerCase(),
    fullName: params.fullName.trim(),
    city: params.city.trim(),
    pointName: params.pointName.trim(),
    floatBalance: params.floatBalance,
    commissionEarned: 0,
    commissionRate: 1,
    isActive: true,
    blockedBy: null,
    dailyTurnover: 0,
    networkId: session.networkId ?? NETWORK_ASHGABAT,
    managerId,
  });
  saveDemoStore(store);
}

export async function topupBackofficeCashier(
  session: ManagerSession,
  cashierId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('manager_topup_cashier', {
    p_manager_id: session.id,
    p_cashier_id: cashierId,
    p_amount: amount,
  });
  if (!error) return num(asRecord(data).float_balance ?? asRecord(data).floatBalance);
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId);
  if (!row) throw new Error('Касса не найдена');
  assertCashierScope(session, row);
  if (session.role === 'manager') debitManagerLimit(store, session.id, amount);
  row.floatBalance = Number((row.floatBalance + amount).toFixed(2));
  store.ledger.unshift({
    id: crypto.randomUUID(),
    cashierId: cashierId,
    type: 'topup',
    playerPublicId: 'MANAGER',
    receiptCode: `MC-LOCAL-${Date.now()}`,
    amount,
    signedAmount: amount,
    floatAfter: row.floatBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  saveDemoStore(store);
  await supabase.from('cashiers').update({ float_balance: row.floatBalance }).eq('id', cashierId);
  return row.floatBalance;
}

export async function setCashierFrozen(
  session: ManagerSession,
  cashierId: string,
  frozen: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('manager_set_cashier_frozen', {
    p_manager_id: session.id,
    p_cashier_id: cashierId,
    p_frozen: frozen,
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId);
  if (!row) throw new Error('Касса не найдена');
  assertCashierScope(session, row);
  applyCashierBlock(row, frozen, session.role === 'superadmin' ? 'owner' : 'manager');
  saveDemoStore(store);
  await supabase.from('cashiers').update({ is_active: !frozen }).eq('id', cashierId);
}

export async function fetchRiskBets(session: ManagerSession): Promise<RiskBet[]> {
  const { data, error } = await supabase.rpc('manager_list_risk_bets', { p_manager_id: session.id });
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    return rows.map((item) => parseRiskBet(asRecord(item)));
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const { data: bets } = await supabase.from('bets').select('*').order('created_at', { ascending: false }).limit(80);
  const open = (bets ?? [])
    .map((row) => parseRiskBet(asRecord(row)))
    .filter((row) => !['won', 'win', 'lost', 'void', 'cancelled'].includes(row.status));
  return open.sort((a, b) => b.potentialWin - a.potentialWin);
}

function parseRiskBet(raw: Record<string, unknown>): RiskBet {
  const amount = num(raw.amount);
  const odds = num(raw.odds ?? raw.total_odds);
  const potential = num(raw.potential_win ?? raw.potentialWin) || amount * odds;
  const status = str(raw.status, 'accepted');
  return {
    id: str(raw.id),
    matchId: str(raw.match_id ?? raw.matchId),
    selection: str(raw.selection),
    odds,
    amount,
    potentialWin: potential,
    status,
    homeTeam: str(raw.home_team ?? raw.homeTeam),
    awayTeam: str(raw.away_team ?? raw.awayTeam),
    type: str(raw.type, 'single'),
    ticketCode: str(raw.ticket_code ?? raw.ticketCode),
    createdAt: str(raw.created_at ?? raw.createdAt),
    suspicious: Boolean(raw.suspicious) || amount >= 200 || potential >= 800 || odds >= 10,
  };
}

export async function settleRiskBet(
  session: ManagerSession,
  betId: string,
  action: 'won' | 'void',
): Promise<void> {
  const { error } = await supabase.rpc('manager_settle_bet', {
    p_manager_id: session.id,
    p_bet_id: betId,
    p_action: action,
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const { data: bet, error: loadError } = await supabase.from('bets').select('*').eq('id', betId).maybeSingle();
  if (loadError || !bet) throw new Error('Ставка не найдена');
  const raw = asRecord(bet);
  const status = str(raw.status);
  if (['won', 'win', 'lost', 'void', 'cancelled'].includes(status)) throw new Error('Ставка уже закрыта');
  const credit = action === 'won'
    ? num(raw.potential_win) || num(raw.amount) * num(raw.odds)
    : num(raw.amount);
  const { error: updError } = await supabase.from('bets').update({ status: action === 'won' ? 'won' : 'void' }).eq('id', betId);
  if (updError) throw new Error('Не удалось обновить ставку');
  const walletId = str(raw.wallet_id);
  if (walletId) {
    const wallet = await supabase.from('wallets').select('id, balance').eq('id', walletId).maybeSingle();
    if (wallet.data?.id) {
      await supabase.from('wallets').update({
        balance: Number((num(wallet.data.balance) + credit).toFixed(2)),
      }).eq('id', wallet.data.id);
    }
  } else {
    const wallet = await supabase.from('wallets').select('id, balance').limit(1).maybeSingle();
    if (wallet.data?.id) {
      await supabase.from('wallets').update({
        balance: Number((num(wallet.data.balance) + credit).toFixed(2)),
      }).eq('id', wallet.data.id);
    }
  }
}

export function formatTmtmCompact(value: number): string {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} TMTM`;
}

export function formatDayLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export function ledgerPeriodFrom(period: LedgerPeriod): string {
  const now = new Date();
  if (period === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (period === '7d') {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function parseOpType(value: string): CashierOpType {
  if (value === 'payout' || value === 'topup' || value === 'collection') return value;
  return 'deposit';
}

function parseLedgerEntry(raw: Record<string, unknown>, cashierId?: string): CashierLedgerEntry {
  const type = parseOpType(str(raw.type));
  const amount = num(raw.amount);
  const signed = raw.signed_amount == null && raw.signedAmount == null
    ? (type === 'deposit' || type === 'collection' ? -amount : amount)
    : num(raw.signed_amount ?? raw.signedAmount);
  return {
    id: str(raw.id),
    cashierId: cashierId ?? (raw.cashier_id ? str(raw.cashier_id) : undefined),
    type,
    playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
    receiptCode: str(raw.receipt_code ?? raw.receiptCode),
    amount,
    signedAmount: signed,
    floatAfter: raw.float_after == null && raw.floatAfter == null ? null : num(raw.float_after ?? raw.floatAfter),
    status: str(raw.status) === 'failed' ? 'failed' : 'completed',
    createdAt: str(raw.created_at ?? raw.createdAt),
  };
}

export async function fetchCashierLedger(
  session: ManagerSession,
  cashierId: string,
  period: LedgerPeriod,
): Promise<CashierLedgerEntry[]> {
  const from = ledgerPeriodFrom(period);
  const { data, error } = await supabase.rpc('manager_cashier_ledger', {
    p_manager_id: session.id,
    p_cashier_id: cashierId,
    p_from: from,
  });
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => parseLedgerEntry(asRecord(row), cashierId));
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const table = await supabase
    .from('cashier_operations')
    .select('id, type, player_public_id, receipt_code, amount, float_after, status, created_at, cashier_id')
    .eq('cashier_id', cashierId)
    .gte('created_at', from)
    .order('created_at', { ascending: false });
  const fromDb = !table.error && table.data
    ? table.data.map((row) => parseLedgerEntry(asRecord(row), cashierId))
    : [];
  const fromDemo = loadDemoStore().ledger.filter(
    (row) => row.cashierId === cashierId && row.createdAt >= from,
  );
  const merged = [...fromDb, ...fromDemo.filter((demo) => !fromDb.some((row) => row.id === demo.id))];
  merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return merged;
}

export async function collectBackofficeCashier(
  session: ManagerSession,
  cashierId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('manager_collect_cashier', {
    p_manager_id: session.id,
    p_cashier_id: cashierId,
    p_amount: amount,
  });
  if (!error) return num(asRecord(data).float_balance ?? asRecord(data).floatBalance);
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId);
  if (!row) throw new Error('Касса не найдена');
  assertCashierScope(session, row);
  if (row.floatBalance < amount) throw new Error('Недостаточно средств в кассе для инкассации');
  row.floatBalance = Number((row.floatBalance - amount).toFixed(2));
  if (session.role === 'manager') creditManagerLimit(store, session.id, amount);
  store.ledger.unshift({
    id: crypto.randomUUID(),
    cashierId,
    type: 'collection',
    playerPublicId: 'CASH',
    receiptCode: `MC-LOCAL-${Date.now()}`,
    amount,
    signedAmount: -amount,
    floatAfter: row.floatBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  saveDemoStore(store);
  await supabase.from('cashiers').update({ float_balance: row.floatBalance }).eq('id', cashierId);
  return row.floatBalance;
}

export function cashierOpLabel(type: CashierOpType): string {
  if (type === 'deposit') return 'Пополнение игрока по ID';
  if (type === 'payout') return 'Выплата наличных по PIN';
  if (type === 'topup') return 'Пополнение кассы менеджером';
  return 'Сдача инкассации';
}

export function cashierOpRef(entry: CashierLedgerEntry): string {
  if (entry.type === 'deposit' && entry.playerPublicId) return `ID ${entry.playerPublicId}`;
  if (entry.type === 'payout' && entry.playerPublicId && entry.playerPublicId !== 'MANAGER') {
    return `PIN / ${entry.receiptCode || entry.playerPublicId}`;
  }
  return entry.receiptCode || '—';
}

export function exportCashierLedgerCsv(cashier: BackofficeCashier, rows: CashierLedgerEntry[]) {
  const header = ['Время', 'Тип', 'ID игрока / чек', 'Сумма', 'Баланс после', 'Статус'];
  const body = rows.map((row) => [
    formatBackofficeDateTime(row.createdAt),
    cashierOpLabel(row.type),
    cashierOpRef(row),
    String(row.signedAmount),
    row.floatAfter == null ? '' : String(row.floatAfter),
    row.status === 'completed' ? 'Успешно' : 'Отменено',
  ]);
  const csv = [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smena-${cashier.login}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBackofficeDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

export async function fetchNetworkManagers(session: ManagerSession): Promise<NetworkManager[]> {
  const store = loadDemoStore();
  const rows = session.role === 'superadmin'
    ? store.managers
    : store.managers.filter((row) => row.id === session.id);
  return rows.map((row) => toPublicManager(row, store.cashiers));
}

export async function fetchMyManagerLimit(session: ManagerSession): Promise<number | null> {
  if (session.role !== 'manager') return null;
  const mine = loadDemoStore().managers.find((row) => row.id === session.id);
  return mine?.allocatedBalance ?? 0;
}

export async function createNetworkManager(
  session: ManagerSession,
  params: {
    fullName: string;
    login: string;
    password: string;
    allocatedBalance: number;
    region?: string;
  },
): Promise<NetworkManager> {
  if (session.role !== 'superadmin') throw new Error('Создавать менеджеров может только владелец');
  const fullName = params.fullName.trim();
  const login = params.login.trim().toLowerCase();
  const password = params.password.trim();
  const region = (params.region ?? '').trim() || 'Регион';
  if (!fullName || !login || !password) throw new Error('Укажите имя, логин и пароль');
  if (!(params.allocatedBalance >= 0)) throw new Error('Укажите выделенный баланс');

  const store = loadDemoStore();
  const taken = [
    ...DEMO_ACCOUNTS.map((row) => row.login),
    ...store.managers.map((row) => row.login),
    ...store.cashiers.map((row) => row.login),
  ].some((value) => value.toLowerCase() === login);
  if (taken) throw new Error('Логин уже занят');

  const networkId = crypto.randomUUID();
  const row: StoredManager = {
    id: crypto.randomUUID(),
    login,
    pin: password,
    fullName,
    region,
    allocatedBalance: Number(params.allocatedBalance.toFixed(2)),
    networkId,
    networkName: `Сеть ${region}`,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  store.managers.push(row);
  saveDemoStore(store);
  return toPublicManager(row, store.cashiers);
}

export function peekNetworkCashiers(): BackofficeCashier[] {
  const store = loadDemoStore();
  return store.cashiers.map((row) => withLiveMetrics(store, row));
}

export function peekNetworkManagers(): NetworkManager[] {
  const store = loadDemoStore();
  return store.managers.map((row) => toPublicManager(row, store.cashiers));
}

export function cashiersOfManager(managerId: string): BackofficeCashier[] {
  return peekNetworkCashiers().filter((row) => row.managerId === managerId);
}

export function getCashierAccess(idOrLogin: string): {
  found: boolean;
  isActive: boolean;
  blockedBy: CashierBlockedBy | null;
  floatBalance: number;
} {
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === idOrLogin || item.login === idOrLogin.toLowerCase());
  if (!row) {
    return { found: false, isActive: true, blockedBy: null, floatBalance: 0 };
  }
  return {
    found: true,
    isActive: row.isActive,
    blockedBy: row.blockedBy ?? null,
    floatBalance: row.floatBalance,
  };
}

export function assertCashierOperational(idOrLogin: string) {
  const access = getCashierAccess(idOrLogin);
  if (access.found && !access.isActive) {
    throw new Error(CASHIER_BLOCKED_MESSAGE);
  }
}

export function toggleCashierBlock(agentId: string, blockedBy: CashierBlockedBy): BackofficeCashier {
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === agentId);
  if (!row) throw new Error('Касса не найдена');
  applyCashierBlock(row, row.isActive, blockedBy);
  saveDemoStore(store);
  return withLiveMetrics(store, row);
}

export function syncCashierFloatFromPos(cashierId: string, floatBalance: number) {
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId || item.login === cashierId);
  if (!row) return;
  row.floatBalance = Number(floatBalance.toFixed(2));
  saveDemoStore(store);
}

export function adjustCashierBalanceDirect(agentId: string, amount: number): BackofficeCashier {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) throw new Error('Укажите сумму корректировки');
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === agentId);
  if (!row) throw new Error('Касса не найдена');
  const next = Number((row.floatBalance + value).toFixed(2));
  if (next < 0) throw new Error('Недостаточно средств в кассе для списания');
  row.floatBalance = next;
  store.ledger.unshift({
    id: crypto.randomUUID(),
    cashierId: agentId,
    type: value > 0 ? 'topup' : 'collection',
    playerPublicId: 'OWNER',
    receiptCode: `MC-OWNER-${Date.now()}`,
    amount: Math.abs(value),
    signedAmount: value,
    floatAfter: row.floatBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  saveDemoStore(store);
  return withLiveMetrics(store, row);
}

export function managerCreditCashier(managerId: string, cashierId: string, amount: number): BackofficeCashier {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Укажите сумму пополнения');
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId);
  if (!row) throw new Error('Касса не найдена');
  if (row.managerId !== managerId) throw new Error('Эта точка не входит в вашу сеть');
  debitManagerLimit(store, managerId, value);
  row.floatBalance = Number((row.floatBalance + value).toFixed(2));
  store.ledger.unshift({
    id: crypto.randomUUID(),
    cashierId,
    type: 'topup',
    playerPublicId: 'MANAGER',
    receiptCode: `MC-MGR-${Date.now()}`,
    amount: value,
    signedAmount: value,
    floatAfter: row.floatBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  saveDemoStore(store);
  return withLiveMetrics(store, row);
}

export function managerCollectCashier(managerId: string, cashierId: string, amount: number): BackofficeCashier {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Укажите сумму инкассации');
  const store = loadDemoStore();
  const row = store.cashiers.find((item) => item.id === cashierId);
  if (!row) throw new Error('Касса не найдена');
  if (row.managerId !== managerId) throw new Error('Эта точка не входит в вашу сеть');
  if (row.floatBalance < value) throw new Error('Недостаточно средств в кассе для инкассации');
  row.floatBalance = Number((row.floatBalance - value).toFixed(2));
  creditManagerLimit(store, managerId, value);
  store.ledger.unshift({
    id: crypto.randomUUID(),
    cashierId,
    type: 'collection',
    playerPublicId: 'MANAGER',
    receiptCode: `MC-COL-${Date.now()}`,
    amount: value,
    signedAmount: -value,
    floatAfter: row.floatBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  saveDemoStore(store);
  return withLiveMetrics(store, row);
}

export function managerLimitOf(managerId: string): number {
  return loadDemoStore().managers.find((row) => row.id === managerId)?.allocatedBalance ?? 0;
}
