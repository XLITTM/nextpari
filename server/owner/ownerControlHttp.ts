import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import { StaffOnboardingError, staffError } from '../staff/errors.js';
import {
  liveOwnerAuthPorts,
  resolveOwnerSession,
  type OwnerAuthGatewayPorts,
} from '../staff/ownerAuthService.js';
import { publicOwnerStaff } from '../staff/ownerContext.js';
import { clearOwnerCookies, requestIsSecure } from '../staff/ownerCookies.js';
import type { AuthAdminPort, StaffLog } from '../staff/types.js';
import { createOwnerJwtRpc, type OwnerRpcPort } from './ownerRpc.js';
import {
  liveAuthAdminPort,
  provisionOwnerManager,
  provisionOwnerSecurityStaff,
  resetOwnerSecurityStaffPassword,
} from '../staff/staffHierarchyService.js';
import { deliverPendingManualVerificationInstructions } from '../email/playerManualVerificationService.js';

export interface OwnerControlDeps {
  sessionPorts?: OwnerAuthGatewayPorts;
  rpcFactory?: (accessToken: string) => OwnerRpcPort;
  adminFactory?: () => AuthAdminPort;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isOwnerControlPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/owner/')) return false;
  if (path.startsWith('/api/owner/auth/')) return false;
  if (path.startsWith('/api/owner/staff/')) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function publicSecurityStaffProvision(raw: unknown): Record<string, unknown> {
  const rec = asRecord(raw);
  const blocked = new Set([
    'auth_email',
    'authEmail',
    'p_auth_email',
    'email',
    'password',
    'temporaryPassword',
    'temporary_password',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (blocked.has(key)) continue;
    if (key === 'args' && value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = asRecord(value);
      const cleanArgs: Record<string, unknown> = {};
      for (const [argKey, argValue] of Object.entries(nested)) {
        if (blocked.has(argKey)) continue;
        cleanArgs[argKey] = argValue;
      }
      out[key] = cleanArgs;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function queryOf(search: string | undefined): URLSearchParams {
  const raw = search ?? '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

function parseLimit(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw staffError('LIMIT_INVALID', 400);
  return Math.min(200, Math.max(0, Math.floor(n)));
}

function parseOffset(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw staffError('OFFSET_INVALID', 400);
  return Math.floor(n);
}

function requireId(value: string, code: string): string {
  const id = value.trim();
  if (!id) throw staffError(code, 400);
  return id;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value === 'boolean') return value;
  throw staffError(code, 400);
}

function requireAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw staffError('AMOUNT_REQUIRED', 400);
  if (n <= 0) throw staffError('AMOUNT_NOT_POSITIVE', 400);
  return n;
}

function requireScaledAmount(value: unknown): number {
  const n = requireAmount(value);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-8) {
    throw staffError('AMOUNT_SCALE_INVALID', 400);
  }
  return n;
}

function requirePositiveInt(value: unknown, code: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) throw staffError(code, 400);
  return n;
}

function requireRate(value: unknown, code: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw staffError(code, 400);
  return n;
}

function requireReason(value: unknown): string {
  const reason = String(value ?? '').trim();
  if (!reason) throw staffError('REASON_REQUIRED', 400);
  if (reason.length > 500) throw staffError('REASON_TOO_LONG', 400);
  return reason;
}

function requireIdempotencyKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) throw staffError('IDEMPOTENCY_KEY_REQUIRED', 400);
  if (key.length > 250) throw staffError('IDEMPOTENCY_KEY_TOO_LONG', 400);
  return key;
}

function optionalNote(value: unknown): string | null {
  if (value == null) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > 500) throw staffError('NOTE_TOO_LONG', 400);
  return note;
}

function optionalTimestamp(raw: string | null): string | null {
  if (raw == null || raw.trim() === '') return null;
  const value = raw.trim();
  if (!Number.isFinite(Date.parse(value))) throw staffError('PERIOD_INVALID', 400);
  return new Date(value).toISOString();
}

function optionalFilter(value: string | null, code: string, max = 64): string | null {
  if (value == null || value.trim() === '') return null;
  const text = value.trim();
  if (text.length > max) throw staffError(code, 400);
  return text;
}

