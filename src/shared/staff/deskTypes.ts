export type ManagerRole = 'superadmin' | 'manager';

export type CashierOpType = 'deposit' | 'payout' | 'topup' | 'collection';
export type LedgerPeriod = 'today' | '7d' | 'month';
export type CashierBlockedBy = 'owner' | 'manager';

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
