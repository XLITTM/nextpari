import { assertActiveOwnerContext, type OwnerStaffContext } from './auth/ownerAuth';
import type {
  BackofficeCashier,
  CashierLedgerEntry,
  CashierOpType,
  DashboardKpis,
  LedgerPeriod,
  RiskBet,
  VerticalKpi,
} from '../shared/staff/deskTypes';

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

export type GameRtpModel = 'fixed-target' | 'progressive' | 'unconfigured';

export interface GameRtpGameRow extends GameRtpMetrics {
  gameCode: string;
  displayName: string;
  status?: string;
  theoreticalRtpTarget: number | null;
  rtpModel: GameRtpModel;
}

export interface GameRtpDayRow {
  date: string;
  totals: GameRtpMetrics;
  games: GameRtpGameRow[];
}

export interface GameRtpReport {
  timezone: string;
  controlledGameTargetRtp: number;
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

const CONTROLLED_REPORT_GAMES = new Set([
  'pharaoh',
  'dice',
  'blackjack',
  'crystal',
  'aviator',
]);

function parseRtpModel(raw: Record<string, unknown>): GameRtpModel {
  const model = str(raw.rtpModel ?? raw.rtp_model);
  const code = str(raw.gameCode ?? raw.game_code);
  if (model === 'progressive' || code === 'apples') return 'progressive';
  if (model === 'unconfigured') return 'unconfigured';
  if (model === 'fixed-target' || CONTROLLED_REPORT_GAMES.has(code)) return 'fixed-target';
  return 'unconfigured';
}

function parseGameRow(raw: Record<string, unknown>): GameRtpGameRow {
  const rtpModel = parseRtpModel(raw);
  const targetRaw = raw.theoreticalRtpTarget ?? raw.theoretical_rtp_target;
  return {
    gameCode: str(raw.gameCode ?? raw.game_code),
    displayName: str(raw.displayName ?? raw.display_name),
    status: raw.status == null ? undefined : str(raw.status),
    theoreticalRtpTarget: rtpModel === 'fixed-target'
      ? (targetRaw == null ? 0.875 : num(targetRaw))
      : null,
    rtpModel,
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
    controlledGameTargetRtp: num(
      raw.controlledGameTargetRtp ?? raw.controlled_game_target_rtp,
    ) || 0.875,
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

export type OwnerSecurityFlagStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';
export type OwnerSecurityFlagSeverity = 'low' | 'medium' | 'high';
export type OwnerSecurityFlagType =
  | 'SHARED_DEVICE'
  | 'SHARED_NETWORK'
  | 'LOGIN_FAILURE_BURST'
  | 'AUTH_RATE_LIMITED'
  | 'HIGH_WIN_FREQUENCY'
  | 'HIGH_NET_PROFIT'
  | 'HIGH_ROI';

export interface OwnerSecurityOverview {
  openFlags: number;
  highSeverityFlags: number;
  loginFailures: number;
  rateLimitedAttempts: number;
  sharedDeviceFlags: number;
  sharedNetworkFlags: number;
}

export interface OwnerSecurityFlag {
  id: string;
  playerPublicId: string;
  flagType: string;
  source: string;
  severity: string;
  status: string;
  signalCount: number;
  relatedPlayerCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  details: Record<string, unknown>;
  resolutionReason: string;
}

export interface OwnerSecurityEvent {
  id: string;
  eventType: string;
  riskLevel: string;
  identifierRef: string;
  deviceRef: string;
  networkRef: string;
  userAgentRef: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OwnerPlayerSecurityDossier {
  playerPublicId: string;
  flags: OwnerSecurityFlag[];
  events: OwnerSecurityEvent[];
  winPattern: OwnerWinPatternExtras;
}

function parseSecurityOverview(raw: unknown): OwnerSecurityOverview {
  const item = asRecord(raw);
  return {
    openFlags: num(item.open_flags ?? item.openFlags),
    highSeverityFlags: num(item.high_severity_flags ?? item.highSeverityFlags),
    loginFailures: num(item.login_failures ?? item.loginFailures),
    rateLimitedAttempts: num(item.rate_limited_attempts ?? item.rateLimitedAttempts),
    sharedDeviceFlags: num(item.shared_device_flags ?? item.sharedDeviceFlags),
    sharedNetworkFlags: num(item.shared_network_flags ?? item.sharedNetworkFlags),
  };
}

function parseSecurityFlag(raw: unknown): OwnerSecurityFlag {
  const item = asRecord(raw);
  const details = asRecord(item.details);
  return {
    id: str(item.id),
    playerPublicId: str(item.player_public_id ?? item.playerPublicId),
    flagType: str(item.flag_type ?? item.flagType),
    source: str(item.source ?? details.source),
    severity: str(item.severity),
    status: str(item.status),
    signalCount: num(item.signal_count ?? item.signalCount),
    relatedPlayerCount: num(item.related_player_count ?? item.relatedPlayerCount),
    firstSeenAt: str(item.first_seen_at ?? item.firstSeenAt),
    lastSeenAt: str(item.last_seen_at ?? item.lastSeenAt),
    details,
    resolutionReason: str(item.resolution_reason ?? item.resolutionReason),
  };
}

function parseSecurityEvent(raw: unknown): OwnerSecurityEvent {
  const item = asRecord(raw);
  return {
    id: str(item.id),
    eventType: str(item.event_type ?? item.eventType),
    riskLevel: str(item.risk_level ?? item.riskLevel),
    identifierRef: str(item.identifier_ref ?? item.identifierRef),
    deviceRef: str(item.device_ref ?? item.deviceRef),
    networkRef: str(item.network_ref ?? item.networkRef),
    userAgentRef: str(item.user_agent_ref ?? item.userAgentRef),
    metadata: asRecord(item.metadata),
    createdAt: str(item.created_at ?? item.createdAt),
  };
}

export async function fetchOwnerSecurityOverview(): Promise<OwnerSecurityOverview> {
  const data = await ownerData('/api/owner/security/overview');
  return parseSecurityOverview(data);
}

export async function fetchOwnerSecurityFlags(params: {
  status?: string | null;
  severity?: string | null;
  flagType?: string | null;
  playerId?: string | null;
  from?: string | null;
  to?: string | null;
} = {}): Promise<OwnerSecurityFlag[]> {
  const data = await ownerData('/api/owner/security/flags' + ownerQuery({
    status: params.status ?? null,
    severity: params.severity ?? null,
    flagType: params.flagType ?? null,
    playerId: params.playerId ?? null,
    from: params.from ?? null,
    to: params.to ?? null,
  }));
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map(parseSecurityFlag);
}

export async function fetchOwnerPlayerSecurity(playerId: string): Promise<OwnerPlayerSecurityDossier> {
  const data = await ownerData(`/api/owner/players/${encodeURIComponent(playerId)}/security`);
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    flags: asRows(rec.flags).map(parseSecurityFlag),
    events: asRows(rec.events).map(parseSecurityEvent),
    winPattern: parseWinPatternExtras(rec.win_pattern ?? rec.winPattern),
  };
}

export interface OwnerWinPatternSettings {
  source: string;
  enabled: boolean;
  lookbackHours: number;
  minimumSettledCount: number;
  minimumTotalStake: number;
  winRateThreshold: number;
  netProfitThreshold: number;
  roiThreshold: number;
  updatedAt: string;
}

export interface OwnerWinPatternExtras {
  linkedSharingFlags: Array<Record<string, unknown>>;
  linkedWinPatternOverlap: Array<Record<string, unknown>>;
  ownedGamesRecent: Array<Record<string, unknown>>;
  metrics: Record<string, Record<string, unknown>>;
}

function parseWinPatternExtras(raw: unknown): OwnerWinPatternExtras {
  const rec = asRecord(raw);
  return {
    linkedSharingFlags: asRows(rec.linked_sharing_flags ?? rec.linkedSharingFlags).map(asRecord),
    linkedWinPatternOverlap: asRows(rec.linked_win_pattern_overlap ?? rec.linkedWinPatternOverlap).map(asRecord),
    ownedGamesRecent: asRows(rec.owned_games_recent ?? rec.ownedGamesRecent).map(asRecord),
    metrics: asRecord(rec.metrics) as Record<string, Record<string, unknown>>,
  };
}

function parseWinPatternSettings(raw: unknown): OwnerWinPatternSettings {
  const item = asRecord(raw);
  return {
    source: str(item.source),
    enabled: Boolean(item.enabled),
    lookbackHours: num(item.lookback_hours ?? item.lookbackHours),
    minimumSettledCount: num(item.minimum_settled_count ?? item.minimumSettledCount),
    minimumTotalStake: num(item.minimum_total_stake ?? item.minimumTotalStake),
    winRateThreshold: num(item.win_rate_threshold ?? item.winRateThreshold),
    netProfitThreshold: num(item.net_profit_threshold ?? item.netProfitThreshold),
    roiThreshold: num(item.roi_threshold ?? item.roiThreshold),
    updatedAt: str(item.updated_at ?? item.updatedAt),
  };
}

export async function fetchOwnerWinPatternSettings(): Promise<OwnerWinPatternSettings[]> {
  const data = await ownerData('/api/owner/security/win-pattern-settings');
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map(parseWinPatternSettings);
}

export async function saveOwnerWinPatternSettings(input: {
  source: string;
  enabled: boolean;
  lookbackHours: number;
  minimumSettledCount: number;
  minimumTotalStake: number;
  winRateThreshold: number;
  netProfitThreshold: number;
  roiThreshold: number;
}): Promise<void> {
  await ownerJson('/api/owner/security/win-pattern-settings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function resolveOwnerSecurityFlag(input: {
  flagId: string;
  action: 'review' | 'resolve' | 'dismiss';
  reason?: string;
}): Promise<void> {
  await ownerJson(`/api/owner/security/flags/${encodeURIComponent(input.flagId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      action: input.action,
      reason: input.reason ?? '',
    }),
  });
}

export interface OwnerPlayerSecurityRestriction {
  playerPublicId: string;
  restricted: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export async function fetchOwnerPlayerSecurityRestriction(
  playerId: string,
): Promise<OwnerPlayerSecurityRestriction> {
  const data = await ownerData(
    `/api/owner/players/${encodeURIComponent(playerId)}/security-restriction`,
  );
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    restricted: Boolean(rec.restricted),
    reason: rec.reason == null ? null : str(rec.reason),
    updatedAt: rec.updated_at == null && rec.updatedAt == null
      ? null
      : str(rec.updated_at ?? rec.updatedAt),
  };
}

export async function setOwnerPlayerSecurityRestriction(params: {
  playerId: string;
  restricted: boolean;
  reason: string;
}): Promise<void> {
  await ownerData(`/api/owner/players/${encodeURIComponent(params.playerId)}/security-restriction`, {
    method: 'POST',
    body: JSON.stringify({
      restricted: params.restricted,
      reason: params.reason,
    }),
  });
}

export interface OwnerPlayerManualVerification {
  playerPublicId: string;
  verificationRequested: boolean;
  status: string | null;
  requestedAt: string | null;
  requestedByRole: string | null;
  hasVerifiedEmail: boolean;
  instructionsSent: boolean;
  restrictionEnabledWithRequest: boolean;
  restricted: boolean;
}

export async function fetchOwnerPlayerManualVerification(
  playerId: string,
): Promise<OwnerPlayerManualVerification> {
  const data = await ownerData(
    `/api/owner/players/${encodeURIComponent(playerId)}/verification-request`,
  );
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    verificationRequested: rec.verification_requested === true || rec.verificationRequested === true,
    status: rec.status == null ? null : str(rec.status),
    requestedAt: rec.requested_at == null && rec.requestedAt == null
      ? null
      : str(rec.requested_at ?? rec.requestedAt),
    requestedByRole: rec.requested_by_role == null && rec.requestedByRole == null
      ? null
      : str(rec.requested_by_role ?? rec.requestedByRole),
    hasVerifiedEmail: rec.has_verified_email === true || rec.hasVerifiedEmail === true,
    instructionsSent: rec.instructions_sent === true || rec.instructionsSent === true,
    restrictionEnabledWithRequest:
      rec.restriction_enabled_with_request === true || rec.restrictionEnabledWithRequest === true,
    restricted: rec.restricted === true,
  };
}

export async function requestOwnerPlayerManualVerification(params: {
  playerId: string;
  reason: string;
  reasonCode?: string;
}): Promise<void> {
  await ownerData(`/api/owner/players/${encodeURIComponent(params.playerId)}/verification-request`, {
    method: 'POST',
    body: JSON.stringify({
      reason: params.reason,
      reasonCode: params.reasonCode ?? '',
    }),
  });
}

export async function completeOwnerPlayerManualVerification(playerId: string): Promise<void> {
  await ownerData(`/api/owner/players/${encodeURIComponent(playerId)}/verification-complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface OwnerPlayerPersonalDataSummary {
  playerPublicId: string;
  hasRow: boolean;
  questionnaireComplete: boolean;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  citizenshipCountryCode: string;
  residenceCountryCode: string;
  residenceCity: string;
  documentType: string;
  documentNumberMasked: string;
  updatedAt: string | null;
}

export async function fetchOwnerPlayerPersonalData(
  playerId: string,
): Promise<OwnerPlayerPersonalDataSummary> {
  const data = await ownerData(
    `/api/owner/players/${encodeURIComponent(playerId)}/personal-data`,
  );
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    hasRow: rec.has_row === true || rec.hasRow === true,
    questionnaireComplete: rec.questionnaire_complete === true || rec.questionnaireComplete === true,
    firstName: str(rec.first_name ?? rec.firstName),
    lastName: str(rec.last_name ?? rec.lastName),
    dateOfBirth: str(rec.date_of_birth ?? rec.dateOfBirth),
    citizenshipCountryCode: str(rec.citizenship_country_code ?? rec.citizenshipCountryCode).toUpperCase(),
    residenceCountryCode: str(rec.residence_country_code ?? rec.residenceCountryCode).toUpperCase(),
    residenceCity: str(rec.residence_city ?? rec.residenceCity),
    documentType: str(rec.document_type ?? rec.documentType),
    documentNumberMasked: str(rec.document_number_masked ?? rec.documentNumberMasked),
    updatedAt: rec.updated_at == null && rec.updatedAt == null
      ? null
      : str(rec.updated_at ?? rec.updatedAt),
  };
}

export interface OwnerSecuritySportsLeg {
  fixtureLabel: string;
  league: string;
  fixtureId: string;
  marketKey: string;
  marketId: string;
  line: string;
  outcomeName: string;
  outcomeId: string;
  acceptedOdds: number;
  marketStatus: string;
  legStatus: string;
  providerLastUpdate: string;
  feedType: string;
  provider: string;
  settlementResult: string;
}

export interface OwnerSecuritySportsBet {
  betId: string;
  displayRef: string;
  acceptedAt: string;
  feedType: string;
  mode: string;
  stake: number;
  acceptedOdds: number;
  potentialPayout: number;
  currency: string;
  status: string;
  statusBucket: string;
  settlementState: string;
  settledAt: string;
  provider: string;
  legs: OwnerSecuritySportsLeg[];
}

export interface OwnerSecuritySportsPage {
  playerPublicId: string;
  total: number;
  limit: number;
  offset: number;
  rows: OwnerSecuritySportsBet[];
}

export interface OwnerSecuritySportsSummary {
  playerPublicId: string;
  betsCount: number;
  totalStake: number;
  settledPayout: number | null;
  sportsGgr: number | null;
  averageStake: number | null;
  averageAcceptedOdds: number | null;
  singleCount: number;
  expressCount: number;
  liveCount: number;
  prematchCount: number;
  mostUsedLeagues: Array<{ label: string; count: number }>;
  mostUsedMarkets: Array<{ label: string; count: number }>;
  recentBets: OwnerSecuritySportsBet[];
  indicators: {
    repeatedFixtures: Array<{ fixtureId: string; fixtureLabel: string; count: number }>;
    rapidSequenceCount: number;
    linkedAccountPublicIds: string[];
    linkedSharedFixtures: number;
    automaticRestriction: boolean;
    closingPriceAvailable: boolean;
  };
  securityActivity: Array<Record<string, unknown>>;
}

function parseSportsLeg(raw: unknown): OwnerSecuritySportsLeg {
  const item = asRecord(raw);
  return {
    fixtureLabel: str(item.fixture_label ?? item.fixtureLabel),
    league: str(item.league),
    fixtureId: str(item.fixture_id ?? item.fixtureId),
    marketKey: str(item.market_key ?? item.marketKey),
    marketId: str(item.market_id ?? item.marketId),
    line: str(item.line),
    outcomeName: str(item.outcome_name ?? item.outcomeName),
    outcomeId: str(item.outcome_id ?? item.outcomeId),
    acceptedOdds: num(item.accepted_odds ?? item.acceptedOdds),
    marketStatus: str(item.market_status ?? item.marketStatus),
    legStatus: str(item.leg_status ?? item.legStatus),
    providerLastUpdate: str(item.provider_last_update ?? item.providerLastUpdate),
    feedType: str(item.feed_type ?? item.feedType),
    provider: str(item.provider),
    settlementResult: str(item.settlement_result ?? item.settlementResult),
  };
}

function parseSportsBet(raw: unknown): OwnerSecuritySportsBet {
  const item = asRecord(raw);
  return {
    betId: str(item.bet_id ?? item.betId),
    displayRef: str(item.display_ref ?? item.displayRef),
    acceptedAt: str(item.accepted_at ?? item.acceptedAt),
    feedType: str(item.feed_type ?? item.feedType),
    mode: str(item.mode),
    stake: num(item.stake),
    acceptedOdds: num(item.accepted_odds ?? item.acceptedOdds),
    potentialPayout: num(item.potential_payout ?? item.potentialPayout),
    currency: str(item.currency, 'TMTM'),
    status: str(item.status),
    statusBucket: str(item.status_bucket ?? item.statusBucket),
    settlementState: str(item.settlement_state ?? item.settlementState),
    settledAt: str(item.settled_at ?? item.settledAt),
    provider: str(item.provider),
    legs: asRows(item.legs).map(parseSportsLeg),
  };
}

export async function fetchOwnerPlayerSportsBets(params: {
  playerId: string;
  from?: string | null;
  to?: string | null;
  feedType?: string | null;
  mode?: string | null;
  status?: string | null;
  league?: string | null;
  fixture?: string | null;
  market?: string | null;
  minStake?: number | null;
  minOdds?: number | null;
  limit?: number;
  offset?: number;
}): Promise<OwnerSecuritySportsPage> {
  const data = await ownerData(`/api/owner/players/${encodeURIComponent(params.playerId)}/sports` + ownerQuery({
    from: params.from ?? null,
    to: params.to ?? null,
    feedType: params.feedType ?? null,
    mode: params.mode ?? null,
    status: params.status ?? null,
    league: params.league ?? null,
    fixture: params.fixture ?? null,
    market: params.market ?? null,
    minStake: params.minStake ?? null,
    minOdds: params.minOdds ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  }));
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, params.playerId),
    total: num(rec.total),
    limit: num(rec.limit) || 50,
    offset: num(rec.offset),
    rows: asRows(rec.rows).map(parseSportsBet),
  };
}

export async function fetchOwnerPlayerSportsSummary(params: {
  playerId: string;
  from?: string | null;
  to?: string | null;
}): Promise<OwnerSecuritySportsSummary> {
  const data = await ownerData(
    `/api/owner/players/${encodeURIComponent(params.playerId)}/sports/summary` + ownerQuery({
      from: params.from ?? null,
      to: params.to ?? null,
    }),
  );
  const rec = asRecord(data);
  const indicators = asRecord(rec.indicators);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, params.playerId),
    betsCount: num(rec.bets_count ?? rec.betsCount),
    totalStake: num(rec.total_stake ?? rec.totalStake),
    settledPayout: rec.settled_payout == null && rec.settledPayout == null
      ? null
      : num(rec.settled_payout ?? rec.settledPayout),
    sportsGgr: rec.sports_ggr == null && rec.sportsGgr == null ? null : num(rec.sports_ggr ?? rec.sportsGgr),
    averageStake: rec.average_stake == null && rec.averageStake == null
      ? null
      : num(rec.average_stake ?? rec.averageStake),
    averageAcceptedOdds: rec.average_accepted_odds == null && rec.averageAcceptedOdds == null
      ? null
      : num(rec.average_accepted_odds ?? rec.averageAcceptedOdds),
    singleCount: num(rec.single_count ?? rec.singleCount),
    expressCount: num(rec.express_count ?? rec.expressCount),
    liveCount: num(rec.live_count ?? rec.liveCount),
    prematchCount: num(rec.prematch_count ?? rec.prematchCount),
    mostUsedLeagues: asRows(rec.most_used_leagues ?? rec.mostUsedLeagues).map((row) => {
      const item = asRecord(row);
      return { label: str(item.label), count: num(item.count) };
    }),
    mostUsedMarkets: asRows(rec.most_used_markets ?? rec.mostUsedMarkets).map((row) => {
      const item = asRecord(row);
      return { label: str(item.label), count: num(item.count) };
    }),
    recentBets: asRows(rec.recent_bets ?? rec.recentBets).map(parseSportsBet),
    indicators: {
      repeatedFixtures: asRows(indicators.repeated_fixtures ?? indicators.repeatedFixtures).map((row) => {
        const item = asRecord(row);
        return {
          fixtureId: str(item.fixture_id ?? item.fixtureId),
          fixtureLabel: str(item.fixture_label ?? item.fixtureLabel),
          count: num(item.count),
        };
      }),
      rapidSequenceCount: num(indicators.rapid_sequence_count ?? indicators.rapidSequenceCount),
      linkedAccountPublicIds: asRows(
        indicators.linked_account_public_ids ?? indicators.linkedAccountPublicIds,
      ).map((value) => str(value)),
      linkedSharedFixtures: num(indicators.linked_shared_fixtures ?? indicators.linkedSharedFixtures),
      automaticRestriction: indicators.automatic_restriction === true,
      closingPriceAvailable: indicators.closing_price_available === true,
    },
    securityActivity: asRows(rec.security_activity ?? rec.securityActivity).map((row) => asRecord(row)),
  };
}