function providerSettlementArgs(query: URLSearchParams, includeStatus: boolean): Record<string, unknown> {
  const periodRaw = (query.get('period') ?? 'month').trim() || 'month';
  const period = periodRaw === 'custom' ? 'custom' : 'month';
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const monthRe = /^\d{4}-\d{2}$/;
  let from = query.get('from')?.trim() || null;
  let to = query.get('to')?.trim() || null;
  const month = query.get('month')?.trim() || null;
  if (month) {
    if (!monthRe.test(month)) throw staffError('PERIOD_INVALID', 400);
    from = `${month}-01`;
    to = null;
  }
  if (from && !dateRe.test(from)) throw staffError('PERIOD_INVALID', 400);
  if (to && !dateRe.test(to)) throw staffError('PERIOD_INVALID', 400);
  if (period === 'custom' && (!from || !to)) throw staffError('PERIOD_INVALID', 400);
  const product = optionalFilter(query.get('product'), 'PROVIDER_PRODUCT_INVALID');
  if (product && product !== 'sports' && product !== 'casino') {
    throw staffError('PROVIDER_PRODUCT_INVALID', 400);
  }
  const status = includeStatus ? optionalFilter(query.get('status'), 'PROVIDER_STATUS_INVALID') : null;
  if (
    status
    && status !== 'open'
    && status !== 'reconciled'
    && status !== 'invoiced'
    && status !== 'paid'
    && status !== 'dispute'
  ) {
    throw staffError('PROVIDER_STATUS_INVALID', 400);
  }
  const args: Record<string, unknown> = {
    p_period: period,
    p_from: from,
    p_to: to,
    p_provider_key: optionalFilter(query.get('provider'), 'PROVIDER_KEY_INVALID'),
    p_product: product,
    p_currency: optionalFilter(query.get('currency'), 'PROVIDER_CURRENCY_INVALID', 8),
  };
  if (includeStatus) args.p_status = status;
  return args;
}

function requireNote(value: unknown): string {
  const note = optionalNote(value);
  if (!note) throw staffError('NOTE_REQUIRED', 400);
  return note;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, requiredCode: string, invalidCode: string): string {
  const id = String(value ?? '').trim();
  if (!id) throw staffError(requiredCode, 400);
  if (!UUID_RE.test(id)) throw staffError(invalidCode, 400);
  return id;
}

function requirePlayerPublicId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!id) throw staffError('PLAYER_ID_REQUIRED', 400);
  if (UUID_RE.test(id)) throw staffError('PLAYER_WALLET_ID_FORBIDDEN', 400);
  return id;
}

const FORBIDDEN_FINANCE_KEYS = [
  'actorUserId',
  'actor_user_id',
  'fromAccountId',
  'from_account_id',
  'treasuryId',
  'treasury_id',
  'networkId',
  'network_id',
  'walletId',
  'wallet_id',
  'operationalAccountId',
  'operational_account_id',
] as const;

function rejectForbiddenFinanceFields(rec: Record<string, unknown>): void {
  for (const key of FORBIDDEN_FINANCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rec, key)) {
      throw staffError('FIELD_FORBIDDEN', 400);
    }
  }
}

function asRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function stripMoneySecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMoneySecrets);
  if (!value || typeof value !== 'object') return value;
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(rec)) {
    const compact = key.toLowerCase().replace(/_/g, '');
    if (
      compact === 'walletid'
      || compact === 'playerwalletid'
      || compact === 'accesstoken'
      || compact === 'refreshtoken'
    ) {
      continue;
    }
    out[key] = stripMoneySecrets(nested);
  }
  return out;
}

function sanitizeTreasuryOverview(data: unknown): unknown {
  const rec = asRecord(data);
  if (!('treasury' in rec) && !('recent_transfers' in rec) && !('recentTransfers' in rec)) {
    return stripMoneySecrets(data);
  }
  const treasuryRaw = asRecord(rec.treasury);
  const treasury = Object.keys(treasuryRaw).length === 0
    ? rec.treasury
    : {
        currency: treasuryRaw.currency,
        available_balance: treasuryRaw.available_balance ?? treasuryRaw.availableBalance,
        status: treasuryRaw.status,
        migration_state: treasuryRaw.migration_state ?? treasuryRaw.migrationState,
        version: treasuryRaw.version,
      };
  const transfers = asRows(rec.recent_transfers ?? rec.recentTransfers).map((row) => {
    const item = asRecord(row);
    return {
      id: item.id,
      transfer_no: item.transfer_no ?? item.transferNo,
      transfer_type: item.transfer_type ?? item.transferType,
      currency: item.currency,
      amount: item.amount,
      actor_role: item.actor_role ?? item.actorRole,
      created_at: item.created_at ?? item.createdAt,
      target_reference: item.transfer_no ?? item.transferNo ?? item.id ?? null,
    };
  });
  return {
    treasury,
    managers: rec.managers,
    cashiers: rec.cashiers,
    recent_transfers: transfers,
  };
}

