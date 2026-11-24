import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assignBrand, authorizeReport, containsForbidden, createInvitation, acceptInvitation, stripForbidden } from './access.js';
import { contractualFee, contractDeadlines, oddspapiContract } from './contract.js';
import { ProviderOfficeError } from './errors.js';
import { applyRate, convertToUsd, rememberSnapshot } from './exchange.js';
import { ALLOCATION_METHOD, computeSportsbook, type SportsBetFact } from './ggr.js';
import { assertReportingConnection, publicReportingFailure } from './liveReport.js';
import {
  allowProviderConnection,
  catalogueAfterResponse,
  CONFIRMED_ODDSPAPI_LIMITS,
  endpointBudget,
  mayDistributeToBrand,
  oddsAreActionable,
  readRateLimitHeaders,
} from './limits.js';
import { addUkBusinessDays, periodContaining } from './periods.js';
import { buildSportsbookReport, finalizeSportsbookSnapshot, toCsv } from './report.js';
import { SEED_DIRECTORY, ODDSPAPI_PROVIDER_ID, SOFTAGGREGATOR_PROVIDER_ID } from './terms.js';
import { accumulatorPayout, planSettlementTransition, settlementPayout } from '../sports/payout.js';
import { SPORTS_SETTLEMENT } from '../sports/settlement.js';
import { apiDeploymentDecision } from '../group/deploymentGate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AS_OF = '2026-11-24';
const PERIOD_END = '2026-12-22';

function bet(overrides: Partial<SportsBetFact> = {}): SportsBetFact {
  return {
    betId: 'bet-1',
    brandCode: '001',
    product: 'sports',
    currency: 'USD',
    stake: '100.00',
    payout: '0.00',
    settlement: 'loser',
    status: 'settled',
    mode: 'single',
    settledAt: '2026-11-24T12:00:00.000Z',
    testAccount: false,
    sports: ['football'],
    ...overrides,
  };
}

function reportFor(facts: readonly SportsBetFact[], actor: Parameters<typeof buildSportsbookReport>[0]['actor'] = { kind: 'group_owner' }, brandCode: string | null = '001') {
  return buildSportsbookReport({
    actor,
    directory: SEED_DIRECTORY,
    brandCode,
    asOf: AS_OF,
    facts,
    loadedAt: '2026-11-24T18:00:00.000Z',
    rate: null,
  });
}

describe('OddsPapi contract fee', () => {
  const terms = oddspapiContract(SEED_DIRECTORY);
  const cases: Array<[string, string]> = [
    ['-10000.00', '3000.00'],
    ['0.00', '3000.00'],
    ['20000.00', '3000.00'],
    ['30000.00', '3000.00'],
    ['50000.00', '5000.00'],
    ['100000.00', '10000.00'],
  ];

  for (const [ggr, total] of cases) {
    it(`GGR ${ggr} bills ${total}`, () => {
      const fee = contractualFee(ggr, terms);
      assert.equal(fee.monthlyFee, '3000.00');
      assert.equal(fee.revenueShareBps, 1000);
      assert.equal(fee.totalMonthlyFee, total);
    });
  }

  it('reads the share and fee from the contract record', () => {
    const other = contractualFee('1000.00', { monthlyFee: '100.00', revenueShareBps: 5000 });
    assert.equal(other.topUpFee, '400.00');
    assert.equal(other.totalMonthlyFee, '500.00');
    assert.equal(contractualFee('50000.00', terms).totalMonthlyFee, '5000.00');
  });

  it('keeps the November agreement dates', () => {
    assert.equal(periodContaining('2026-11-24').start, '2026-11-23');
    assert.equal(periodContaining('2026-11-24').end, '2026-12-22');
    assert.equal(periodContaining('2026-12-23').start, '2026-12-23');
    const deadlines = contractDeadlines(terms, { start: '2026-11-23', end: '2026-12-22' });
    assert.equal(deadlines.accessDeadline, addUkBusinessDays('2026-11-23', 5));
    assert.equal(deadlines.accessDeadline, '2026-11-30');
    assert.equal(deadlines.reportingDeadline, '2026-12-31');
    assert.equal(deadlines.topUpDeadlineDays, 7);
    assert.equal(terms.coveredBrandCodes.includes('002'), false);
  });
});