export async function fetchOwnerPlayerSportsBet(
  playerId: string,
  betId: string,
): Promise<OwnerSecuritySportsBet> {
  const data = await ownerData(
    `/api/owner/players/${encodeURIComponent(playerId)}/sports/${encodeURIComponent(betId)}`,
  );
  return parseSportsBet(data);
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
  method: string;
  methodLabel: string;
  amount: number;
  status: string;
  cashierId: string | null;
  paidAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  destinationRef: string | null;
  cashPickupCity: string | null;
  cashPickupPoint: string | null;
}

export function parseOwnerWithdrawalRow(raw: unknown): OwnerWithdrawalRow {
  const item = asRecord(raw);
  return {
    id: str(item.id),
    walletId: item.wallet_id == null && item.walletId == null ? null : str(item.wallet_id ?? item.walletId),
    playerPublicId: str(item.player_public_id ?? item.playerPublicId),
    method: str(item.method),
    methodLabel: str(item.method_label ?? item.methodLabel),
    amount: num(item.amount),
    status: str(item.status, 'pending'),
    cashierId: item.cashier_id == null && item.cashierId == null ? null : str(item.cashier_id ?? item.cashierId),
    paidAt: item.paid_at == null && item.paidAt == null ? null : str(item.paid_at ?? item.paidAt),
    createdAt: str(item.created_at ?? item.createdAt),
    rejectionReason: item.rejection_reason == null && item.rejectionReason == null
      ? null
      : str(item.rejection_reason ?? item.rejectionReason),
    destinationRef: item.destination_ref == null && item.destinationRef == null
      ? null
      : str(item.destination_ref ?? item.destinationRef),
    cashPickupCity: item.cash_pickup_city == null && item.cashPickupCity == null
      ? null
      : str(item.cash_pickup_city ?? item.cashPickupCity),
    cashPickupPoint: item.cash_pickup_point == null && item.cashPickupPoint == null
      ? null
      : str(item.cash_pickup_point ?? item.cashPickupPoint),
  };
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
    rows: rowsSource.map((row) => parseOwnerWithdrawalRow(row)),
    total: num(raw.total) || rowsSource.length,
  };
}

