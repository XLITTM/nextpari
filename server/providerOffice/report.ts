import { authorizeReport, stripForbidden, type OfficeActor } from './access.js';
import { activeContract, contractualFee, contractDeadlines, type ContractFee } from './contract.js';
import { ProviderOfficeError } from './errors.js';
import { convertToUsd, snapshotKey, type ContractExchangeRate } from './exchange.js';
import {
  assertAllocationReconciles,
  computeSportsbook,
  type NativeTotals,
  type SportAllocationRow,
  type SportsBetFact,
} from './ggr.js';
import { formatMinor, parseMinor } from './money.js';
import { periodContaining, periodsThrough, type ReportingPeriod } from './periods.js';
import { ODDSPAPI_PROVIDER_ID, type ProviderDirectory, type ReportingScope } from './terms.js';

export interface PublicSportsbookReport {
  ok: true;
  readOnly: true;
  synthetic: false;
  providerId: string;
  providerKey: string;
  legalEntity: string;
  brandCode: string;
  scope: 'sportsbook_ggr';
  period: ReportingPeriod;
  lastSuccessfulUpdate: string | null;
  native: NativeTotals[];
  counts: {
    settledBetCount: number;
    wonCount: number;
    lostCount: number;
    refundCount: number;
    cancelledCount: number;
  };
  reporting: {
    currency: 'USD';
    status: 'final' | 'provisional' | 'rate_required';
    eligibleStakes: string | null;
    winnings: string | null;
    refundedStakes: string | null;
    cancelledStakes: string | null;
    ggr: string | null;
    margin: string | null;
    rate: {
      rate: string;
      source: 'usdt-p2p';
      effectiveDate: string;
      status: 'verified' | 'unverified';
    } | null;
  };
  fee: Omit<ContractFee, 'topUpFee' | 'totalMonthlyFee'> & {
    status: 'final' | 'provisional' | 'rate_required';
    topUpFee: string | null;
    totalMonthlyFee: string | null;
  };
  deadlines: ReturnType<typeof contractDeadlines>;
  sports: {
    method: 'equal-distinct-sports';
    status: 'allocated' | 'SPORT_TAG_UNAVAILABLE';
    rows: SportAllocationRow[];
  };
  closedSnapshot: boolean;
}

export interface ReportFailure {
  ok: false;
  error: string;
}

export function buildSportsbookReport(input: {
  actor: OfficeActor;
  directory: ProviderDirectory;
  providerId?: string;
  brandCode?: string | null;
  scope?: ReportingScope;
  asOf: string;
  periodStart?: string | null;
  facts: readonly SportsBetFact[];
  loadedAt: string | null;
  rate: ContractExchangeRate | null;
  snapshots?: Map<string, PublicSportsbookReport>;
}): PublicSportsbookReport | ReportFailure {
  try {
    const providerId = input.providerId ?? ODDSPAPI_PROVIDER_ID;
    const scope = input.scope ?? 'sportsbook_ggr';
    if (scope !== 'sportsbook_ggr') throw new ProviderOfficeError('CASINO_SCOPE_DENIED');
    const provider = input.directory.providers.find((item) => item.id === providerId);
    if (!provider) throw new ProviderOfficeError('PROVIDER_NOT_FOUND');
    const contract = activeContract(input.directory, providerId, input.asOf);
    if (!contract) throw new ProviderOfficeError('CONTRACT_NOT_FOUND');
    const period = resolvePeriod(contract.commencementDate, contract.periodStartDay, input.asOf, input.periodStart ?? null);
    const authorized = authorizeReport(input.actor, input.directory, {
      providerId,
      brandCode: input.brandCode ?? null,
      scope,
      onDate: period.start,
    });
    const closed = input.snapshots?.get(snapshotKey({
      providerId,
      brandCode: authorized.brandCode,
      periodStart: period.start,
      periodEnd: period.end,
    }));
    if (closed) return closed;

    const computation = computeSportsbook(input.facts, authorized.brandCode);
    assertAllocationReconciles(computation.totals, computation.sports.rows);
    const rolled = rollupUsd(computation.totals, input.rate, period.end);
    const fee = feeFor(rolled, contract);
    const counts = computation.totals.reduce((sum, row) => ({
      settledBetCount: sum.settledBetCount + row.settledBetCount,
      wonCount: sum.wonCount + row.wonCount,
      lostCount: sum.lostCount + row.lostCount,
      refundCount: sum.refundCount + row.refundCount,
      cancelledCount: sum.cancelledCount + row.cancelledCount,
    }), { settledBetCount: 0, wonCount: 0, lostCount: 0, refundCount: 0, cancelledCount: 0 });
    const report: PublicSportsbookReport = {
      ok: true,
      readOnly: true,
      synthetic: false,
      providerId,
      providerKey: provider.key,
      legalEntity: provider.legalEntity,
      brandCode: authorized.brandCode,
      scope: 'sportsbook_ggr',
      period,
      lastSuccessfulUpdate: input.loadedAt,
      native: computation.totals,
      counts,
      reporting: rolled.reporting,
      fee,
      deadlines: contractDeadlines(contract, period),
      sports: computation.sports,
      closedSnapshot: false,
    };
    return stripForbidden(report);
  } catch (error) {
    if (error instanceof ProviderOfficeError) return { ok: false, error: error.code };
    return { ok: false, error: 'PROVIDER_OFFICE_FAILED' };
  }
}

