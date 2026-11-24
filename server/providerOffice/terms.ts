export const ODDSPAPI_PROVIDER_ID = '10000000-0000-4000-8000-0000000000a1';
export const SOFTAGGREGATOR_PROVIDER_ID = '10000000-0000-4000-8000-0000000000a2';
export const STATISTICS_PROVIDER_ID = '10000000-0000-4000-8000-0000000000a3';
export const ODDSPAPI_CONTRACT_ID = '10000000-0000-4000-8000-0000000000c1';

export const REPORTING_SCOPES = ['sportsbook_ggr', 'casino_ggr'] as const;
export type ReportingScope = (typeof REPORTING_SCOPES)[number];

export interface ProviderRecord {
  id: string;
  key: string;
  legalEntity: string;
  product: 'sportsbook' | 'casino' | 'statistics';
  status: 'active' | 'inactive' | 'planned';
  defaultLanguage: 'en' | 'ru';
}

export interface ContractTerms {
  id: string;
  version: number;
  providerId: string;
  reportingCurrency: 'USD';
  commencementDate: string;
  monthlyFee: string;
  revenueShareBps: number;
  paymentDay: number;
  periodStartDay: number;
  periodEndDay: number;
  initialTermMonths: number;
  terminationNoticeMonths: number;
  reportingDeadlineBusinessDays: number;
  topUpDeadlineDays: number;
  reportingAccessDeadlineBusinessDays: number;
  reportingAccessRetentionDays: number;
  coveredBrandCodes: readonly string[];
  status: 'active' | 'expired' | 'revoked';
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ProviderAssignment {
  providerId: string;
  contractId: string;
  brandCode: string;
  access: 'read';
  scopes: readonly ReportingScope[];
  status: 'active' | 'revoked';
}

export interface ProviderDirectory {
  providers: readonly ProviderRecord[];
  contracts: readonly ContractTerms[];
  assignments: readonly ProviderAssignment[];
}

/**
 * Versioned commercial records. The fee function reads these fields.
 * OddsPapi covers NextPari only. RYXO is not assigned.
 */
export const SEED_DIRECTORY: ProviderDirectory = {
  providers: [
    {
      id: ODDSPAPI_PROVIDER_ID,
      key: 'oddspapi',
      legalEntity: '55 Tech Limited',
      product: 'sportsbook',
      status: 'active',
      defaultLanguage: 'en',
    },
    {
      id: SOFTAGGREGATOR_PROVIDER_ID,
      key: 'softaggregator',
      legalEntity: 'SoftAggregator',
      product: 'casino',
      status: 'inactive',
      defaultLanguage: 'en',
    },
    {
      id: STATISTICS_PROVIDER_ID,
      key: 'sports-statistics',
      legalEntity: 'Future statistics API',
      product: 'statistics',
      status: 'planned',
      defaultLanguage: 'en',
    },
  ],
  contracts: [
    {
      id: ODDSPAPI_CONTRACT_ID,
      version: 1,
      providerId: ODDSPAPI_PROVIDER_ID,
      reportingCurrency: 'USD',
      commencementDate: '2026-11-23',
      monthlyFee: '3000.00',
      revenueShareBps: 1000,
      paymentDay: 23,
      periodStartDay: 23,
      periodEndDay: 22,
      initialTermMonths: 12,
      terminationNoticeMonths: 2,
      reportingDeadlineBusinessDays: 5,
      topUpDeadlineDays: 7,
      reportingAccessDeadlineBusinessDays: 5,
      reportingAccessRetentionDays: 30,
      coveredBrandCodes: ['001'],
      status: 'active',
      effectiveFrom: '2026-11-23',
      effectiveTo: null,
    },
  ],
  assignments: [
    {
      providerId: ODDSPAPI_PROVIDER_ID,
      contractId: ODDSPAPI_CONTRACT_ID,
      brandCode: '001',
      access: 'read',
      scopes: ['sportsbook_ggr'],
      status: 'active',
    },
  ],
};

export interface PublicProviderCatalog {
  writesEnabled: false;
  providers: Array<{
    id: string;
    key: string;
    legalEntity: string;
    product: string;
    status: string;
  }>;
  contracts: Array<{
    id: string;
    version: number;
    providerId: string;
    reportingCurrency: 'USD';
    commencementDate: string;
    monthlyFee: string;
    revenueShareBps: number;
    paymentDay: number;
    periodStartDay: number;
    periodEndDay: number;
    initialTermMonths: number;
    terminationNoticeMonths: number;
    reportingDeadlineBusinessDays: number;
    topUpDeadlineDays: number;
    reportingAccessDeadlineBusinessDays: number;
    reportingAccessRetentionDays: number;
    coveredBrandCodes: readonly string[];
    status: string;
  }>;
  assignments: Array<{
    providerId: string;
    contractId: string;
    brandCode: string;
    access: 'read';
    scopes: readonly ReportingScope[];
    status: string;
  }>;
}

export function publicProviderCatalog(directory: ProviderDirectory = SEED_DIRECTORY): PublicProviderCatalog {
  return {
    writesEnabled: false,
    providers: directory.providers.map((provider) => ({
      id: provider.id,
      key: provider.key,
      legalEntity: provider.legalEntity,
      product: provider.product,
      status: provider.status,
    })),
    contracts: directory.contracts.map((contract) => ({
      id: contract.id,
      version: contract.version,
      providerId: contract.providerId,
      reportingCurrency: contract.reportingCurrency,
      commencementDate: contract.commencementDate,
      monthlyFee: contract.monthlyFee,
      revenueShareBps: contract.revenueShareBps,
      paymentDay: contract.paymentDay,
      periodStartDay: contract.periodStartDay,
      periodEndDay: contract.periodEndDay,
      initialTermMonths: contract.initialTermMonths,
      terminationNoticeMonths: contract.terminationNoticeMonths,
      reportingDeadlineBusinessDays: contract.reportingDeadlineBusinessDays,
      topUpDeadlineDays: contract.topUpDeadlineDays,
      reportingAccessDeadlineBusinessDays: contract.reportingAccessDeadlineBusinessDays,
      reportingAccessRetentionDays: contract.reportingAccessRetentionDays,
      coveredBrandCodes: contract.coveredBrandCodes,
      status: contract.status,
    })),
    assignments: directory.assignments.map((assignment) => ({
      providerId: assignment.providerId,
      contractId: assignment.contractId,
      brandCode: assignment.brandCode,
      access: assignment.access,
      scopes: assignment.scopes,
      status: assignment.status,
    })),
  };
}