export async function approveOwnerWithdrawal(withdrawalId: string, idempotencyKey: string): Promise<void> {
  await ownerData(`/api/owner/withdrawals/${encodeURIComponent(withdrawalId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

export async function rejectOwnerWithdrawal(
  withdrawalId: string,
  reason: string,
  idempotencyKey: string,
): Promise<void> {
  await ownerData(`/api/owner/withdrawals/${encodeURIComponent(withdrawalId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason, idempotencyKey }),
  });
}

export async function markOwnerWithdrawalPaid(withdrawalId: string, idempotencyKey: string): Promise<void> {
  await ownerData(`/api/owner/withdrawals/${encodeURIComponent(withdrawalId)}/paid`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
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

export interface OwnerSecurityStaffMetrics {
  reviewed: number;
  resolved: number;
  dismissed: number;
  restrictionsApplied: number;
  restrictionsRemoved: number;
}

export interface OwnerSecurityStaffRow {
  authUserId: string;
  login: string;
  displayName: string;
  status: string;
  createdAt: string;
  lastActivityAt: string;
  metrics: {
    h24: OwnerSecurityStaffMetrics;
    d7: OwnerSecurityStaffMetrics;
    d30: OwnerSecurityStaffMetrics;
  };
}

export interface OwnerSecurityTeamActivity {
  at: string;
  employeeLogin: string;
  employeeName: string;
  actorRole: string;
  action: string;
  playerPublicId: string;
  target: string;
  reason: string;
  result: string;
}

function parseSecurityStaffMetrics(raw: unknown): OwnerSecurityStaffMetrics {
  const item = asRecord(raw);
  return {
    reviewed: num(item.reviewed),
    resolved: num(item.resolved),
    dismissed: num(item.dismissed),
    restrictionsApplied: num(item.restrictions_applied ?? item.restrictionsApplied),
    restrictionsRemoved: num(item.restrictions_removed ?? item.restrictionsRemoved),
  };
}

function parseSecurityStaffRow(raw: unknown): OwnerSecurityStaffRow {
  const item = asRecord(raw);
  const metrics = asRecord(item.metrics);
  return {
    authUserId: str(item.auth_user_id ?? item.authUserId),
    login: str(item.login ?? item.login_name ?? item.loginName),
    displayName: str(item.display_name ?? item.displayName),
    status: str(item.status),
    createdAt: str(item.created_at ?? item.createdAt),
    lastActivityAt: str(item.last_activity_at ?? item.lastActivityAt),
    metrics: {
      h24: parseSecurityStaffMetrics(metrics.h24),
      d7: parseSecurityStaffMetrics(metrics.d7),
      d30: parseSecurityStaffMetrics(metrics.d30),
    },
  };
}

export async function fetchOwnerSecurityStaff(): Promise<OwnerSecurityStaffRow[]> {
  const data = await ownerData('/api/owner/security-staff');
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map(parseSecurityStaffRow);
}

export async function fetchOwnerSecurityTeamActivity(): Promise<OwnerSecurityTeamActivity[]> {
  const data = await ownerData('/api/owner/security-staff/activity');
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map((row) => {
    const item = asRecord(row);
    return {
      at: str(item.at ?? item.created_at ?? item.createdAt),
      employeeLogin: str(item.employee_login ?? item.employeeLogin),
      employeeName: str(item.employee_name ?? item.employeeName),
      actorRole: str(item.actor_role ?? item.actorRole),
      action: str(item.action),
      playerPublicId: str(item.player_public_id ?? item.playerPublicId),
      target: str(item.target),
      reason: str(item.reason),
      result: str(item.result),
    };
  });
}

export async function postOwnerSecurityStaff(input: {
  login: string;
  displayName: string;
  temporaryPassword: string;
}): Promise<OwnerSecurityStaffRow> {
  const data = await ownerData('/api/owner/security-staff', {
    method: 'POST',
    body: JSON.stringify({
      login: input.login,
      displayName: input.displayName,
      temporaryPassword: input.temporaryPassword,
    }),
  });
  return parseSecurityStaffRow(asRecord(data));
}

export async function postOwnerSecurityStaffStatus(input: {
  authUserId: string;
  status: 'active' | 'disabled';
}): Promise<void> {
  await ownerJson(`/api/owner/security-staff/${encodeURIComponent(input.authUserId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: input.status }),
  });
}

export async function postOwnerSecurityStaffResetPassword(input: {
  authUserId: string;
  temporaryPassword: string;
}): Promise<void> {
  await ownerJson(`/api/owner/security-staff/${encodeURIComponent(input.authUserId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ temporaryPassword: input.temporaryPassword }),
  });
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
  treasuryBalanceAfter: number | null;
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
    treasuryBalanceAfter: nullableNum(raw.treasury_balance_after ?? raw.treasuryBalanceAfter),
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

export async function postOwnerPlayerDebit(input: {
  playerId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
}): Promise<OwnerMoneyResult> {
  const data = await ownerData(`/api/owner/players/${encodeURIComponent(input.playerId)}/debit`, {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
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

export type ProviderSettlementPeriodKind = 'month' | 'custom';
export type ProviderProductFilter = 'sports' | 'casino';
export type ProviderSettlementStatus = 'open' | 'reconciled' | 'invoiced' | 'paid' | 'dispute';

export interface ProviderSettlementFilters {
  period?: ProviderSettlementPeriodKind;
  month?: string | null;
  from?: string | null;
  to?: string | null;
  provider?: string | null;
  product?: ProviderProductFilter | '' | null;
  currency?: string | null;
  status?: ProviderSettlementStatus | '' | null;
}

export interface ProviderGgrCurrencyTotal {
  currency: string;
  stakeTotal: number;
  payoutTotal: number;
  refundTotal: number;
  voidTotal: number;
  rollbackTotal: number;
  internalGgr: number;
}

export interface ProviderSettlementRow {
  id: string | null;
  providerKey: string;
  product: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  stakeTotal: number;
  payoutTotal: number;
  refundTotal: number;
  voidTotal: number;
  rollbackTotal: number;
  internalGgr: number;
  providerReportedGgr: number | null;
  discrepancy: number | null;
  commercialTerms: Record<string, unknown> | null;
  commissionFee: number | null;
  amountDue: number | null;
  status: string;
  statementRef: string | null;
  invoiceRef: string | null;
}

export interface ProviderGgrSummary {
  hasProviderData: boolean;
  period: {
    kind: ProviderSettlementPeriodKind;
    from: string;
    to: string;
    startAt: string;
    endAt: string;
    timezone: string;
  };
  currencies: ProviderGgrCurrencyTotal[];
  rows: ProviderSettlementRow[];
}

export interface ProviderSettlementList {
  hasProviderData: boolean;
  period: ProviderGgrSummary['period'];
  rows: ProviderSettlementRow[];
}

function parseProviderPeriod(raw: Record<string, unknown>): ProviderGgrSummary['period'] {
  const kindRaw = str(raw.kind, 'month');
  return {
    kind: kindRaw === 'custom' ? 'custom' : 'month',
    from: str(raw.from).slice(0, 10),
    to: str(raw.to).slice(0, 10),
    startAt: str(raw.startAt ?? raw.start_at),
    endAt: str(raw.endAt ?? raw.end_at),
    timezone: str(raw.timezone, 'UTC'),
  };
}

function parseProviderSettlementRow(value: unknown): ProviderSettlementRow {
  const raw = asRecord(value);
  const commercial = raw.commercialTerms ?? raw.commercial_terms;
  return {
    id: raw.id == null ? null : str(raw.id),
    providerKey: str(raw.providerKey ?? raw.provider_key),
    product: str(raw.product),
    currency: str(raw.currency),
    periodStart: str(raw.periodStart ?? raw.period_start),
    periodEnd: str(raw.periodEnd ?? raw.period_end),
    stakeTotal: num(raw.stakeTotal ?? raw.stake_total),
    payoutTotal: num(raw.payoutTotal ?? raw.payout_total),
    refundTotal: num(raw.refundTotal ?? raw.refund_total),
    voidTotal: num(raw.voidTotal ?? raw.void_total),
    rollbackTotal: num(raw.rollbackTotal ?? raw.rollback_total),
    internalGgr: num(raw.internalGgr ?? raw.internal_ggr),
    providerReportedGgr: nullableNum(raw.providerReportedGgr ?? raw.provider_reported_ggr),
    discrepancy: nullableNum(raw.discrepancy),
    commercialTerms: commercial && typeof commercial === 'object' && !Array.isArray(commercial)
      ? commercial as Record<string, unknown>
      : null,
    commissionFee: nullableNum(raw.commissionFee ?? raw.commission_fee),
    amountDue: nullableNum(raw.amountDue ?? raw.amount_due),
    status: str(raw.status, 'open'),
    statementRef: raw.statementRef == null && raw.statement_ref == null
      ? null
      : str(raw.statementRef ?? raw.statement_ref) || null,
    invoiceRef: raw.invoiceRef == null && raw.invoice_ref == null
      ? null
      : str(raw.invoiceRef ?? raw.invoice_ref) || null,
  };
}

function providerSettlementQuery(params: ProviderSettlementFilters): string {
  return ownerQuery({
    period: params.period ?? 'month',
    month: params.month ?? null,
    from: params.from ?? null,
    to: params.to ?? null,
    provider: params.provider ?? null,
    product: params.product || null,
    currency: params.currency ?? null,
    status: params.status || null,
  });
}

export async function fetchOwnerProviderGgrSummary(
  params: ProviderSettlementFilters = {},
): Promise<ProviderGgrSummary> {
  const data = await ownerData('/api/owner/provider-ggr' + providerSettlementQuery(params));
  const raw = asRecord(data);
  return {
    hasProviderData: raw.hasProviderData === true || raw.has_provider_data === true,
    period: parseProviderPeriod(asRecord(raw.period)),
    currencies: asRows(raw.currencies).map((item) => {
      const row = asRecord(item);
      return {
        currency: str(row.currency),
        stakeTotal: num(row.stakeTotal ?? row.stake_total),
        payoutTotal: num(row.payoutTotal ?? row.payout_total),
        refundTotal: num(row.refundTotal ?? row.refund_total),
        voidTotal: num(row.voidTotal ?? row.void_total),
        rollbackTotal: num(row.rollbackTotal ?? row.rollback_total),
        internalGgr: num(row.internalGgr ?? row.internal_ggr),
      };
    }),
    rows: asRows(raw.rows).map(parseProviderSettlementRow),
  };
}

export async function fetchOwnerProviderSettlements(
  params: ProviderSettlementFilters = {},
): Promise<ProviderSettlementList> {
  const data = await ownerData('/api/owner/provider-settlements' + providerSettlementQuery(params));
  const raw = asRecord(data);
  return {
    hasProviderData: raw.hasProviderData === true || raw.has_provider_data === true,
    period: parseProviderPeriod(asRecord(raw.period)),
    rows: asRows(raw.rows).map(parseProviderSettlementRow),
  };
}
