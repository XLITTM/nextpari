export interface SecurityFlag {
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

export interface SecurityEvent {
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

export interface SecurityOverview {
  openFlags: number;
  highSeverityFlags: number;
  loginFailures: number;
  rateLimitedAttempts: number;
  sharedDeviceFlags: number;
  sharedNetworkFlags: number;
  restrictedAccounts: number;
}

export interface SecuritySportsLeg {
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

export interface SecuritySportsBet {
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
  legs: SecuritySportsLeg[];
}

export interface SecuritySportsPage {
  playerPublicId: string;
  total: number;
  limit: number;
  offset: number;
  rows: SecuritySportsBet[];
}

export interface SecuritySportsSummary {
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
  indicators: {
    repeatedFixtures: Array<{ fixtureId: string; fixtureLabel: string; count: number }>;
    rapidSequenceCount: number;
    linkedAccountPublicIds: string[];
    linkedSharedFixtures: number;
    automaticRestriction: boolean;
    closingPriceAvailable: boolean;
  };
}

export interface SecurityDossier {
  playerPublicId: string;
  restricted: boolean;
  restrictionReason: string | null;
  restrictionUpdatedAt: string | null;
  flags: SecurityFlag[];
  events: SecurityEvent[];
  restrictionHistory: Array<Record<string, unknown>>;
  recentDecisions: Array<Record<string, unknown>>;
  linkedAccountCount: number;
  winPattern: {
    linkedSharingFlags: Array<Record<string, unknown>>;
    linkedWinPatternOverlap: Array<Record<string, unknown>>;
    ownedGamesRecent: Array<Record<string, unknown>>;
    metrics: Record<string, unknown>;
  };
}

export interface SecurityActivityRow {
  at: string;
  employeeLogin: string;
  employeeName: string;
  action: string;
  playerPublicId: string;
  target: string;
  reason: string;
  result: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function securityQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function securityJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, res.status === 401 ? 'JWT_REQUIRED' : 'SECURITY_RPC_FAILED'));
  }
  return rec;
}

async function securityData(path: string, init?: RequestInit): Promise<unknown> {
  const rec = await securityJson(path, init);
  return rec.data ?? rec;
}

