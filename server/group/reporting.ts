import type { BrandCode, BrandStatus } from './catalog.js';
import { GROUP_BRANDS } from './catalog.js';
import { GroupControlError } from './errors.js';
import type { BrandStaffGrant, StaffRole } from './access.js';

export interface BrandFinancialSummary {
  currency: string;
  deposits: string;
  withdrawals: string;
  ggr: string;
}

export interface BrandOperationalSnapshot {
  brandCode: BrandCode;
  playerCount: number;
  operationalStatus: BrandStatus;
  financials: BrandFinancialSummary;
}

export interface BrandReport {
  code: BrandCode;
  slug: string;
  displayName: string;
  operationalStatus: BrandStatus;
  playerCount: number;
  managerCount: number;
  cashierCount: number;
  securityCount: number;
  financials: BrandFinancialSummary[];
  staffSubjects: Array<{ role: StaffRole; staffSubject: string }>;
}

export interface GroupReport {
  brands: BrandReport[];
  totals: {
    playerCount: number;
    managerCount: number;
    cashierCount: number;
    brandCount: number;
  };
}

const MONEY_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
const FORBIDDEN_SNAPSHOT_KEYS = ['email', 'phone', 'passport', 'firstName', 'lastName', 'balance', 'walletId'];

export function assertAggregateSnapshot(snapshot: BrandOperationalSnapshot): void {
  const record = snapshot as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_SNAPSHOT_KEYS) {
    if (key in record) throw new GroupControlError('PERSONAL_DATA_FORBIDDEN');
  }
  if (!Number.isInteger(snapshot.playerCount) || snapshot.playerCount < 0) {
    throw new GroupControlError('PLAYER_COUNT_INVALID');
  }
  for (const amount of [snapshot.financials.deposits, snapshot.financials.withdrawals, snapshot.financials.ggr]) {
    if (!MONEY_RE.test(amount)) throw new GroupControlError('FINANCIAL_SUMMARY_INVALID');
  }
}

export function sumMoney(lines: readonly BrandFinancialSummary[], field: keyof Pick<BrandFinancialSummary, 'deposits' | 'withdrawals' | 'ggr'>): string {
  if (lines.length === 0) return '0';
  const currency = lines[0]?.currency;
  if (lines.some((line) => line.currency !== currency)) {
    throw new GroupControlError('MIXED_CURRENCY_TOTAL');
  }
  const total = lines.reduce((sum, line) => sum + Number(line[field]), 0);
  return total.toFixed(2);
}

export function aggregateGroupReport(
  snapshots: readonly BrandOperationalSnapshot[],
  grants: readonly BrandStaffGrant[],
): GroupReport {
  const byBrand = new Map<BrandCode, BrandOperationalSnapshot[]>();
  for (const snapshot of snapshots) {
    assertAggregateSnapshot(snapshot);
    const rows = byBrand.get(snapshot.brandCode) ?? [];
    if (rows.some((row) => row.financials.currency === snapshot.financials.currency)) {
      throw new GroupControlError('DUPLICATE_BRAND_CURRENCY');
    }
    if (rows.some((row) => row.playerCount !== snapshot.playerCount || row.operationalStatus !== snapshot.operationalStatus)) {
      throw new GroupControlError('BRAND_SNAPSHOT_CONFLICT');
    }
    rows.push(snapshot);
    byBrand.set(snapshot.brandCode, rows);
  }

  const brands: BrandReport[] = GROUP_BRANDS.map((brand) => {
    const rows = byBrand.get(brand.code) ?? [];
    const staff = grants.filter((grant) => grant.brandCode === brand.code);
    const count = (role: StaffRole) => staff.filter((grant) => grant.role === role).length;
    return {
      code: brand.code,
      slug: brand.slug,
      displayName: brand.displayName,
      operationalStatus: rows[0]?.operationalStatus ?? brand.status,
      playerCount: rows[0]?.playerCount ?? 0,
      managerCount: count('manager'),
      cashierCount: count('cashier'),
      securityCount: count('security'),
      financials: rows.map((row) => row.financials),
      staffSubjects: staff.map((grant) => ({ role: grant.role, staffSubject: grant.staffSubject })),
    };
  });

  return {
    brands,
    totals: {
      playerCount: brands.reduce((sum, brand) => sum + brand.playerCount, 0),
      managerCount: brands.reduce((sum, brand) => sum + brand.managerCount, 0),
      cashierCount: brands.reduce((sum, brand) => sum + brand.cashierCount, 0),
      brandCount: brands.length,
    },
  };
}