describe('contractual sportsbook GGR', () => {
  it('uses eligible stakes minus winnings and keeps a negative result', () => {
    const lost = reportFor([bet()]);
    assert.equal(lost.ok, true);
    if (!lost.ok) return;
    assert.equal(lost.reporting.ggr, '100.00');
    assert.equal(lost.fee.totalMonthlyFee, '3000.00');
    const won = reportFor([bet({ settlement: 'winner', payout: '200.00' })]);
    assert.equal(won.ok && won.reporting.ggr, '-100.00');
  });

  it('excludes refunds, pushes, cancellations, test accounts, and other brands', () => {
    const built = reportFor([
      bet({ betId: 'real', stake: '50.00', payout: '0.00' }),
      bet({ betId: 'void', settlement: 'refund', stake: '80.00', payout: '80.00' }),
      bet({ betId: 'push', settlement: 'push', stake: '20.00', payout: '20.00' }),
      bet({ betId: 'cancel', settlement: 'cancelled', status: 'cancelled', stake: '30.00', payout: '30.00' }),
      bet({ betId: 'test', testAccount: true, stake: '999.00', payout: '0.00' }),
      bet({ betId: 'ryxo', brandCode: '002', stake: '400.00', payout: '0.00' }),
      bet({ betId: 'bonus', stake: '10.00', payout: '0.00', bonusCost: '10.00' }),
    ]);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.reporting.eligibleStakes, '60.00');
    assert.equal(built.reporting.ggr, '60.00');
    assert.equal(built.reporting.refundedStakes, '130.00');
    assert.equal(built.counts.cancelledCount, 1);
    assert.equal(JSON.stringify(built).includes('999.00'), false);
    assert.equal(JSON.stringify(built).includes('400.00'), false);
  });

  it('counts an accumulator stake once and replaces a resettlement', () => {
    const express = reportFor([bet({
      betId: 'express',
      mode: 'express',
      stake: '10.00',
      payout: '40.00',
      settlement: 'winner',
      sports: ['football', 'tennis'],
    })]);
    assert.equal(express.ok && express.reporting.eligibleStakes, '10.00');
    assert.equal(express.ok && express.reporting.ggr, '-30.00');
    const corrected = reportFor([
      bet({ betId: 'same', payout: '0.00', settledAt: '2026-11-24T10:00:00.000Z' }),
      bet({ betId: 'same', settlement: 'winner', payout: '250.00', settledAt: '2026-11-24T11:00:00.000Z' }),
    ]);
    assert.equal(corrected.ok && corrected.reporting.eligibleStakes, '100.00');
    assert.equal(corrected.ok && corrected.reporting.ggr, '-150.00');
    assert.equal(corrected.ok && corrected.counts.settledBetCount, 1);
  });

  it('allocates a multi-sport stake without duplicating it', () => {
    const built = computeSportsbook([bet({
      stake: '10.00',
      payout: '0.00',
      sports: ['tennis', 'football', 'tennis'],
    })], '001');
    assert.equal(built.sports.method, ALLOCATION_METHOD);
    assert.equal(built.sports.status, 'allocated');
    const stakes = built.sports.rows.reduce((sum, row) => sum + Number(row.eligibleStakes), 0);
    assert.equal(stakes.toFixed(2), '10.00');
    assert.equal(built.sports.rows[0]?.sport, 'football');
    const untagged = computeSportsbook([bet({ sports: [] })], '001');
    assert.equal(untagged.sports.status, 'SPORT_TAG_UNAVAILABLE');
    assert.equal(untagged.sports.rows.length, 0);
    assert.equal(untagged.totals[0]?.ggr, '100.00');
  });

  it('shows zeros only when the ledger query succeeded and was empty', () => {
    const empty = reportFor([]);
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    assert.equal(empty.synthetic, false);
    assert.equal(empty.reporting.ggr, '0.00');
    assert.equal(empty.reporting.status, 'final');
    assert.equal(empty.fee.totalMonthlyFee, '3000.00');
  });
});

