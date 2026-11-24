import type { ContractExchangeRate } from './exchange.js';
import type { SportsBetFact } from './ggr.js';
import type { ReportingPeriod } from './periods.js';

export interface ReportingLoad {
  ok: true;
  facts: SportsBetFact[];
  loadedAt: string;
  rate: ContractExchangeRate | null;
}

export interface ReportingFailure {
  ok: false;
  error: 'REPORTING_SOURCE_UNAVAILABLE' | 'BRAND_DATABASE_NOT_CONNECTED';
}

export interface ReportingSource {
  load(brandCode: string, period: ReportingPeriod): Promise<ReportingLoad | ReportingFailure>;
}

/** No database is configured. This is an error, not an empty ledger. */
export function unconfiguredReportingSource(): ReportingSource {
  return {
    async load(brandCode: string) {
      if (brandCode !== '001') return { ok: false, error: 'BRAND_DATABASE_NOT_CONNECTED' };
      return { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' };
    },
  };
}

export function memoryReportingSource(input: {
  facts: readonly SportsBetFact[];
  loadedAt: string;
  rate?: ContractExchangeRate | null;
  failBrands?: readonly string[];
}): ReportingSource {
  return {
    async load(brandCode: string) {
      if (brandCode !== '001' || input.failBrands?.includes(brandCode)) {
        return { ok: false, error: brandCode === '001' ? 'REPORTING_SOURCE_UNAVAILABLE' : 'BRAND_DATABASE_NOT_CONNECTED' };
      }
      return {
        ok: true,
        facts: input.facts.filter((fact) => fact.brandCode === brandCode).map(copyFact),
        loadedAt: input.loadedAt,
        rate: input.rate ?? null,
      };
    },
  };
}

function copyFact(fact: SportsBetFact): SportsBetFact {
  return {
    betId: fact.betId,
    brandCode: fact.brandCode,
    product: 'sports',
    currency: fact.currency,
    stake: fact.stake,
    payout: fact.payout,
    settlement: fact.settlement,
    status: fact.status,
    mode: fact.mode,
    settledAt: fact.settledAt,
    testAccount: fact.testAccount,
    sports: [...fact.sports],
  };
}
