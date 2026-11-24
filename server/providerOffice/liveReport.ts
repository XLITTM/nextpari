import tls from 'node:tls';
import pg from 'pg';
import { ProviderOfficeError } from './errors.js';
import type { SportsBetFact, SettlementClass } from './ggr.js';
import type { ReportingPeriod } from './periods.js';
import { unconfiguredReportingSource, type ReportingSource } from './reportingSource.js';

const READER_ROLE = 'provider_office_reader';
const FORBIDDEN_USERS = new Set([
  'postgres',
  'supabase_admin',
  'authenticator',
  'service_role',
  'anon',
  'authenticated',
]);

const FACTS_SQL = `
SELECT bet_id, stake, payout, currency, status, settlement_state, mode, settled_at, sports
FROM provider_office.settled_sports_facts
WHERE settled_at >= $1::timestamptz
  AND settled_at < $2::timestamptz
`.trim();

/**
 * Reads one brand database through provider_office_reader.
 * Brand 002 never uses the NextPari URL. A missing view is an error, not zero GGR.
 */
export function liveReportingSource(env: NodeJS.ProcessEnv = process.env): ReportingSource {
  const connectionString = env.PROVIDER_OFFICE_REPORTING_DATABASE_URL?.trim() ?? '';
  if (!connectionString) return unconfiguredReportingSource();
  return {
    async load(brandCode: string, period: ReportingPeriod) {
      if (brandCode !== '001') return { ok: false, error: 'BRAND_DATABASE_NOT_CONNECTED' };
      try {
        assertReportingConnection(connectionString, env);
        const pool = new pg.Pool(poolConfig(connectionString, env.PROVIDER_OFFICE_DATABASE_SSL_ROOT_CERT));
        try {
          const result = await pool.query(FACTS_SQL, [
            `${period.start}T00:00:00.000Z`,
            exclusiveEnd(period.end),
          ]);
          return {
            ok: true,
            facts: result.rows.map(readFact),
            loadedAt: new Date().toISOString(),
            rate: null,
          };
        } finally {
          await pool.end();
        }
      } catch {
        return { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' };
      }
    },
  };
}

export function assertReportingConnection(connectionString: string, env: NodeJS.ProcessEnv = process.env): void {
  if ((env.VITE_PROVIDER_OFFICE_REPORTING_DATABASE_URL ?? '').trim()) {
    throw new ProviderOfficeError('REPORTING_SOURCE_UNAVAILABLE');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ProviderOfficeError('REPORTING_SOURCE_UNAVAILABLE');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ProviderOfficeError('REPORTING_SOURCE_UNAVAILABLE');
  }
  const bare = decodeURIComponent(url.username).split('.')[0] ?? '';
  if (bare !== READER_ROLE || FORBIDDEN_USERS.has(bare) || !url.password) {
    throw new ProviderOfficeError('REPORTING_SOURCE_UNAVAILABLE');
  }
  if (/sslmode=disable|sslmode=allow|sslmode=prefer|uselibpqcompat=true/i.test(url.search)) {
    throw new ProviderOfficeError('REPORTING_SOURCE_UNAVAILABLE');
  }
}

export function publicReportingFailure(error: unknown): string {
  if (error instanceof ProviderOfficeError) return error.code;
  return 'REPORTING_SOURCE_UNAVAILABLE';
}

function poolConfig(connectionString: string, rootCert: string | undefined): pg.PoolConfig {
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) {
    url.searchParams.delete(key);
  }
  const ssl: { rejectUnauthorized: true; servername: string; ca?: string[] } = {
    rejectUnauthorized: true,
    servername: url.hostname,
  };
  if (rootCert?.includes('BEGIN CERTIFICATE') && !rootCert.includes('PRIVATE KEY')) {
    ssl.ca = [...tls.rootCertificates, rootCert];
  }
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    ssl,
    application_name: 'provider-office-reader',
  };
}

function readFact(row: Record<string, unknown>): SportsBetFact {
  const settlement = settlementOf(String(row.settlement_state ?? ''));
  const status = String(row.status ?? '') === 'cancelled' ? 'cancelled' : 'settled';
  return {
    betId: String(row.bet_id ?? ''),
    brandCode: '001',
    product: 'sports',
    currency: String(row.currency ?? ''),
    stake: String(row.stake ?? ''),
    payout: String(row.payout ?? ''),
    settlement,
    status,
    mode: String(row.mode ?? '') === 'express' ? 'express' : 'single',
    settledAt: row.settled_at instanceof Date ? row.settled_at.toISOString() : String(row.settled_at ?? ''),
    testAccount: false,
    sports: Array.isArray(row.sports) ? row.sports.map((sport) => String(sport)) : [],
  };
}

function settlementOf(value: string): SettlementClass {
  if (value === 'winner' || value === 'loser' || value === 'half_won' || value === 'half_lost' || value === 'refund' || value === 'cancelled') {
    return value;
  }
  throw new ProviderOfficeError('SETTLEMENT_UNSUPPORTED');
}

function exclusiveEnd(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