function sanitizeMoneyResult(data: unknown): unknown {
  const rec = asRecord(data);
  if (!('transfer_id' in rec) && !('transferId' in rec)) {
    return stripMoneySecrets(data);
  }
  const out: Record<string, unknown> = {
    ok: rec.ok,
    transfer_id: rec.transfer_id ?? rec.transferId,
    is_duplicate: rec.is_duplicate ?? rec.isDuplicate,
    amount: rec.amount,
    currency: rec.currency,
    from_balance_after: rec.from_balance_after ?? rec.fromBalanceAfter,
    to_balance_after: rec.to_balance_after ?? rec.toBalanceAfter,
    player_balance_after: rec.player_balance_after ?? rec.playerBalanceAfter,
  };
  if (rec.manager_id != null || rec.managerId != null) {
    out.manager_id = rec.manager_id ?? rec.managerId;
  }
  if (rec.cashier_id != null || rec.cashierId != null) {
    out.cashier_id = rec.cashier_id ?? rec.cashierId;
  }
  if (rec.player_public_id != null || rec.playerPublicId != null) {
    out.player_public_id = rec.player_public_id ?? rec.playerPublicId;
  }
  if (rec.treasury_balance_after != null || rec.treasuryBalanceAfter != null) {
    out.treasury_balance_after = rec.treasury_balance_after ?? rec.treasuryBalanceAfter;
  }
  return out;
}

type ControlAction =
  | { kind: 'me' }
  | { kind: 'dashboard' }
  | { kind: 'cashiers' }
  | { kind: 'ledger'; cashierId: string }
  | { kind: 'freeze'; cashierId: string }
  | { kind: 'risk' }
  | { kind: 'players' }
  | { kind: 'dossier'; playerId: string }
  | { kind: 'playerDebit'; playerId: string }
  | { kind: 'block'; playerId: string }
  | { kind: 'playerSecurity'; playerId: string }
  | { kind: 'playerSecurityRestrictionGet'; playerId: string }
  | { kind: 'playerSecurityRestrictionSet'; playerId: string }
  | { kind: 'playerManualVerificationGet'; playerId: string }
  | { kind: 'playerManualVerificationSet'; playerId: string }
  | { kind: 'playerSportsBets'; playerId: string }
  | { kind: 'playerSportsSummary'; playerId: string }
  | { kind: 'playerSportsBet'; playerId: string; betId: string }
  | { kind: 'securityOverview' }
  | { kind: 'securityFlags' }
  | { kind: 'securityFlagResolve'; flagId: string }
  | { kind: 'winPatternSettingsGet' }
  | { kind: 'winPatternSettingsSet' }
  | { kind: 'evaluateWinPattern'; playerId: string }
  | { kind: 'withdrawals' }
  | { kind: 'withdrawalApprove'; withdrawalId: string }
  | { kind: 'withdrawalReject'; withdrawalId: string }
  | { kind: 'withdrawalPaid'; withdrawalId: string }
  | { kind: 'message' }
  | { kind: 'managers' }
  | { kind: 'createManager' }
  | { kind: 'securityStaffList' }
  | { kind: 'createSecurityStaff' }
  | { kind: 'securityStaffActivity' }
  | { kind: 'securityStaffStatus'; authUserId: string }
  | { kind: 'securityStaffReset'; authUserId: string }
  | { kind: 'managerDetail'; managerId: string }
  | { kind: 'treasury' }
  | { kind: 'capitalIn' }
  | { kind: 'fund' }
  | { kind: 'gameReport' }
  | { kind: 'providerGgr' }
  | { kind: 'providerSettlements' };

