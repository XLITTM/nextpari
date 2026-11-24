import { ProviderOfficeError } from './errors.js';
import { formatMinor, maxMinor, mulBps, parseMinor } from './money.js';
import { addUkBusinessDays, type ReportingPeriod } from './periods.js';
import {
  ODDSPAPI_CONTRACT_ID,
  ODDSPAPI_PROVIDER_ID,
  type ContractTerms,
  type ProviderDirectory,
} from './terms.js';

export interface ContractFee {
  monthlyFee: string;
  revenueShareBps: number;
  topUpFee: string;
  totalMonthlyFee: string;
}

/**
 * TopUpFee = MAX(0, SportsGGR × revenue share − monthly fee)
 * TotalMonthlyFee = monthly fee + TopUpFee
 * A negative GGR does not reduce the monthly fee.
 */
export function contractualFee(ggr: string, terms: Pick<ContractTerms, 'monthlyFee' | 'revenueShareBps'>): ContractFee {
  const ggrMinor = parseMinor(ggr);
  const monthlyMinor = parseMinor(terms.monthlyFee);
  if (monthlyMinor < 0n) throw new ProviderOfficeError('CONTRACT_TERMS_INVALID');
  const shareMinor = mulBps(ggrMinor, terms.revenueShareBps);
  const topUpMinor = maxMinor(0n, shareMinor - monthlyMinor);
  return {
    monthlyFee: formatMinor(monthlyMinor),
    revenueShareBps: terms.revenueShareBps,
    topUpFee: formatMinor(topUpMinor),
    totalMonthlyFee: formatMinor(monthlyMinor + topUpMinor),
  };
}

export function activeContract(
  directory: ProviderDirectory,
  providerId: string,
  onDate: string,
): ContractTerms | null {
  const matches = directory.contracts.filter((contract) => (
    contract.providerId === providerId
    && contract.status === 'active'
    && contract.effectiveFrom <= onDate
    && (contract.effectiveTo == null || onDate <= contract.effectiveTo)
  ));
  matches.sort((left, right) => right.version - left.version);
  return matches[0] ?? null;
}

export function oddspapiContract(directory: ProviderDirectory): ContractTerms {
  const contract = directory.contracts.find((item) => item.id === ODDSPAPI_CONTRACT_ID);
  if (!contract || contract.providerId !== ODDSPAPI_PROVIDER_ID) {
    throw new ProviderOfficeError('CONTRACT_NOT_FOUND');
  }
  return contract;
}

export function contractDeadlines(terms: ContractTerms, period: ReportingPeriod): {
  reportingDeadline: string;
  accessDeadline: string;
  accessRetentionDays: number;
  topUpDeadlineDays: number;
} {
  return {
    reportingDeadline: addUkBusinessDays(period.end, terms.reportingDeadlineBusinessDays),
    accessDeadline: addUkBusinessDays(terms.commencementDate, terms.reportingAccessDeadlineBusinessDays),
    accessRetentionDays: terms.reportingAccessRetentionDays,
    topUpDeadlineDays: terms.topUpDeadlineDays,
  };
}