function parseFlag(raw: unknown): SecurityFlag {
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

function parseEvent(raw: unknown): SecurityEvent {
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

function parseOverview(raw: unknown): SecurityOverview {
  const item = asRecord(raw);
  return {
    openFlags: num(item.open_flags ?? item.openFlags),
    highSeverityFlags: num(item.high_severity_flags ?? item.highSeverityFlags),
    loginFailures: num(item.login_failures ?? item.loginFailures),
    rateLimitedAttempts: num(item.rate_limited_attempts ?? item.rateLimitedAttempts),
    sharedDeviceFlags: num(item.shared_device_flags ?? item.sharedDeviceFlags),
    sharedNetworkFlags: num(item.shared_network_flags ?? item.sharedNetworkFlags),
    restrictedAccounts: num(item.restricted_accounts ?? item.restrictedAccounts),
  };
}

function parseSportsLeg(raw: unknown): SecuritySportsLeg {
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

function parseSportsBet(raw: unknown): SecuritySportsBet {
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

function parseCountLabel(raw: unknown): { label: string; count: number } {
  const item = asRecord(raw);
  return {
    label: str(item.label ?? item.league ?? item.market ?? item.name),
    count: num(item.count),
  };
}

export async function fetchSecurityOverview(): Promise<SecurityOverview> {
  return parseOverview(await securityData('/api/security/overview'));
}

export async function fetchSecurityFlags(params: {
  status?: string | null;
  severity?: string | null;
  flagType?: string | null;
  playerId?: string | null;
} = {}): Promise<SecurityFlag[]> {
  const data = await securityData('/api/security/flags' + securityQuery({
    status: params.status ?? null,
    severity: params.severity ?? null,
    flagType: params.flagType ?? null,
    playerId: params.playerId ?? null,
  }));
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map(parseFlag);
}

export async function fetchSecurityDossier(playerId: string): Promise<SecurityDossier> {
  const data = await securityData(`/api/security/players/${encodeURIComponent(playerId)}`);
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    restricted: Boolean(rec.restricted),
    restrictionReason: rec.restriction_reason == null && rec.restrictionReason == null
      ? null
      : str(rec.restriction_reason ?? rec.restrictionReason),
    restrictionUpdatedAt: rec.restriction_updated_at == null && rec.restrictionUpdatedAt == null
      ? null
      : str(rec.restriction_updated_at ?? rec.restrictionUpdatedAt),
    flags: asRows(rec.flags).map(parseFlag),
    events: asRows(rec.events).map(parseEvent),
    restrictionHistory: asRows(rec.restriction_history ?? rec.restrictionHistory).map(asRecord),
    recentDecisions: asRows(rec.recent_security_decisions ?? rec.recentDecisions).map(asRecord),
    linkedAccountCount: num(rec.linked_account_count ?? rec.linkedAccountCount),
    winPattern: parseWinPatternExtras(rec.win_pattern ?? rec.winPattern),
  };
}

function parseWinPatternExtras(raw: unknown): SecurityDossier['winPattern'] {
  const rec = asRecord(raw);
  return {
    linkedSharingFlags: asRows(rec.linked_sharing_flags ?? rec.linkedSharingFlags).map(asRecord),
    linkedWinPatternOverlap: asRows(rec.linked_win_pattern_overlap ?? rec.linkedWinPatternOverlap).map(asRecord),
    ownedGamesRecent: asRows(rec.owned_games_recent ?? rec.ownedGamesRecent).map(asRecord),
    metrics: asRecord(rec.metrics),
  };
}

export async function postSecurityFlagAction(input: {
  flagId: string;
  action: 'review' | 'resolve' | 'dismiss';
  reason?: string;
}): Promise<void> {
  await securityJson(`/api/security/flags/${encodeURIComponent(input.flagId)}/${input.action}`, {
    method: 'POST',
    body: JSON.stringify({ reason: input.reason ?? '' }),
  });
}

export async function fetchSecurityRestriction(playerId: string): Promise<{
  playerPublicId: string;
  restricted: boolean;
  reason: string | null;
}> {
  const data = await securityData(
    `/api/security/players/${encodeURIComponent(playerId)}/security-restriction`,
  );
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, playerId),
    restricted: Boolean(rec.restricted),
    reason: rec.reason == null ? null : str(rec.reason),
  };
}

export async function setSecurityRestriction(input: {
  playerId: string;
  restricted: boolean;
  reason: string;
}): Promise<void> {
  await securityJson(
    `/api/security/players/${encodeURIComponent(input.playerId)}/security-restriction`,
    {
      method: 'POST',
      body: JSON.stringify({ restricted: input.restricted, reason: input.reason }),
    },
  );
}

export async function requestSecurityPlayerManualVerification(input: {
  playerId: string;
  reason: string;
}): Promise<void> {
  await securityJson(
    `/api/security/players/${encodeURIComponent(input.playerId)}/verification-request`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: input.reason,
      }),
    },
  );
}

export async function fetchSecurityPlayerManualVerification(playerId: string): Promise<{
  status: string | null;
  restricted: boolean;
}> {
  const data = await securityData(
    `/api/security/players/${encodeURIComponent(playerId)}/verification-request`,
  );
  const rec = asRecord(data);
  return {
    status: rec.status == null ? null : String(rec.status),
    restricted: rec.restricted === true,
  };
}