export function finalizeSportsbookSnapshot(input: Parameters<typeof buildSportsbookReport>[0]): PublicSportsbookReport {
  if (!input.snapshots) throw new ProviderOfficeError('SNAPSHOT_NOT_FINAL');
  if (input.actor.kind === 'provider') throw new ProviderOfficeError('READ_ONLY');
  const report = buildSportsbookReport({ ...input, snapshots: undefined });
  if (!report.ok) throw new ProviderOfficeError(report.error);
  if (report.reporting.status !== 'final' || report.fee.status !== 'final' || report.reporting.ggr == null || report.fee.totalMonthlyFee == null) {
    throw new ProviderOfficeError('SNAPSHOT_NOT_FINAL');
  }
  const closed: PublicSportsbookReport = { ...report, closedSnapshot: true };
  const key = snapshotKey({
    providerId: closed.providerId,
    brandCode: closed.brandCode,
    periodStart: closed.period.start,
    periodEnd: closed.period.end,
  });
  const existing = input.snapshots.get(key);
  if (!existing) {
    input.snapshots.set(key, closed);
    return closed;
  }
  if (existing.reporting.ggr !== closed.reporting.ggr || existing.fee.totalMonthlyFee !== closed.fee.totalMonthlyFee || existing.reporting.rate?.rate !== closed.reporting.rate?.rate) {
    throw new ProviderOfficeError('SNAPSHOT_CLOSED');
  }
  return existing;
}

export function listContractPeriods(commencement: string, asOf: string, startDay: number): ReportingPeriod[] {
  return periodsThrough(commencement, asOf, startDay);
}

export function toCsv(report: PublicSportsbookReport): string {
  const headers = [
    'period_start',
    'period_end',
    'brand_code',
    'currency',
    'eligible_stakes',
    'winnings',
    'refunded_stakes',
    'cancelled_stakes',
    'settled_bets',
    'won_bets',
    'lost_bets',
    'ggr',
    'margin',
    'reporting_status',
    'monthly_fee',
    'top_up_fee',
    'total_monthly_fee',
  ];
  const row = [
    report.period.start,
    report.period.end,
    report.brandCode,
    'USD',
    report.reporting.eligibleStakes ?? '',
    report.reporting.winnings ?? '',
    report.reporting.refundedStakes ?? '',
    report.reporting.cancelledStakes ?? '',
    String(report.counts.settledBetCount),
    String(report.counts.wonCount),
    String(report.counts.lostCount),
    report.reporting.ggr ?? '',
    report.reporting.margin ?? '',
    report.reporting.status,
    report.fee.monthlyFee,
    report.fee.topUpFee ?? '',
    report.fee.totalMonthlyFee ?? '',
  ];
  return `${headers.join(',')}\n${row.join(',')}\n`;
}

function resolvePeriod(commencement: string, startDay: number, asOf: string, periodStart: string | null): ReportingPeriod {
  const period = periodStart
    ? periodContaining(periodStart, startDay)
    : periodContaining(asOf, startDay);
  if (periodStart && period.start !== periodStart) throw new ProviderOfficeError('PERIOD_INVALID');
  if (period.end < commencement) throw new ProviderOfficeError('PERIOD_OUTSIDE_CONTRACT');
  if (period.start > asOf) throw new ProviderOfficeError('PERIOD_OUTSIDE_CONTRACT');
  return period;
}

