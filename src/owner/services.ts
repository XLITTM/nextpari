import { assertActiveOwnerContext, type OwnerStaffContext } from './auth/ownerAuth';
import type {
  BackofficeCashier,
  CashierLedgerEntry,
  CashierOpType,
  DashboardKpis,
  LedgerPeriod,
  RiskBet,
  VerticalKpi,
} from '../lib/backoffice';

export type {
  BackofficeCashier,
  CashierLedgerEntry,
  DashboardKpis,
  LedgerPeriod,
  OwnerStaffContext,
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

async function ownerJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
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

async function ownerData(path: string, init?: RequestInit): Promise<unknown> {
  const rec = await ownerJson(path, init);
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

export async function getCurrentOwnerContext(): Promise<OwnerStaffContext> {
  const rec = await ownerJson('/api/owner/me');
  return assertActiveOwnerContext(rec.staff);
}

export async function fetchOwnerDashboard(): Promise<DashboardKpis> {
  const data = await ownerData('/api/owner/dashboard');
  const raw = asRecord(data);
  const seriesRaw = Array.isArray(raw.series) ? raw.series : [];
  const verticalsRaw = asRecord(raw.verticals);
  return {
    role: 'superadmin',
    networkName: str(raw.network_name, 'Вся платформа'),
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

export type GameRtpPeriodKind = 'today' | '7d' | '30d' | 'custom';

export interface GameRtpMetrics {
  totalWagered: number;
  totalPayouts: number;
  rounds: number;
  winningRounds: number;
  ggr: number;
  realizedRtp: number | null;
  realizedHold: number | null;
}

export interface GameRtpGameRow extends GameRtpMetrics {
  gameCode: string;
  displayName: string;
  status?: string;
}

export interface GameRtpDayRow {
  date: string;
  totals: GameRtpMetrics;
  games: GameRtpGameRow[];
}

export interface GameRtpReport {
  timezone: string;
  theoreticalRtp: number;
  primaryWindow: string;
  period: {
    kind: GameRtpPeriodKind;
    from: string;
    to: string;
    startAt: string;
    endAt: string;
  };
  totals: GameRtpMetrics;
  games: GameRtpGameRow[];
  days: GameRtpDayRow[];
  note: string;
}

function parseMetrics(raw: Record<string, unknown>): GameRtpMetrics {
  const rtp = raw.realizedRtp ?? raw.realized_rtp;
  const hold = raw.realizedHold ?? raw.realized_hold;
  return {
    totalWagered: num(raw.totalWagered ?? raw.total_wagered),
    totalPayouts: num(raw.totalPayouts ?? raw.total_payouts),
    rounds: num(raw.rounds),
    winningRounds: num(raw.winningRounds ?? raw.winning_rounds),
    ggr: num(raw.ggr),
    realizedRtp: rtp == null ? null : num(rtp),
    realizedHold: hold == null ? null : num(hold),
  };
}

function parseGameRow(raw: Record<string, unknown>): GameRtpGameRow {
  return {
    gameCode: str(raw.gameCode ?? raw.game_code),
    displayName: str(raw.displayName ?? raw.display_name),
    status: raw.status == null ? undefined : str(raw.status),
    ...parseMetrics(raw),
  };
}

export async function fetchOwnerGameRtpReport(params: {
  period?: GameRtpPeriodKind;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
}): Promise<GameRtpReport> {
  const data = await ownerData('/api/owner/games/report' + ownerQuery({
    period: params.period ?? 'today',
    from: params.from ?? null,
    to: params.to ?? null,
    timezone: params.timezone ?? null,
  }));
  const raw = asRecord(data);
  const periodRaw = asRecord(raw.period);
  const kindRaw = str(periodRaw.kind, 'today');
  const kind: GameRtpPeriodKind = kindRaw === '7d' || kindRaw === '30d' || kindRaw === 'custom'
    ? kindRaw
    : 'today';
  return {
    timezone: str(raw.timezone, 'Asia/Ashgabat'),
    theoreticalRtp: num(raw.theoreticalRtp ?? raw.theoretical_rtp) || 0.875,
    primaryWindow: str(raw.primaryWindow ?? raw.primary_window, 'today'),
    period: {
      kind,
      from: str(periodRaw.from).slice(0, 10),
      to: str(periodRaw.to).slice(0, 10),
      startAt: str(periodRaw.startAt ?? periodRaw.start_at),
      endAt: str(periodRaw.endAt ?? periodRaw.end_at),
    },
    totals: parseMetrics(asRecord(raw.totals)),
    games: asRows(raw.games).map((row) => parseGameRow(asRecord(row))),
    days: asRows(raw.days).map((item) => {
      const day = asRecord(item);
      return {
        date: str(day.date).slice(0, 10),
        totals: parseMetrics(asRecord(day.totals)),
        games: asRows(day.games).map((row) => parseGameRow(asRecord(row))),
      };
    }),
    note: str(raw.note),
  };
}

export async function fetchOwnerCashiers(): Promise<BackofficeCashier[]> {
  const data = await ownerData('/api/owner/cashiers');
  return asRows(data).map((row) => parseCashier(asRecord(row)));
}

export async function fetchOwnerCashierLedger(params: {
  cashierId: string;
  from?: string | null;
}): Promise<CashierLedgerEntry[]> {
  const data = await ownerData(
    `/api/owner/cashiers/${encodeURIComponent(params.cashierId)}/ledger${ownerQuery({ from: params.from ?? null })}`,
  );
  return asRows(data).map((row) => parseLedgerEntry(asRecord(row), params.cashierId));
}

export async function fetchOwnerRiskBets(): Promise<RiskBet[]> {
  const data = await ownerData('/api/owner/risk-bets');
  return asRows(data).map((row) => parseRiskBet(asRecord(row)));
}

export interface OwnerPlayerListItem {
  id: string;
  profileId: string | null;
  walletId: string | null;
  publicId: string;
  email: string;
  phone: string;
  displayName: string;
  walletStatus: string;
  legacyBalance: number;
  availableBalance: number;
  lockedBalance: number;
  usdtBalance: number;
  blocked: boolean;
  createdAt: string;
}

export interface OwnerPlayerListPage {
  rows: OwnerPlayerListItem[];
  total: number;
}

export interface OwnerDossierSection<T> {
  supported: boolean;
  rows: T[];
  summary?: Record<string, unknown>;
  payoutRequests?: T[];
}

export interface OwnerPlayerDossier {
  profile: Record<string, unknown>;
  wallet: Record<string, unknown>;
  ledger: OwnerDossierSection<Record<string, unknown>>;
  sportsBets: OwnerDossierSection<Record<string, unknown>>;
  casino: OwnerDossierSection<Record<string, unknown>>;
  depositsWithdrawals: OwnerDossierSection<Record<string, unknown>>;
  vip: { supported: boolean };
  risk: Record<string, unknown>;
  messages: OwnerDossierSection<Record<string, unknown>>;
}

export interface OwnerWithdrawalRow {
  id: string;
  walletId: string | null;
  playerPublicId: string;
  amount: number;
  status: string;
  cashierId: string | null;
  paidAt: string | null;
  createdAt: string;
}

function parsePlayerListItem(raw: Record<string, unknown>): OwnerPlayerListItem {
  const publicId = str(raw.public_id ?? raw.publicId);
  const id = str(raw.id ?? raw.profile_id ?? raw.wallet_id, publicId);
  return {
    id,
    profileId: raw.profile_id == null && raw.profileId == null ? null : str(raw.profile_id ?? raw.profileId),
    walletId: raw.wallet_id == null && raw.walletId == null ? null : str(raw.wallet_id ?? raw.walletId),
    publicId,
    email: str(raw.email),
    phone: str(raw.phone),
    displayName: str(raw.display_name ?? raw.displayName, publicId),
    walletStatus: str(raw.wallet_status ?? raw.walletStatus, 'active'),
    legacyBalance: num(raw.legacy_balance ?? raw.legacyBalance),
    availableBalance: num(raw.available_balance ?? raw.availableBalance),
    lockedBalance: num(raw.locked_balance ?? raw.lockedBalance),
    usdtBalance: num(raw.usdt_balance ?? raw.usdtBalance),
    blocked: Boolean(raw.is_blocked ?? raw.blocked),
    createdAt: str(raw.created_at ?? raw.createdAt),
  };
}

function parsePayoutRequestRow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw.id ?? null,
    wallet_id: raw.wallet_id ?? raw.walletId ?? null,
    player_public_id: raw.player_public_id ?? raw.playerPublicId ?? '',
    amount: raw.amount ?? 0,
    status: raw.status ?? '',
    cashier_id: raw.cashier_id ?? raw.cashierId ?? null,
    paid_at: raw.paid_at ?? raw.paidAt ?? null,
    created_at: raw.created_at ?? raw.createdAt ?? null,
  };
}

function parseDossierSection(value: unknown): OwnerDossierSection<Record<string, unknown>> {
  const raw = asRecord(value);
  const rows = asRows(raw.rows).map((row) => asRecord(row));
  const payouts = raw.payout_requests == null && raw.payoutRequests == null
    ? undefined
    : asRows(raw.payout_requests ?? raw.payoutRequests).map((row) => parsePayoutRequestRow(asRecord(row)));
  return {
    supported: raw.supported !== false,
    rows,
    summary: raw.summary && typeof raw.summary === 'object' ? asRecord(raw.summary) : undefined,
    payoutRequests: payouts,
  };
}

export async function fetchOwnerPlayers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<OwnerPlayerListPage> {
  const data = await ownerData(`/api/owner/players${ownerQuery({
    search: params?.search?.trim() || null,
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
  })}`);
  const raw = asRecord(data);
  const rowsSource = Array.isArray(raw.rows) ? raw.rows : asRows(data);
  return {
    rows: rowsSource.map((row) => parsePlayerListItem(asRecord(row))),
    total: num(raw.total) || rowsSource.length,
  };
}

export async function fetchOwnerPlayerDossier(playerId: string): Promise<OwnerPlayerDossier> {
  const data = await ownerData(`/api/owner/players/${encodeURIComponent(playerId)}`);
  const raw = asRecord(data);
  const vipRaw = asRecord(raw.vip);
  return {
    profile: asRecord(raw.profile),
    wallet: asRecord(raw.wallet),
    ledger: parseDossierSection(raw.ledger),
    sportsBets: parseDossierSection(raw.sports_bets ?? raw.sportsBets),
    casino: parseDossierSection(raw.casino),
    depositsWithdrawals: parseDossierSection(raw.deposits_withdrawals ?? raw.depositsWithdrawals),
    vip: { supported: vipRaw.supported === true },
    risk: asRecord(raw.risk),
    messages: parseDossierSection(raw.messages),
  };
}

export async function setOwnerPlayerBlocked(params: {
  playerId: string;
  blocked: boolean;
  reason?: string | null;
}): Promise<void> {
  await ownerData(`/api/owner/players/${encodeURIComponent(params.playerId)}/block`, {
    method: 'POST',
    body: JSON.stringify({
      blocked: params.blocked,
      reason: params.reason?.trim() || null,
    }),
  });
}

export async function setOwnerCashierFrozen(params: {
  cashierId: string;
  frozen: boolean;
  reason?: string | null;
}): Promise<void> {
  await ownerData(`/api/owner/cashiers/${encodeURIComponent(params.cashierId)}/freeze`, {
    method: 'POST',
    body: JSON.stringify({
      frozen: params.frozen,
      reason: params.reason?.trim() || null,
    }),
  });
}

export async function fetchOwnerWithdrawals(params?: {
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ rows: OwnerWithdrawalRow[]; total: number }> {
  const data = await ownerData(`/api/owner/withdrawals${ownerQuery({
    status: params?.status?.trim() || null,
    limit: params?.limit ?? 100,
    offset: params?.offset ?? 0,
  })}`);
  const raw = asRecord(data);
  const rowsSource = Array.isArray(raw.rows) ? raw.rows : asRows(data);
  return {
    rows: rowsSource.map((row) => {
      const item = asRecord(row);
      return {
        id: str(item.id),
        walletId: item.wallet_id == null && item.walletId == null ? null : str(item.wallet_id ?? item.walletId),
        playerPublicId: str(item.player_public_id ?? item.playerPublicId),
        amount: num(item.amount),
        status: str(item.status, 'pending'),
        cashierId: item.cashier_id == null && item.cashierId == null ? null : str(item.cashier_id ?? item.cashierId),
        paidAt: item.paid_at == null && item.paidAt == null ? null : str(item.paid_at ?? item.paidAt),
        createdAt: str(item.created_at ?? item.createdAt),
      };
    }),
    total: num(raw.total) || rowsSource.length,
  };
}

export async function sendOwnerMessage(params: {
  targetType: 'player' | 'all';
  targetPlayerId?: string | null;
  title?: string | null;
  body: string;
}): Promise<void> {
  await ownerData('/api/owner/messages', {
    method: 'POST',
    body: JSON.stringify({
      targetType: params.targetType,
      targetPlayerId: params.targetType === 'player' ? (params.targetPlayerId ?? null) : null,
      title: params.title?.trim() || null,
      body: params.body,
    }),
  });
}

export interface OwnerManagerRow {
  managerId: string;
  login: string;
  fullName: string;
  status: string;
  networkId: string;
  networkName: string;
  authBound: boolean;
  authUserId: string | null;
  operationalBalance: number | null;
  operationalStatus: string;
  operationalMigrationState: string;
  cashierCount: number;
}

export interface OwnerManagerCashierRow {
  cashierId: string;
  login: string;
  fullName: string;
  city: string;
  pointName: string;
  isActive: boolean;
  authBound: boolean;
  operationalBalance: number | null;
  operationalStatus: string;
  operationalMigrationState: string;
}

function parseOwnerManager(raw: Record<string, unknown>): OwnerManagerRow {
  return {
    managerId: str(raw.manager_id ?? raw.managerId),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    status: str(raw.status),
    networkId: str(raw.network_id ?? raw.networkId),
    networkName: str(raw.network_name ?? raw.networkName),
    authBound: raw.auth_bound === true || raw.authBound === true,
    authUserId: raw.auth_user_id == null && raw.authUserId == null ? null : str(raw.auth_user_id ?? raw.authUserId),
    operationalBalance: raw.operational_balance == null && raw.operationalBalance == null
      ? null
      : num(raw.operational_balance ?? raw.operationalBalance),
    operationalStatus: str(raw.operational_status ?? raw.operationalStatus),
    operationalMigrationState: str(raw.operational_migration_state ?? raw.operationalMigrationState, 'staging'),
    cashierCount: num(raw.cashier_count ?? raw.cashierCount),
  };
}

function parseOwnerManagerCashier(raw: Record<string, unknown>): OwnerManagerCashierRow {
  return {
    cashierId: str(raw.cashier_id ?? raw.cashierId),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    city: str(raw.city),
    pointName: str(raw.point_name ?? raw.pointName),
    isActive: raw.is_active !== false && raw.isActive !== false,
    authBound: raw.auth_bound === true || raw.authBound === true,
    operationalBalance: raw.operational_balance == null && raw.operationalBalance == null
      ? null
      : num(raw.operational_balance ?? raw.operationalBalance),
    operationalStatus: str(raw.operational_status ?? raw.operationalStatus),
    operationalMigrationState: str(raw.operational_migration_state ?? raw.operationalMigrationState, 'staging'),
  };
}

export async function fetchOwnerManagers(): Promise<OwnerManagerRow[]> {
  const data = await ownerData('/api/owner/managers');
  const rec = asRecord(data);
  const rows = Array.isArray(rec.rows) ? rec.rows : asRows(data);
  return rows.map((row) => parseOwnerManager(asRecord(row)));
}

export async function fetchOwnerManagerDetail(managerId: string): Promise<{
  manager: OwnerManagerRow;
  cashiers: OwnerManagerCashierRow[];
}> {
  const data = await ownerData(`/api/owner/managers/${encodeURIComponent(managerId)}`);
  const rec = asRecord(data);
  return {
    manager: parseOwnerManager(asRecord(rec.manager)),
    cashiers: asRows(rec.cashiers).map((row) => parseOwnerManagerCashier(asRecord(row))),
  };
}

export async function postOwnerManager(input: {
  login: string;
  fullName: string;
  networkName: string;
  email: string;
  temporaryPassword: string;
}): Promise<OwnerManagerRow> {
  const data = await ownerData('/api/owner/managers', {
    method: 'POST',
    body: JSON.stringify({
      login: input.login,
      fullName: input.fullName,
      networkName: input.networkName,
      email: input.email,
      temporaryPassword: input.temporaryPassword,
    }),
  });
  return parseOwnerManager(asRecord(data));
}

export type OwnerFundTargetType = 'manager' | 'cashier' | 'player';

export interface OwnerTreasurySnapshot {
  currency: string;
  availableBalance: number | null;
  status: string;
  migrationState: string;
  version: number | null;
}

export interface OwnerTreasuryTransfer {
  id: string;
  transferNo: string;
  transferType: string;
  currency: string;
  amount: number;
  actorRole: string;
  createdAt: string;
  targetReference: string;
}

export interface OwnerTreasuryOverview {
  treasury: OwnerTreasurySnapshot | null;
  managers: { count: number; totalBalance: number | null };
  cashiers: { count: number; totalBalance: number | null };
  recentTransfers: OwnerTreasuryTransfer[];
}

export interface OwnerMoneyResult {
  ok: boolean;
  transferId: string;
  isDuplicate: boolean;
  amount: number;
  currency: string;
  fromBalanceAfter: number | null;
  toBalanceAfter: number | null;
  playerBalanceAfter: number | null;
  managerId: string | null;
  cashierId: string | null;
  playerPublicId: string | null;
}

function nullableNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTreasurySnapshot(raw: Record<string, unknown>): OwnerTreasurySnapshot | null {
  if (Object.keys(raw).length === 0) return null;
  const available = nullableNum(raw.available_balance ?? raw.availableBalance);
  return {
    currency: str(raw.currency, 'TMTM'),
    availableBalance: available,
    status: str(raw.status),
    migrationState: str(raw.migration_state ?? raw.migrationState),
    version: nullableNum(raw.version),
  };
}

function parseTreasuryTransfer(raw: Record<string, unknown>): OwnerTreasuryTransfer {
  return {
    id: str(raw.id),
    transferNo: str(raw.transfer_no ?? raw.transferNo),
    transferType: str(raw.transfer_type ?? raw.transferType),
    currency: str(raw.currency, 'TMTM'),
    amount: nullableNum(raw.amount) ?? 0,
    actorRole: str(raw.actor_role ?? raw.actorRole),
    createdAt: str(raw.created_at ?? raw.createdAt),
    targetReference: str(raw.target_reference ?? raw.targetReference ?? raw.transfer_no ?? raw.transferNo ?? raw.id),
  };
}

function parseOwnerMoneyResult(raw: Record<string, unknown>): OwnerMoneyResult {
  return {
    ok: raw.ok !== false,
    transferId: str(raw.transfer_id ?? raw.transferId),
    isDuplicate: raw.is_duplicate === true || raw.isDuplicate === true,
    amount: nullableNum(raw.amount) ?? 0,
    currency: str(raw.currency, 'TMTM'),
    fromBalanceAfter: nullableNum(raw.from_balance_after ?? raw.fromBalanceAfter),
    toBalanceAfter: nullableNum(raw.to_balance_after ?? raw.toBalanceAfter),
    playerBalanceAfter: nullableNum(raw.player_balance_after ?? raw.playerBalanceAfter),
    managerId: raw.manager_id == null && raw.managerId == null ? null : str(raw.manager_id ?? raw.managerId),
    cashierId: raw.cashier_id == null && raw.cashierId == null ? null : str(raw.cashier_id ?? raw.cashierId),
    playerPublicId: raw.player_public_id == null && raw.playerPublicId == null
      ? null
      : str(raw.player_public_id ?? raw.playerPublicId),
  };
}

export async function fetchOwnerTreasury(): Promise<OwnerTreasuryOverview> {
  const data = await ownerData('/api/owner/treasury');
  const rec = asRecord(data);
  const managers = asRecord(rec.managers);
  const cashiers = asRecord(rec.cashiers);
  return {
    treasury: parseTreasurySnapshot(asRecord(rec.treasury)),
    managers: {
      count: num(managers.count),
      totalBalance: nullableNum(managers.total_balance ?? managers.totalBalance),
    },
    cashiers: {
      count: num(cashiers.count),
      totalBalance: nullableNum(cashiers.total_balance ?? cashiers.totalBalance),
    },
    recentTransfers: asRows(rec.recent_transfers ?? rec.recentTransfers).map((row) => (
      parseTreasuryTransfer(asRecord(row))
    )),
  };
}

export async function postOwnerCapitalIn(input: {
  amount: number;
  idempotencyKey: string;
  note: string;
}): Promise<OwnerMoneyResult> {
  const data = await ownerData('/api/owner/treasury', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
    }),
  });
  return parseOwnerMoneyResult(asRecord(data));
}

export async function postOwnerFund(input: {
  targetType: OwnerFundTargetType;
  targetId: string;
  amount: number;
  idempotencyKey: string;
  note?: string | null;
}): Promise<OwnerMoneyResult> {
  const data = await ownerData('/api/owner/fund', {
    method: 'POST',
    body: JSON.stringify({
      targetType: input.targetType,
      targetId: input.targetId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      note: input.note?.trim() || null,
    }),
  });
  return parseOwnerMoneyResult(asRecord(data));
}

export async function fetchOwnerCashierOperationalMap(): Promise<Record<string, OwnerManagerCashierRow>> {
  const managers = await fetchOwnerManagers();
  const entries = await Promise.all(managers.map(async (row) => {
    try {
      const detail = await fetchOwnerManagerDetail(row.managerId);
      return detail.cashiers;
    } catch {
      return [] as OwnerManagerCashierRow[];
    }
  }));
  const map: Record<string, OwnerManagerCashierRow> = {};
  for (const cashier of entries.flat()) {
    if (cashier.cashierId) map[cashier.cashierId] = cashier;
  }
  return map;
}

export function formatTmtmCompact(value: number | null | undefined): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} TMTM`;
}

export function formatDayLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
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