function matchControl(method: string, pathname: string): ControlAction | 'method' | null {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();

  const ledger = path.match(/^\/api\/owner\/cashiers\/([^/]+)\/ledger$/);
  if (ledger) return m === 'GET' ? { kind: 'ledger', cashierId: ledger[1] } : 'method';

  const freeze = path.match(/^\/api\/owner\/cashiers\/([^/]+)\/freeze$/);
  if (freeze) return m === 'POST' ? { kind: 'freeze', cashierId: freeze[1] } : 'method';

  const debit = path.match(/^\/api\/owner\/players\/([^/]+)\/debit$/);
  if (debit) return m === 'POST' ? { kind: 'playerDebit', playerId: debit[1] } : 'method';

  const playerSportsBet = path.match(/^\/api\/owner\/players\/([^/]+)\/sports\/([^/]+)$/);
  if (playerSportsBet) {
    if (playerSportsBet[2] === 'summary') {
      return m === 'GET' ? { kind: 'playerSportsSummary', playerId: playerSportsBet[1] } : 'method';
    }
    return m === 'GET' ? { kind: 'playerSportsBet', playerId: playerSportsBet[1], betId: playerSportsBet[2] } : 'method';
  }

  const playerSports = path.match(/^\/api\/owner\/players\/([^/]+)\/sports$/);
  if (playerSports) return m === 'GET' ? { kind: 'playerSportsBets', playerId: playerSports[1] } : 'method';

  const playerSecurity = path.match(/^\/api\/owner\/players\/([^/]+)\/security$/);
  if (playerSecurity) return m === 'GET' ? { kind: 'playerSecurity', playerId: playerSecurity[1] } : 'method';

  const evaluateWin = path.match(/^\/api\/owner\/players\/([^/]+)\/win-pattern-evaluate$/);
  if (evaluateWin) return m === 'POST' ? { kind: 'evaluateWinPattern', playerId: evaluateWin[1] } : 'method';

  const restriction = path.match(/^\/api\/owner\/players\/([^/]+)\/security-restriction$/);
  if (restriction) {
    if (m === 'GET') return { kind: 'playerSecurityRestrictionGet', playerId: restriction[1] };
    if (m === 'POST') return { kind: 'playerSecurityRestrictionSet', playerId: restriction[1] };
    return 'method';
  }

  const verification = path.match(/^\/api\/owner\/players\/([^/]+)\/verification-request$/);
  if (verification) {
    if (m === 'GET') return { kind: 'playerManualVerificationGet', playerId: verification[1] };
    if (m === 'POST') return { kind: 'playerManualVerificationSet', playerId: verification[1] };
    return 'method';
  }

  const block = path.match(/^\/api\/owner\/players\/([^/]+)\/block$/);
  if (block) return m === 'POST' ? { kind: 'block', playerId: block[1] } : 'method';

  const dossier = path.match(/^\/api\/owner\/players\/([^/]+)$/);
  if (dossier) return m === 'GET' ? { kind: 'dossier', playerId: dossier[1] } : 'method';

  const managerDetail = path.match(/^\/api\/owner\/managers\/([^/]+)$/);
  if (managerDetail) return m === 'GET' ? { kind: 'managerDetail', managerId: managerDetail[1] } : 'method';

  if (path === '/api/owner/me') return m === 'GET' ? { kind: 'me' } : 'method';
  if (path === '/api/owner/dashboard') return m === 'GET' ? { kind: 'dashboard' } : 'method';
  if (path === '/api/owner/cashiers') return m === 'GET' ? { kind: 'cashiers' } : 'method';
  if (path === '/api/owner/managers') {
    if (m === 'GET') return { kind: 'managers' };
    if (m === 'POST') return { kind: 'createManager' };
    return 'method';
  }
  const securityStaffStatus = path.match(/^\/api\/owner\/security-staff\/([^/]+)\/status$/);
  if (securityStaffStatus) {
    return m === 'POST' ? { kind: 'securityStaffStatus', authUserId: securityStaffStatus[1] } : 'method';
  }
  const securityStaffReset = path.match(/^\/api\/owner\/security-staff\/([^/]+)\/reset-password$/);
  if (securityStaffReset) {
    return m === 'POST' ? { kind: 'securityStaffReset', authUserId: securityStaffReset[1] } : 'method';
  }
  if (path === '/api/owner/security-staff/activity') {
    return m === 'GET' ? { kind: 'securityStaffActivity' } : 'method';
  }
  if (path === '/api/owner/security-staff') {
    if (m === 'GET') return { kind: 'securityStaffList' };
    if (m === 'POST') return { kind: 'createSecurityStaff' };
    return 'method';
  }
  if (path === '/api/owner/risk-bets') return m === 'GET' ? { kind: 'risk' } : 'method';
  if (path === '/api/owner/security/overview') return m === 'GET' ? { kind: 'securityOverview' } : 'method';
  if (path === '/api/owner/security/flags') return m === 'GET' ? { kind: 'securityFlags' } : 'method';
  if (path === '/api/owner/security/win-pattern-settings') {
    if (m === 'GET') return { kind: 'winPatternSettingsGet' };
    if (m === 'POST') return { kind: 'winPatternSettingsSet' };
    return 'method';
  }
  const flagResolve = path.match(/^\/api\/owner\/security\/flags\/([^/]+)\/resolve$/);
  if (flagResolve) {
    return m === 'POST' ? { kind: 'securityFlagResolve', flagId: flagResolve[1] } : 'method';
  }
  if (path === '/api/owner/players') return m === 'GET' ? { kind: 'players' } : 'method';
  const withdrawalApprove = path.match(/^\/api\/owner\/withdrawals\/([^/]+)\/approve$/);
  if (withdrawalApprove) {
    return m === 'POST' ? { kind: 'withdrawalApprove', withdrawalId: withdrawalApprove[1] } : 'method';
  }
  const withdrawalReject = path.match(/^\/api\/owner\/withdrawals\/([^/]+)\/reject$/);
  if (withdrawalReject) {
    return m === 'POST' ? { kind: 'withdrawalReject', withdrawalId: withdrawalReject[1] } : 'method';
  }
  const withdrawalPaid = path.match(/^\/api\/owner\/withdrawals\/([^/]+)\/paid$/);
  if (withdrawalPaid) {
    return m === 'POST' ? { kind: 'withdrawalPaid', withdrawalId: withdrawalPaid[1] } : 'method';
  }
  if (path === '/api/owner/withdrawals') return m === 'GET' ? { kind: 'withdrawals' } : 'method';
  if (path === '/api/owner/messages') return m === 'POST' ? { kind: 'message' } : 'method';
  if (path === '/api/owner/treasury') {
    if (m === 'GET') return { kind: 'treasury' };
    if (m === 'POST') return { kind: 'capitalIn' };
    return 'method';
  }
  if (path === '/api/owner/fund') return m === 'POST' ? { kind: 'fund' } : 'method';
  if (path === '/api/owner/games/report') return m === 'GET' ? { kind: 'gameReport' } : 'method';
  if (path === '/api/owner/provider-ggr') return m === 'GET' ? { kind: 'providerGgr' } : 'method';
  if (path === '/api/owner/provider-settlements') {
    return m === 'GET' ? { kind: 'providerSettlements' } : 'method';
  }
  return null;
}