describe('currency and snapshots', () => {
  it('does not replace the contractual rate with another rate', () => {
    const gaming = convertToUsd('10.00', 'TMT', {
      pair: 'TMT/USD',
      rate: '0.20',
      source: 'gaming-internal',
      effectiveDate: PERIOD_END,
      status: 'verified',
    } as never);
    assert.equal(gaming.status, 'rate_required');
    assert.equal(gaming.usd, '');
    const missing = reportFor([bet({ currency: 'TMT', stake: '40000.00', payout: '0.00', sports: [] })]);
    assert.equal(missing.ok && missing.reporting.status, 'rate_required');
    assert.equal(missing.ok && missing.reporting.ggr, null);
    assert.equal(missing.ok && missing.fee.totalMonthlyFee, null);
  });

  it('marks an unverified P2P rate as provisional', () => {
    const built = buildSportsbookReport({
      actor: { kind: 'provider', providerId: ODDSPAPI_PROVIDER_ID },
      directory: SEED_DIRECTORY,
      brandCode: '001',
      asOf: AS_OF,
      facts: [bet({ currency: 'TMTM', stake: '100.00', payout: '0.00', sports: [] })],
      loadedAt: '2026-11-24T18:00:00.000Z',
      rate: { pair: 'TMT/USD', rate: '0.05000000', source: 'usdt-p2p', effectiveDate: PERIOD_END, status: 'unverified' },
    });
    assert.equal(built.ok && built.reporting.status, 'provisional');
    assert.equal(built.ok && built.reporting.ggr, '5.00');
    assert.equal(built.ok && built.fee.status, 'provisional');
    assert.equal(applyRate(10000n, '0.05000000'), 500n);
  });

  it('does not rewrite a closed snapshot', () => {
    const snapshots = new Map();
    const input = {
      actor: { kind: 'group_owner' as const },
      directory: SEED_DIRECTORY,
      brandCode: '001',
      asOf: AS_OF,
      facts: [bet({ currency: 'USD', stake: '50000.00', payout: '0.00', sports: [] })],
      loadedAt: '2026-11-24T18:00:00.000Z',
      rate: null,
      snapshots,
    };
    const closed = finalizeSportsbookSnapshot(input);
    assert.equal(closed.reporting.ggr, '50000.00');
    assert.equal(closed.fee.totalMonthlyFee, '5000.00');
    const later = buildSportsbookReport({ ...input, facts: [] });
    assert.equal(later.ok && later.reporting.ggr, '50000.00');
    assert.equal(later.ok && later.closedSnapshot, true);
    assert.throws(() => finalizeSportsbookSnapshot({
      ...input,
      facts: [bet({ stake: '10.00', payout: '0.00', sports: [] })],
    }), (error: unknown) => error instanceof ProviderOfficeError && error.code === 'SNAPSHOT_CLOSED');
    assert.throws(() => finalizeSportsbookSnapshot({ ...input, actor: { kind: 'provider', providerId: ODDSPAPI_PROVIDER_ID } }), (error: unknown) => error instanceof ProviderOfficeError && error.code === 'READ_ONLY');
    assert.throws(() => rememberSnapshot(new Map([['10000000-0000-4000-8000-0000000000a1|001|2026-11-23|2026-12-22', {
      providerId: ODDSPAPI_PROVIDER_ID,
      brandCode: '001',
      periodStart: '2026-11-23',
      periodEnd: '2026-12-22',
      rate: '1',
      rateStatus: 'verified',
      usdGgr: '1.00',
      totalMonthlyFee: '3000.00',
    }]]), {
      providerId: ODDSPAPI_PROVIDER_ID,
      brandCode: '001',
      periodStart: '2026-11-23',
      periodEnd: '2026-12-22',
      rate: '2',
      rateStatus: 'verified',
      usdGgr: '9.00',
      totalMonthlyFee: '3000.00',
    }), (error: unknown) => error instanceof ProviderOfficeError && error.code === 'SNAPSHOT_CLOSED');
  });
});

