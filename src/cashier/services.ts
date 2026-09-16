import {
  isAmbiguousStaffError,
  retainIdempotencyKey,
} from '../shared/staff/financeGate';

export { isAmbiguousStaffError, retainIdempotencyKey };

export const CASHIER_ME_PATH = '/api/cashier/me';
export const CASHIER_FINANCE_PATH = '/api/cashier/finance';
export const CASHIER_TRANSFERS_PATH = '/api/cashier/transfers';
export const CASHIER_DEPOSITS_PATH = '/api/cashier/deposits';

export function cashierDepositReversePath(transferId: string): string {
  return `/api/cashier/deposits/${encodeURIComponent(transferId)}/reverse`;
}

export function cashierPayoutPath(code: string): string {
  return `/api/cashier/payouts/${encodeURIComponent(code)}`;
}

export function cashierPayoutConfirmPath(code: string): string {
  return `/api/cashier/payouts/${encodeURIComponent(code)}/confirm`;
}

export interface CashierOverviewCashier {
  cashierId: string;
  login: string;
  fullName: string;
  pointName: string;
  city: string;
  networkId: string;
}

export interface CashierOperationalAccount {
  accountId: string;
  currency: string;
  availableBalance: number | null;
  status: string;
  migrationState: string;
  version: number;
  legacyFloatDiagnostic: number | null;
}

export interface CashierFinanceOverview {
  cashier: CashierOverviewCashier;
  operational: CashierOperationalAccount;
  accounts: CashierOperationalAccount[];
  activationPending: boolean;
}

export interface CashierTransferRow {
  id: string;
  transferNo: number | string | null;
  transferType: string;
  currency: string;
  amount: number | null;
  fromAccountId: string;
  toAccountId: string;
  actorRole: string;
  createdAt: string;
  playerPublicId: string | null;
  reversibleUntil: string | null;
  reversalStatus: string | null;
}

export interface CashierTransferList {
  rows: CashierTransferRow[];
  total: number;
  limit: number;
  offset: number;
}

export type CashierAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

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

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function transferNo(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value;
  return String(value);
}

async function cashierJson(
  fetchFn: CashierAuthFetch,
  path: string,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, 'FINANCE_UNAVAILABLE'));
  }
  return rec;
}

export function parseCashierFinance(raw: unknown): CashierFinanceOverview | null {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  const data = rec.data == null ? rec : asRecord(rec.data);
  const cashier = asRecord(data.cashier);
  const operational = asRecord(data.operational);
  const cashierId = str(cashier.cashierId ?? cashier.cashier_id);
  if (!cashierId && !str(operational.accountId ?? operational.account_id)) return null;
  const availableBalance = numOrNull(
    operational.availableBalance ?? operational.available_balance,
  );
  return {
    cashier: {
      cashierId,
      login: str(cashier.login),
      fullName: str(cashier.fullName ?? cashier.full_name),
      pointName: str(cashier.pointName ?? cashier.point_name),
      city: str(cashier.city),
      networkId: str(cashier.networkId ?? cashier.network_id),
    },
    operational: {
      accountId: str(operational.accountId ?? operational.account_id),
      currency: str(operational.currency, 'TMT') === 'TMTM' ? 'TMT' : str(operational.currency, 'TMT'),
      availableBalance,
      status: str(operational.status),
      migrationState: str(operational.migrationState ?? operational.migration_state, 'staging'),
      version: numOrNull(operational.version) ?? 0,
      legacyFloatDiagnostic: numOrNull(
        operational.legacyFloatDiagnostic ?? operational.legacy_float_diagnostic,
      ),
    },
    accounts: asRows(data.accounts).map((row) => {
      const item = asRecord(row);
      const currency = str(item.currency ?? item.currency, 'TMT');
      return {
        accountId: str(item.accountId ?? item.account_id),
        currency: currency === 'TMTM' ? 'TMT' : currency,
        availableBalance: numOrNull(item.availableBalance ?? item.available_balance),
        status: str(item.status),
        migrationState: str(item.migrationState ?? item.migration_state, 'staging'),
        version: numOrNull(item.version) ?? 0,
        legacyFloatDiagnostic: null,
      };
    }),
    activationPending: data.activationPending !== false && data.activation_pending !== false,
  };
}

