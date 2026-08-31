export const CASHIER_ME_PATH = '/api/cashier/me';
export const CASHIER_FINANCE_PATH = '/api/cashier/finance';
export const CASHIER_TRANSFERS_PATH = '/api/cashier/transfers';
export const CASHIER_DEPOSITS_PATH = '/api/cashier/deposits';

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

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      currency: str(operational.currency, 'TMTM'),
      availableBalance,
      status: str(operational.status),
      migrationState: str(operational.migrationState ?? operational.migration_state, 'staging'),
      version: numOrNull(operational.version) ?? 0,
      legacyFloatDiagnostic: numOrNull(
        operational.legacyFloatDiagnostic ?? operational.legacy_float_diagnostic,
      ),
    },
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
      transferNo: item.transferNo ?? item.transfer_no ?? null,
      transferType: str(item.transferType ?? item.transfer_type),
      currency: str(item.currency),
      amount: numOrNull(item.amount),
      fromAccountId: str(item.fromAccountId ?? item.from_account_id),
      toAccountId: str(item.toAccountId ?? item.to_account_id),
      actorRole: str(item.actorRole ?? item.actor_role),
      createdAt: str(item.createdAt ?? item.created_at),
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
  input: { playerPublicId: string; amount: number; idempotencyKey: string; note?: string },
  fetchFn: CashierAuthFetch = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(CASHIER_DEPOSITS_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerPublicId: input.playerPublicId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      note: input.note ?? null,
    }),
  });
  const raw = await res.json().catch(() => ({}));
  const rec = asRecord(raw);
  if (!res.ok || rec.ok === false) {
    throw new Error(str(rec.error, 'DEPOSIT_UNAVAILABLE'));
  }
  return rec;
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
  return finance.activationPending === false
    && String(finance.operational.migrationState).toLowerCase() === 'active'
    && String(finance.operational.status).toLowerCase() === 'active';
}