function rollupUsd(totals: readonly NativeTotals[], rate: ContractExchangeRate | null, periodEnd: string): {
  reporting: PublicSportsbookReport['reporting'];
  usdGgr: string | null;
  nativeNonPositive: boolean;
} {
  const rateView = rate && rate.effectiveDate === periodEnd
    ? { rate: rate.rate, source: rate.source, effectiveDate: rate.effectiveDate, status: rate.status }
    : null;
  const applied = rateView ? rate : null;
  if (totals.length === 0) {
    return {
      usdGgr: '0.00',
      nativeNonPositive: true,
      reporting: {
        currency: 'USD',
        status: 'final',
        eligibleStakes: '0.00',
        winnings: '0.00',
        refundedStakes: '0.00',
        cancelledStakes: '0.00',
        ggr: '0.00',
        margin: null,
        rate: rateView,
      },
    };
  }
  const fields = ['eligibleStakes', 'winnings', 'refundedStakes', 'cancelledStakes', 'ggr'] as const;
  const sums: Record<(typeof fields)[number], bigint> = {
    eligibleStakes: 0n,
    winnings: 0n,
    refundedStakes: 0n,
    cancelledStakes: 0n,
    ggr: 0n,
  };
  let status: 'final' | 'provisional' | 'rate_required' = 'final';
  let blocked = false;
  for (const total of totals) {
    for (const field of fields) {
      const converted = convertToUsd(total[field], total.currency, applied);
      if (converted.status === 'rate_required') {
        if (parseMinor(total[field]) !== 0n) blocked = true;
        status = 'rate_required';
        continue;
      }
      sums[field] += parseMinor(converted.usd);
      if (converted.status === 'provisional' && status === 'final') status = 'provisional';
    }
  }
  const nativeNonPositive = totals.every((total) => parseMinor(total.ggr) <= 0n);
  if (blocked) {
    return {
      usdGgr: null,
      nativeNonPositive,
      reporting: {
        currency: 'USD',
        status: 'rate_required',
        eligibleStakes: null,
        winnings: null,
        refundedStakes: null,
        cancelledStakes: null,
        ggr: null,
        margin: null,
        rate: rateView,
      },
    };
  }
  const ggr = formatMinor(sums.ggr);
  const stakes = sums.eligibleStakes;
  return {
    usdGgr: ggr,
    nativeNonPositive,
    reporting: {
      currency: 'USD',
      status,
      eligibleStakes: formatMinor(sums.eligibleStakes),
      winnings: formatMinor(sums.winnings),
      refundedStakes: formatMinor(sums.refundedStakes),
      cancelledStakes: formatMinor(sums.cancelledStakes),
      ggr,
      margin: stakes === 0n ? null : margin(sums.ggr, stakes),
      rate: rateView,
    },
  };
}

function feeFor(
  rolled: { usdGgr: string | null; nativeNonPositive: boolean; reporting: PublicSportsbookReport['reporting'] },
  contract: Parameters<typeof contractualFee>[1] & Parameters<typeof contractDeadlines>[0],
): PublicSportsbookReport['fee'] {
  if (rolled.usdGgr == null) {
    if (rolled.nativeNonPositive) {
      const fee = contractualFee('0.00', contract);
      return { ...fee, topUpFee: '0.00', totalMonthlyFee: fee.monthlyFee, status: 'final' };
    }
    return {
      monthlyFee: contract.monthlyFee,
      revenueShareBps: contract.revenueShareBps,
      topUpFee: null,
      totalMonthlyFee: null,
      status: 'rate_required',
    };
  }
  const fee = contractualFee(rolled.usdGgr, contract);
  const status = rolled.reporting.status === 'final' ? 'final' : 'provisional';
  return { ...fee, status };
}

function margin(ggr: bigint, stakes: bigint): string {
  const negative = ggr < 0n;
  const hundredths = ((negative ? -ggr : ggr) * 10_000n) / stakes;
  return `${negative ? '-' : ''}${(hundredths / 100n).toString()}.${(hundredths % 100n).toString().padStart(2, '0')}`;
}