export function parseCashierTransfers(raw: unknown): CashierTransferList {
  const rec = asRecord(Array.isArray(raw) ? raw[0] : raw);
  const data = rec.data == null ? rec : asRecord(rec.data);
  const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
  const rows = rowsRaw.map((row) => {
    const item = asRecord(row);
    return {
      id: str(item.id),
      transferNo: transferNo(item.transferNo ?? item.transfer_no),
      transferType: str(item.transferType ?? item.transfer_type),
      currency: str(item.currency),
      amount: numOrNull(item.amount),
      fromAccountId: str(item.fromAccountId ?? item.from_account_id),
      toAccountId: str(item.toAccountId ?? item.to_account_id),
      actorRole: str(item.actorRole ?? item.actor_role),
      createdAt: str(item.createdAt ?? item.created_at),
      playerPublicId: str(item.playerPublicId ?? item.player_public_id) || null,
      reversibleUntil: str(item.reversibleUntil ?? item.reversible_until) || null,
      reversalStatus: str(item.reversalStatus ?? item.reversal_status) || null,
    };
  });
  return {
    rows,
    total: numOrNull(data.total) ?? rows.length,
    limit: numOrNull(data.limit) ?? 100,
    offset: numOrNull(data.offset) ?? 0,
  };
}

export async function fetchCashierFinance(
  fetchFn: CashierAuthFetch = fetch,
): Promise<CashierFinanceOverview> {
  const rec = await cashierJson(fetchFn, CASHIER_FINANCE_PATH);
  const parsed = parseCashierFinance(rec);
  if (!parsed) throw new Error('FINANCE_UNAVAILABLE');
  return parsed;
}

export async function fetchCashierTransfers(
  fetchFn: CashierAuthFetch = fetch,
): Promise<CashierTransferList> {
  const rec = await cashierJson(fetchFn, CASHIER_TRANSFERS_PATH);
  return parseCashierTransfers(rec);
}

export async function fetchCashierMe(fetchFn: CashierAuthFetch = fetch): Promise<Record<string, unknown>> {
  return cashierJson(fetchFn, CASHIER_ME_PATH);
}

export async function postCashierDeposit(
  input: { playerPublicId: string; amount: number | string; idempotencyKey: string; note?: string; currency?: string },
  fetchFn: CashierAuthFetch = fetch,
): Promise<Record<string, unknown>> {
  const currency = (input.currency ?? 'TMT').trim().toUpperCase();
  const display = currency === 'TMTM' ? 'TMT' : currency;
  const useCurrencyApi = display && display !== 'TMT';
  const res = await fetchFn(CASHIER_DEPOSITS_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerPublicId: input.playerPublicId,
      amount: useCurrencyApi ? String(input.amount) : input.amount,
      idempotencyKey: input.idempotencyKey,
      note: input.note ?? null,
      ...(useCurrencyApi ? { currency: display } : {}),
    }),
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    const code = str(rec.error, 'DEPOSIT_UNAVAILABLE');
    if (code === 'PLAYER_CURRENCY_WALLET_REQUIRED') {
      throw new Error(
        display === 'TMT'
          ? 'У игрока нет кошелька TMT. Игрок должен добавить эту валюту в своём аккаунте.'
          : `У игрока нет кошелька ${display}. Игрок должен добавить эту валюту в своём аккаунте.`,
      );
    }
    if (code === 'CASHIER_CURRENCY_ACCOUNT_REQUIRED') {
      throw new Error(`Нет кассы ${display}.`);
    }
    if (code === 'CASHIER_CURRENCY_DISABLED') {
      throw new Error('Касса для этой валюты отключена.');
    }
    throw new Error(code);
  }
  return rec;
}

export async function postCashierDepositReverse(
  input: { transferId: string; idempotencyKey: string; reason: string },
  fetchFn: CashierAuthFetch = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(cashierDepositReversePath(input.transferId), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    }),
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, 'REVERSAL_UNAVAILABLE'));
  }
  return rec.data && typeof rec.data === 'object' ? asRecord(rec.data) : rec;
}

export function cashierReversalErrorMessage(code: string): string {
  if (code === 'CASHIER_REVERSAL_WINDOW_EXPIRED') return 'Прошло больше 5 минут';
  if (code === 'CASHIER_REVERSAL_PLAYER_ACTIVITY') {
    return 'Отмена невозможна: игрок уже использовал средства';
  }
  if (code === 'CASHIER_DEPOSIT_ALREADY_REVERSED') return 'Это пополнение уже отменено';
  return code;
}

export async function fetchCashierPayout(
  code: string,
  fetchFn: CashierAuthFetch = fetch,
): Promise<Record<string, unknown>> {
  return cashierJson(fetchFn, cashierPayoutPath(code));
}

export async function postCashierPayoutConfirm(
  input: { code: string; idempotencyKey: string },
  fetchFn: CashierAuthFetch = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(cashierPayoutConfirmPath(input.code), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, 'PAYOUT_UNAVAILABLE'));
  }
  return rec;
}

export function isCashierFinanceEnabled(finance: CashierFinanceOverview | null | undefined): boolean {
  if (!finance) return false;
  if (finance.activationPending === false) {
    const rows = finance.accounts.length ? finance.accounts : [finance.operational];
    return rows.some((row) => (
      String(row.migrationState).toLowerCase() === 'active'
      && String(row.status).toLowerCase() === 'active'
    ));
  }
  return false;
}
