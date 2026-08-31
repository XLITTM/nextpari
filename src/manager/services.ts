import type {
  BackofficeCashier,
  CashierLedgerEntry,
  CashierOpType,
  DashboardKpis,
  RiskBet,
  VerticalKpi,
} from '../lib/backoffice';

export type {
  BackofficeCashier,
  CashierLedgerEntry,
  DashboardKpis,
  RiskBet,
  VerticalKpi,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
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

function ownerQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function managerJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, 'Ошибка'));
  }
  return rec;
}

async function managerData(path: string, init?: RequestInit): Promise<unknown> {
  const rec = await managerJson(path, init);
  return rec.data;
}

function asRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  return [data];
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

function parseRiskBet(raw: Record<string, unknown>): RiskBet {
  const amount = num(raw.amount);
  const odds = num(raw.odds ?? raw.total_odds);
  const potential = num(raw.potential_win ?? raw.potentialWin) || amount * odds;
  return {
    id: str(raw.id),
    matchId: str(raw.match_id ?? raw.matchId),
    selection: str(raw.selection),
    odds,
    amount,
    potentialWin: potential,
    status: str(raw.status, 'accepted'),
    homeTeam: str(raw.home_team ?? raw.homeTeam),
    awayTeam: str(raw.away_team ?? raw.awayTeam),
    type: str(raw.type, 'single'),
    ticketCode: str(raw.ticket_code ?? raw.ticketCode),
    createdAt: str(raw.created_at ?? raw.createdAt),
    suspicious: Boolean(raw.suspicious) || amount >= 200 || potential >= 800 || odds >= 10,
  };
}

export async function fetchManagerDashboard(): Promise<DashboardKpis> {
  const data = await managerData('/api/manager/dashboard');
  const raw = asRecord(data);
  const seriesRaw = Array.isArray(raw.series) ? raw.series : [];
  const verticalsRaw = asRecord(raw.verticals);
  return {
    role: 'manager',
    networkName: str(raw.network_name, 'Сеть'),
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

export async function fetchManagerCashiers(): Promise<BackofficeCashier[]> {
  const data = await managerData('/api/manager/cashiers');
  return asRows(data).map((row) => parseCashier(asRecord(row)));
}

export async function fetchManagerCashierLedger(params: {
  cashierId: string;
  from?: string | null;
}): Promise<CashierLedgerEntry[]> {
  const data = await managerData(
    `/api/manager/cashiers/${encodeURIComponent(params.cashierId)}/ledger${ownerQuery({ from: params.from ?? null })}`,
  );
  return asRows(data).map((row) => parseLedgerEntry(asRecord(row), params.cashierId));
}

export async function fetchManagerRiskBets(): Promise<RiskBet[]> {
  const data = await managerData('/api/manager/risk-bets');
  return asRows(data).map((row) => parseRiskBet(asRecord(row)));
}

export async function setManagerCashierFrozen(params: {
  cashierId: string;
  frozen: boolean;
}): Promise<void> {
  await managerData(`/api/manager/cashiers/${encodeURIComponent(params.cashierId)}/freeze`, {
    method: 'POST',
    body: JSON.stringify({ frozen: params.frozen }),
  });
}

export interface ManagerPlayerListPage {
  rows: unknown[];
  total: number;
  available: boolean;
}

export async function fetchManagerPlayers(): Promise<ManagerPlayerListPage> {
  const data = await managerData('/api/manager/players');
  const raw = asRecord(data);
  return {
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    total: num(raw.total),
    available: raw.available === true,
  };
}

export async function fetchManagerMessages(): Promise<{ rows: unknown[]; available: boolean }> {
  const data = await managerData('/api/manager/messages');
  const raw = asRecord(data);
  return {
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    available: raw.available === true,
  };
}

export function formatTmtmCompact(value: number | null | undefined): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} TMTM`;
}