async function runControl(
  action: ControlAction,
  rpc: OwnerRpcPort,
  query: URLSearchParams,
  body: unknown,
): Promise<unknown> {
  const rec = asRecord(body);
  switch (action.kind) {
    case 'me':
      return null;
    case 'dashboard':
      return rpc.invoke('owner_dashboard_stats');
    case 'cashiers':
      return rpc.invoke('owner_list_cashiers');
    case 'ledger':
      return rpc.invoke('owner_cashier_ledger', {
        p_cashier_id: requireId(decodeURIComponent(action.cashierId), 'CASHIER_ID_REQUIRED'),
        p_from: query.get('from') || null,
      });
    case 'freeze':
      return rpc.invoke('owner_set_cashier_frozen', {
        p_cashier_id: requireId(decodeURIComponent(action.cashierId), 'CASHIER_ID_REQUIRED'),
        p_frozen: requireBoolean(rec.frozen, 'FROZEN_REQUIRED'),
        p_reason: rec.reason == null ? null : String(rec.reason).trim() || null,
      });
    case 'risk':
      return rpc.invoke('owner_list_risk_bets');
    case 'players':
      return rpc.invoke('owner_list_players', {
        p_search: query.get('search')?.trim() || null,
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'dossier':
      return rpc.invoke('owner_player_dossier', {
        p_player_id: requireId(decodeURIComponent(action.playerId), 'PLAYER_ID_REQUIRED'),
      });
    case 'block':
      return rpc.invoke('owner_set_player_blocked', {
        p_player_id: requireId(decodeURIComponent(action.playerId), 'PLAYER_ID_REQUIRED'),
        p_blocked: requireBoolean(rec.blocked, 'BLOCKED_REQUIRED'),
        p_reason: rec.reason == null ? null : String(rec.reason).trim() || null,
      });
    case 'playerSecurity':
      return rpc.invoke('owner_player_security', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
      });
    case 'playerSecurityRestrictionGet':
      return rpc.invoke('owner_player_security_restriction', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
      });
    case 'playerSecurityRestrictionSet':
      return rpc.invoke('owner_set_player_security_restriction', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_restricted: requireBoolean(rec.restricted, 'RESTRICTED_REQUIRED'),
        p_reason: requireReason(rec.reason),
      });
    case 'playerManualVerificationGet':
      return rpc.invoke('owner_player_manual_verification', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
      });
    case 'playerManualVerificationSet':
      return rpc.invoke('owner_request_player_manual_verification', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_reason: requireReason(rec.reason),
        p_restrict: rec.restrict === true,
        p_reason_code: rec.reasonCode == null && rec.reason_code == null
          ? null
          : String(rec.reasonCode ?? rec.reason_code).trim() || null,
      });
    case 'playerSportsBets':
      return rpc.invoke('owner_player_sports_bets', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_from: optionalTimestamp(query.get('from')),
        p_to: optionalTimestamp(query.get('to')),
        p_feed_type: optionalFilter(query.get('feedType') ?? query.get('feed_type'), 'FEED_TYPE_INVALID'),
        p_mode: optionalFilter(query.get('mode'), 'SPORTS_MODE_INVALID'),
        p_status: optionalFilter(query.get('status'), 'SPORTS_STATUS_INVALID'),
        p_league: optionalFilter(query.get('league'), 'LEAGUE_INVALID', 120),
        p_fixture: optionalFilter(query.get('fixture'), 'FIXTURE_INVALID', 120),
        p_market: optionalFilter(query.get('market'), 'MARKET_INVALID', 120),
        p_min_stake: query.get('minStake') || query.get('min_stake')
          ? requireAmount(query.get('minStake') ?? query.get('min_stake'))
          : null,
        p_min_odds: query.get('minOdds') || query.get('min_odds')
          ? requireAmount(query.get('minOdds') ?? query.get('min_odds'))
          : null,
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'playerSportsSummary':
      return rpc.invoke('owner_player_sports_summary', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_from: optionalTimestamp(query.get('from')),
        p_to: optionalTimestamp(query.get('to')),
      });
    case 'playerSportsBet':
      return rpc.invoke('owner_player_sports_bet', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_bet_id: requireUuid(decodeURIComponent(action.betId), 'BET_ID_REQUIRED', 'BET_ID_INVALID'),
      });
    case 'securityOverview':
      return rpc.invoke('owner_security_overview');
    case 'winPatternSettingsGet':
      return rpc.invoke('owner_win_pattern_settings');
    case 'winPatternSettingsSet':
      return rpc.invoke('owner_set_win_pattern_settings', {
        p_source: optionalFilter(String(rec.source ?? ''), 'WIN_PATTERN_SOURCE_INVALID') ?? (() => {
          throw staffError('WIN_PATTERN_SOURCE_INVALID', 400);
        })(),
        p_enabled: requireBoolean(rec.enabled, 'ENABLED_REQUIRED'),
        p_lookback_hours: requirePositiveInt(rec.lookbackHours ?? rec.lookback_hours, 'LOOKBACK_INVALID'),
        p_minimum_settled_count: requirePositiveInt(
          rec.minimumSettledCount ?? rec.minimum_settled_count,
          'MINIMUM_SETTLED_COUNT_INVALID',
        ),
        p_minimum_total_stake: requireScaledAmount(rec.minimumTotalStake ?? rec.minimum_total_stake),
        p_win_rate_threshold: requireRate(rec.winRateThreshold ?? rec.win_rate_threshold, 'WIN_RATE_THRESHOLD_INVALID'),
        p_net_profit_threshold: requireScaledAmount(rec.netProfitThreshold ?? rec.net_profit_threshold),
        p_roi_threshold: requireRate(rec.roiThreshold ?? rec.roi_threshold, 'ROI_THRESHOLD_INVALID'),
      });
    case 'evaluateWinPattern':
      return rpc.invoke('owner_evaluate_player_win_pattern', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_source: optionalFilter(rec.source == null ? null : String(rec.source), 'WIN_PATTERN_SOURCE_INVALID'),
      });
    case 'securityFlags':
      return rpc.invoke('owner_list_security_flags', {
        p_status: optionalFilter(query.get('status'), 'FLAG_STATUS_INVALID'),
        p_severity: optionalFilter(query.get('severity'), 'FLAG_SEVERITY_INVALID'),
        p_flag_type: optionalFilter(query.get('flagType') ?? query.get('flag_type'), 'FLAG_TYPE_INVALID'),
        p_player_id: (query.get('playerId') ?? query.get('player_id'))?.trim()
          ? requirePlayerPublicId(query.get('playerId') ?? query.get('player_id'))
          : null,
        p_from: optionalTimestamp(query.get('from')),
        p_to: optionalTimestamp(query.get('to')),
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'securityFlagResolve': {
      const actionName = String(rec.action ?? rec.status ?? '').trim();
      const needsReason = /^(resolve|resolved|dismiss|dismissed)$/i.test(actionName);
      return rpc.invoke('owner_resolve_security_flag', {
        p_flag_id: requireUuid(decodeURIComponent(action.flagId), 'FLAG_ID_REQUIRED', 'FLAG_ID_INVALID'),
        p_action: actionName || 'review',
        p_reason: needsReason ? requireReason(rec.reason) : (rec.reason == null ? '' : String(rec.reason)),
      });
    }
    case 'playerDebit': {
      rejectForbiddenFinanceFields(rec);
      return sanitizeMoneyResult(await rpc.invoke('owner_debit_player', {
        p_player_id: requirePlayerPublicId(decodeURIComponent(action.playerId)),
        p_amount: requireScaledAmount(rec.amount),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
        p_reason: requireReason(rec.reason),
      }));
    }
    case 'managers':
      return rpc.invoke('owner_list_managers');
    case 'managerDetail':
      return rpc.invoke('owner_manager_detail', {
        p_manager_id: requireId(decodeURIComponent(action.managerId), 'MANAGER_ID_REQUIRED'),
      });
    case 'createManager':
    case 'createSecurityStaff':
    case 'securityStaffReset':
      throw staffError('NOT_FOUND', 404);
    case 'securityStaffList':
      return rpc.invoke('owner_list_security_staff');
    case 'securityStaffActivity':
      return rpc.invoke('owner_security_team_activity', {
        p_limit: parseLimit(query.get('limit'), 50),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'securityStaffStatus': {
      const status = String(rec.status ?? '').trim().toLowerCase();
      if (status !== 'active' && status !== 'disabled') {
        throw staffError('STAFF_STATUS_INVALID', 400);
      }
      return rpc.invoke('owner_set_security_staff_status', {
        p_auth_user_id: requireUuid(
          decodeURIComponent(action.authUserId),
          'AUTH_USER_ID_REQUIRED',
          'AUTH_USER_ID_INVALID',
        ),
        p_status: status,
      });
    }
    case 'withdrawals':
      return rpc.invoke('owner_list_withdrawals', {
        p_status: query.get('status')?.trim() || null,
        p_limit: parseLimit(query.get('limit'), 100),
        p_offset: parseOffset(query.get('offset')),
      });
    case 'withdrawalApprove':
      return rpc.invoke('owner_approve_withdrawal', {
        p_withdrawal_id: requireId(decodeURIComponent(action.withdrawalId), 'WITHDRAWAL_ID_REQUIRED'),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
      });
    case 'withdrawalReject':
      return rpc.invoke('owner_reject_withdrawal', {
        p_withdrawal_id: requireId(decodeURIComponent(action.withdrawalId), 'WITHDRAWAL_ID_REQUIRED'),
        p_reason: rec.reason == null ? '' : String(rec.reason),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
      });
    case 'withdrawalPaid':
      return rpc.invoke('owner_mark_withdrawal_paid', {
        p_withdrawal_id: requireId(decodeURIComponent(action.withdrawalId), 'WITHDRAWAL_ID_REQUIRED'),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
      });
    case 'message': {
      const targetType = rec.targetType === 'all' || rec.targetType === 'player'
        ? rec.targetType
        : '';
      if (!targetType) throw staffError('TARGET_TYPE_INVALID', 400);
      const bodyText = String(rec.body ?? '');
      if (!bodyText.trim()) throw staffError('MESSAGE_BODY_REQUIRED', 400);
      return rpc.invoke('owner_send_message', {
        p_target_type: targetType,
        p_target_player_id: targetType === 'player' ? (rec.targetPlayerId ?? null) : null,
        p_title: rec.title == null ? null : String(rec.title).trim() || null,
        p_body: bodyText,
      });
    }
    case 'treasury':
      return sanitizeTreasuryOverview(await rpc.invoke('owner_treasury_overview'));
    case 'capitalIn': {
      rejectForbiddenFinanceFields(rec);
      return sanitizeMoneyResult(await rpc.invoke('owner_capital_in', {
        p_amount: requireAmount(rec.amount),
        p_idempotency_key: requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key),
        p_note: requireNote(rec.note),
      }));
    }
    case 'fund': {
      rejectForbiddenFinanceFields(rec);
      const amount = requireAmount(rec.amount);
      const idempotencyKey = requireIdempotencyKey(rec.idempotencyKey ?? rec.idempotency_key);
      const note = optionalNote(rec.note);
      const targetType = String(rec.targetType ?? rec.target_type ?? '').trim();
      const targetId = rec.targetId ?? rec.target_id;
      if (targetType === 'manager') {
        return sanitizeMoneyResult(await rpc.invoke('owner_fund_manager', {
          p_manager_id: requireUuid(targetId, 'MANAGER_ID_REQUIRED', 'MANAGER_ID_INVALID'),
          p_amount: amount,
          p_idempotency_key: idempotencyKey,
          p_note: note,
        }));
      }
      if (targetType === 'cashier') {
        return sanitizeMoneyResult(await rpc.invoke('owner_fund_cashier', {
          p_cashier_id: requireUuid(targetId, 'CASHIER_ID_REQUIRED', 'CASHIER_ID_INVALID'),
          p_amount: amount,
          p_idempotency_key: idempotencyKey,
          p_note: note,
        }));
      }
      if (targetType === 'player') {
        return sanitizeMoneyResult(await rpc.invoke('owner_fund_player', {
          p_player_id: requirePlayerPublicId(targetId),
          p_amount: amount,
          p_idempotency_key: idempotencyKey,
          p_note: note,
        }));
      }
      throw staffError('TARGET_TYPE_INVALID', 400);
    }
    case 'gameReport': {
      const period = (query.get('period') ?? 'today').trim() || 'today';
      const timezone = query.get('timezone')?.trim() || null;
      if (timezone && timezone.length > 64) throw staffError('TIMEZONE_INVALID', 400);
      const from = query.get('from')?.trim() || null;
      const to = query.get('to')?.trim() || null;
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (from && !dateRe.test(from)) throw staffError('PERIOD_INVALID', 400);
      if (to && !dateRe.test(to)) throw staffError('PERIOD_INVALID', 400);
      return rpc.invoke('owner_game_rtp_report', {
        p_period: period,
        p_from: from,
        p_to: to,
        p_timezone: timezone,
      });
    }
    case 'providerGgr':
      return rpc.invoke('owner_provider_ggr_summary', providerSettlementArgs(query, false));
    case 'providerSettlements':
      return rpc.invoke('owner_list_provider_settlements', providerSettlementArgs(query, true));
    default:
      throw staffError('NOT_FOUND', 404);
  }
}

export async function handleOwnerControlRequest(
  input: {
    method: string;
    pathname: string;
    search?: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
  },
  deps: OwnerControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const matched = matchControl(method, path);
  let sessionCookies: string[] | undefined;

  try {
    if (!isOwnerControlPath(path) || matched === null) {
      throw staffError('NOT_FOUND', 404);
    }
    if (matched === 'method') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }

    const sessionPorts = deps.sessionPorts ?? liveOwnerAuthPorts();
    const resolved = await resolveOwnerSession(sessionPorts, input.cookie, secure);
    sessionCookies = resolved.cookies;
    if (matched.kind === 'me') {
      return {
        status: 200,
        body: { ok: true, staff: publicOwnerStaff(resolved.staff) },
        cookies: sessionCookies,
      };
    }

    const rpc = (deps.rpcFactory ?? createOwnerJwtRpc)(resolved.accessToken);
    if (matched.kind === 'createManager') {
      const data = await provisionOwnerManager({
        body: parseJsonPayload(input.body),
        admin: (deps.adminFactory ?? liveAuthAdminPort)(),
        invoke: (name, args) => rpc.invoke(name, args),
        log,
      });
      return {
        status: 200,
        body: { ok: true, data },
        cookies: sessionCookies,
      };
    }
    if (matched.kind === 'createSecurityStaff') {
      const data = await provisionOwnerSecurityStaff({
        body: parseJsonPayload(input.body),
        admin: (deps.adminFactory ?? liveAuthAdminPort)(),
        invoke: (name, args) => rpc.invoke(name, args),
        log,
      });
      return {
        status: 200,
        body: { ok: true, data: publicSecurityStaffProvision(data) },
        cookies: sessionCookies,
      };
    }
    if (matched.kind === 'securityStaffReset') {
      const rec = asRecord(parseJsonPayload(input.body));
      const data = await resetOwnerSecurityStaffPassword({
        authUserId: requireUuid(
          decodeURIComponent(matched.authUserId),
          'AUTH_USER_ID_REQUIRED',
          'AUTH_USER_ID_INVALID',
        ),
        temporaryPassword: rec.temporaryPassword ?? rec.password,
        admin: (deps.adminFactory ?? liveAuthAdminPort)(),
        invoke: (name, args) => rpc.invoke(name, args),
      });
      return {
        status: 200,
        body: { ok: true, data },
        cookies: sessionCookies,
      };
    }

    const data = await runControl(matched, rpc, queryOf(input.search), parseJsonPayload(input.body));
    if (matched.kind === 'playerManualVerificationSet') {
      const uid = String(asRecord(data).player_user_id ?? asRecord(data).playerUserId ?? '');
      if (uid) {
        try {
          await deliverPendingManualVerificationInstructions(uid);
        } catch {
          /* request is stored even if instruction email cannot be sent yet */
        }
      }
    }
    return {
      status: 200,
      body: { ok: true, data },
      cookies: sessionCookies,
    };
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: { ok: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? {
              Allow: path === '/api/owner/treasury'
                ? 'GET, POST'
                : path === '/api/owner/fund'
                  ? 'POST'
                  : (method === 'POST' ? 'GET' : 'POST'),
            }
          : undefined,
        cookies: error.httpStatus === 401 ? clearOwnerCookies(secure) : sessionCookies,
      };
    }
    log.error('owner_control_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' }, cookies: sessionCookies };
  }
}