describe('tenant isolation', () => {
  it('lets the group owner read NextPari and refuses RYXO on the OddsPapi contract', () => {
    const allowed = reportFor([bet(), bet({ betId: 'other', brandCode: '002', stake: '999.00' })]);
    assert.equal(allowed.ok && allowed.brandCode, '001');
    assert.equal(allowed.ok && allowed.reporting.ggr, '100.00');
    const denied = reportFor([bet({ brandCode: '002', stake: '999.00' })], { kind: 'group_owner' }, '002');
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.error, 'BRAND_NOT_COVERED');
  });

  it('keeps brand offices on their own book', () => {
    const nextpari = reportFor([bet(), bet({ betId: 'ryxo', brandCode: '002', stake: '700.00' })], { kind: 'brand_office', brandCode: '001' }, '002');
    assert.equal(nextpari.ok, false);
    if (!nextpari.ok) assert.equal(nextpari.error, 'BRAND_ISOLATION');
    const ryxo = reportFor([bet({ stake: '700.00' })], { kind: 'brand_office', brandCode: '002' }, '001');
    assert.equal(ryxo.ok, false);
    if (!ryxo.ok) assert.equal(ryxo.error, 'BRAND_ISOLATION');
    const own = reportFor([bet({ stake: '15.00' }), bet({ betId: 'hidden', brandCode: '002', stake: '700.00' })], { kind: 'brand_office', brandCode: '001' });
    assert.equal(own.ok && own.reporting.eligibleStakes, '15.00');
  });

  it('gives OddsPapi read-only NextPari sportsbook scope and no other provider', () => {
    const allowed = authorizeReport({ kind: 'provider', providerId: ODDSPAPI_PROVIDER_ID }, SEED_DIRECTORY, {
      providerId: ODDSPAPI_PROVIDER_ID,
      brandCode: '001',
      scope: 'sportsbook_ggr',
      onDate: AS_OF,
    });
    assert.equal(allowed.access, 'read');
    assert.throws(() => authorizeReport({ kind: 'provider', providerId: ODDSPAPI_PROVIDER_ID }, SEED_DIRECTORY, {
      providerId: ODDSPAPI_PROVIDER_ID,
      brandCode: '002',
      scope: 'sportsbook_ggr',
      onDate: AS_OF,
    }), (error: unknown) => error instanceof ProviderOfficeError && error.code === 'BRAND_NOT_COVERED');
    assert.throws(() => authorizeReport({ kind: 'provider', providerId: ODDSPAPI_PROVIDER_ID }, SEED_DIRECTORY, {
      providerId: SOFTAGGREGATOR_PROVIDER_ID,
      brandCode: null,
      scope: 'casino_ggr',
      onDate: AS_OF,
    }), (error: unknown) => error instanceof ProviderOfficeError && error.code === 'PROVIDER_ISOLATION');
    assert.throws(() => assignBrand(SEED_DIRECTORY, ODDSPAPI_PROVIDER_ID, '002', AS_OF));
    const future = {
      ...SEED_DIRECTORY,
      contracts: SEED_DIRECTORY.contracts.map((contract) => contract.id === oddspapiContract(SEED_DIRECTORY).id
        ? { ...contract, coveredBrandCodes: ['004'] }
        : contract),
      assignments: [],
    };
    const assigned = assignBrand(future, ODDSPAPI_PROVIDER_ID, '004', AS_OF);
    assert.equal(assigned.assignments.some((item) => item.brandCode === '004'), true);
    assert.equal(assigned.assignments.some((item) => item.brandCode === '002'), false);
  });

  it('strips player, wallet, and credential fields', () => {
    const poisoned = stripForbidden({ ggr: '1.00', email: 'a@b.c', phone: '+993', walletId: 'w', apiKey: 'secret', nested: { passport: 'x', stake: '1.00' } });
    assert.deepEqual(poisoned, { ggr: '1.00', nested: { stake: '1.00' } });
    const built = reportFor([Object.assign(bet(), { email: 'a@b.c', player_user_id: 'user-1' })]);
    assert.equal(containsForbidden(built), false);
    assert.equal(JSON.stringify(built).includes('a@b.c'), false);
    const csv = built.ok ? toCsv(built) : '';
    assert.equal(csv.includes('email'), false);
    assert.match(csv, /ggr/);
  });
});

describe('existing settlement engine', () => {
  it('feeds documented payouts into contractual GGR without a second engine', () => {
    const stake = 100;
    const odds = 2;
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.Lost), 0);
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.Won), 200);
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.Refund), 100);
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.HalfLost), 50);
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.HalfWon), 150);
    assert.equal(settlementPayout(stake, odds, SPORTS_SETTLEMENT.Cancelled), null);
    const half = reportFor([bet({ settlement: 'half_won', payout: '150.00' })]);
    assert.equal(half.ok && half.reporting.ggr, '-50.00');
    const push = reportFor([bet({ settlement: 'refund', payout: String(settlementPayout(stake, odds, SPORTS_SETTLEMENT.Refund)?.toFixed(2)) })]);
    assert.equal(push.ok && push.reporting.ggr, '0.00');
    assert.equal(push.ok && push.reporting.refundedStakes, '100.00');
    const express = accumulatorPayout(10, [
      { acceptedOdds: 2, settlement: SPORTS_SETTLEMENT.Won },
      { acceptedOdds: 2, settlement: SPORTS_SETTLEMENT.Won },
    ]);
    assert.equal(express.payout, 40);
    const once = reportFor([bet({ mode: 'express', stake: '10.00', payout: '40.00', settlement: 'winner', sports: ['football', 'basketball'] })]);
    assert.equal(once.ok && once.reporting.eligibleStakes, '10.00');
    const duplicate = planSettlementTransition({
      previousCode: SPORTS_SETTLEMENT.Won,
      previousPayout: 200,
      incoming: SPORTS_SETTLEMENT.Won,
      stake,
      acceptedOdds: odds,
      sameFingerprint: true,
    });
    assert.equal(duplicate.action, 'duplicate');
    assert.equal(duplicate.nextEconomicPayout, 200);
  });

  it('does not write wallets from the reporting modules', () => {
    const files = ['ggr.ts', 'report.ts', 'http.ts', 'liveReport.ts'];
    for (const file of files) {
      const source = readFileSync(join(root, 'server', 'providerOffice', file), 'utf8');
      assert.equal(source.includes('apply_wallet_entry'), false, file);
      assert.equal(source.includes('UPDATE private.wallets'), false, file);
    }
  });
});