export async function completeSecurityPlayerManualVerification(playerId: string): Promise<void> {
  await securityJson(
    `/api/security/players/${encodeURIComponent(playerId)}/verification-complete`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function fetchSecuritySportsBets(params: {
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
}): Promise<SecuritySportsPage> {
  const data = await securityData(
    `/api/security/players/${encodeURIComponent(params.playerId)}/sports` + securityQuery({
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
    }),
  );
  const rec = asRecord(data);
  return {
    playerPublicId: str(rec.player_public_id ?? rec.playerPublicId, params.playerId),
    total: num(rec.total),
    limit: num(rec.limit) || 50,
    offset: num(rec.offset),
    rows: asRows(rec.rows).map(parseSportsBet),
  };
}

export async function fetchSecuritySportsSummary(params: {
  playerId: string;
  from?: string | null;
  to?: string | null;
}): Promise<SecuritySportsSummary> {
  const data = await securityData(
    `/api/security/players/${encodeURIComponent(params.playerId)}/sports/summary` + securityQuery({
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
    settledPayout: nullableNum(rec.settled_payout ?? rec.settledPayout),
    sportsGgr: nullableNum(rec.sports_ggr ?? rec.sportsGgr),
    averageStake: nullableNum(rec.average_stake ?? rec.averageStake),
    averageAcceptedOdds: nullableNum(rec.average_accepted_odds ?? rec.averageAcceptedOdds),
    singleCount: num(rec.single_count ?? rec.singleCount),
    expressCount: num(rec.express_count ?? rec.expressCount),
    liveCount: num(rec.live_count ?? rec.liveCount),
    prematchCount: num(rec.prematch_count ?? rec.prematchCount),
    mostUsedLeagues: asRows(rec.most_used_leagues ?? rec.mostUsedLeagues).map(parseCountLabel),
    mostUsedMarkets: asRows(rec.most_used_markets ?? rec.mostUsedMarkets).map(parseCountLabel),
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
      ).map((id) => String(id)),
      linkedSharedFixtures: num(indicators.linked_shared_fixtures ?? indicators.linkedSharedFixtures),
      automaticRestriction: false,
      closingPriceAvailable: false,
    },
  };
}

export async function fetchSecuritySportsBet(playerId: string, betId: string): Promise<SecuritySportsBet> {
  const data = await securityData(
    `/api/security/players/${encodeURIComponent(playerId)}/sports/${encodeURIComponent(betId)}`,
  );
  return parseSportsBet(data);
}

export async function fetchSecurityWinPatternSettings(): Promise<Array<{
  source: string;
  enabled: boolean;
  lookbackHours: number;
  minimumSettledCount: number;
  minimumTotalStake: number;
  winRateThreshold: number;
  netProfitThreshold: number;
  roiThreshold: number;
}>> {
  const data = await securityData('/api/security/win-pattern-settings');
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map((row) => {
    const item = asRecord(row);
    return {
      source: str(item.source),
      enabled: Boolean(item.enabled),
      lookbackHours: num(item.lookback_hours ?? item.lookbackHours),
      minimumSettledCount: num(item.minimum_settled_count ?? item.minimumSettledCount),
      minimumTotalStake: num(item.minimum_total_stake ?? item.minimumTotalStake),
      winRateThreshold: num(item.win_rate_threshold ?? item.winRateThreshold),
      netProfitThreshold: num(item.net_profit_threshold ?? item.netProfitThreshold),
      roiThreshold: num(item.roi_threshold ?? item.roiThreshold),
    };
  });
}

export async function fetchSecurityActivity(): Promise<SecurityActivityRow[]> {
  const data = await securityData('/api/security/activity');
  const rec = asRecord(data);
  return asRows(rec.rows ?? data).map((row) => {
    const item = asRecord(row);
    return {
      at: str(item.at ?? item.created_at ?? item.createdAt),
      employeeLogin: str(item.employee_login ?? item.employeeLogin),
      employeeName: str(item.employee_name ?? item.employeeName),
      action: str(item.action),
      playerPublicId: str(item.player_public_id ?? item.playerPublicId),
      target: str(item.target ?? item.target_id ?? item.targetId),
      reason: str(item.reason),
      result: str(item.result),
    };
  });
}

export function formatSecurityDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

export function formatSecurityMoney(value: number | null | undefined, currency = 'TMTM'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency}`;
}