function headerValue(
  headers: IncomingMessage['headers'] | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function pathnameAndSearch(rawUrl: string, fallbackPath: string): { pathname: string; search: string } {
  try {
    const url = new URL(rawUrl, 'http://n.local');
    if (url.pathname.startsWith('/api/owner/')) {
      return { pathname: url.pathname, search: url.search };
    }
  } catch {
    /* fall through */
  }
  const [path, search = ''] = (rawUrl || fallbackPath).split('?');
  return { pathname: path || fallbackPath, search: search ? `?${search}` : '' };
}

export async function attachOwnerControlHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const { pathname, search } = pathnameAndSearch(raw, '/');
  if (!isOwnerControlPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' ? {} : await readJsonBody(req);
    const result = await handleOwnerControlRequest(
      {
        method,
        pathname,
        search,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      {},
      log,
    );
    writeStaffJson(res, result);
  } catch (error) {
    log.error('owner_control_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelOwnerControl(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  fallbackPathname: string,
  deps: OwnerControlDeps = {},
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  let { pathname, search } = pathnameAndSearch(req.url ?? '', fallbackPathname);
  if (!search && req.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue;
      if (value == null) continue;
      const text = Array.isArray(value) ? value[0] : value;
      if (text) params.set(key, text);
    }
    const qs = params.toString();
    if (qs) search = `?${qs}`;
  }
  if (req.query?.path) {
    const segs = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
    const joined = segs.filter(Boolean).join('/');
    if (joined) pathname = `/api/owner/${joined}`;
  }
  const result = await handleOwnerControlRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      search,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
    },
    deps,
    log,
  );
  writeStaffJson(res, result);
}