describe('OddsPapi limits and database guard', () => {
  it('matches the supplier-confirmed budgets and keeps a catalogue on 429', () => {
    assert.equal(endpointBudget('/fixtures/odds').limit, 10);
    assert.equal(endpointBudget('/fixtures/odds/main').limit, 10);
    assert.equal(endpointBudget('/fixtures/settlement').limit, 200);
    assert.equal(CONFIRMED_ODDSPAPI_LIMITS.rest.daily, null);
    assert.equal(CONFIRMED_ODDSPAPI_LIMITS.websocket.connectionsPerKey, 8);
    assert.equal(CONFIRMED_ODDSPAPI_LIMITS.websocket.messageRateCap, null);
    const headers = readRateLimitHeaders({ 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '4', 'Retry-After': '2' });
    assert.equal(headers.limit, 10);
    assert.equal(headers.remaining, 4);
    assert.equal(headers.retryAfterMs, 2000);
    assert.deepEqual(catalogueAfterResponse(['fixture-a'], 429, []), ['fixture-a']);
    assert.equal(oddsAreActionable({ suspended: true }), false);
    assert.equal(oddsAreActionable({ stale: true }), false);
    assert.equal(allowProviderConnection('per-player'), false);
    assert.equal(allowProviderConnection('shared-feed'), true);
    assert.equal(mayDistributeToBrand('002', ['001']), false);
    assert.equal(mayDistributeToBrand('001', ['001']), true);
  });

  it('refuses a service role and does not echo a connection string', () => {
    assert.throws(() => assertReportingConnection('postgres://service_role:pw@db.example.co:5432/postgres?sslmode=require'));
    assert.doesNotThrow(() => assertReportingConnection('postgres://provider_office_reader:pw@db.example.co:5432/postgres?sslmode=require'));
    assert.throws(() => assertReportingConnection(
      'postgres://provider_office_reader:pw@db.example.co:5432/postgres?sslmode=require',
      { VITE_PROVIDER_OFFICE_REPORTING_DATABASE_URL: 'leaked' },
    ));
    const secret = 'postgres://provider_office_reader:secret@db.example.co/postgres';
    assert.equal(publicReportingFailure(new Error(secret)).includes('secret'), false);
  });

  it('keeps the review SQL out of production migrations', () => {
    const sql = readFileSync(join(root, 'server/providerOffice/sql/001_provider_office.sql'), 'utf8');
    assert.match(sql, /DO NOT APPLY/);
    assert.match(sql, /security_barrier/);
    assert.match(sql, /ARRAY\['001'\]/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.equal(sql.includes('GRANT SELECT ON TABLE private.sports_bets TO provider_office_reader'), false);
    assert.equal(sql.includes('55 Tech Limited'), true);
    const migrations = readdirSync(join(root, 'supabase/migrations'));
    assert.equal(migrations.some((name) => name.includes('provider_office')), false);
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    assert.equal(vercel.includes('provider-office'), false);
    assert.equal(apiDeploymentDecision('/api/player/me', { PROVIDER_OFFICE_DEPLOYMENT: '1' }), 'deny');
    assert.equal(apiDeploymentDecision('/api/provider-office/report', { PROVIDER_OFFICE_DEPLOYMENT: '1' }), 'allow');
    assert.equal(apiDeploymentDecision('/api/provider-office/report', { GROUP_OWNER_DEPLOYMENT: '1' }), 'deny');
    assert.equal(apiDeploymentDecision('/api/group-owner/providers', {}), 'allow');
  });
});

describe('invitations', () => {
  it('stores only a hash and does not issue a password', () => {
    const store = new Map();
    const issued = createInvitation(store, ODDSPAPI_PROVIDER_ID, Date.parse('2026-11-24T00:00:00.000Z'));
    const saved = store.get(issued.invitationId);
    assert.ok(saved);
    assert.notEqual(saved?.tokenHash, issued.token);
    assert.equal(saved?.tokenHash.includes(issued.token), false);
    assert.throws(() => acceptInvitation(store, issued.invitationId, 'wrong', Date.parse('2026-11-24T01:00:00.000Z')));
    assert.equal(acceptInvitation(store, issued.invitationId, issued.token, Date.parse('2026-11-24T01:00:00.000Z')), ODDSPAPI_PROVIDER_ID);
  });
});
