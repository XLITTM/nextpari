import { BetsApiReadOnlyClient } from '../betsapi/client.js';
import type { FeedResult, NormalizedEvent } from '../betsapi/types.js';
import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { settlementNoticeForLeg } from './betsapiSettlement.js';
import { applySportsSettlementNotices } from './settleHttp.js';
import { dispatchSettlementNotices, readSettlementSecret, readSettlementWebhookUrl, settlementSecretsEqual } from './settlementDispatch.js';
import type { SportsSettlementNotice } from './settlement.js';

export const BETSAPI_SETTLEMENT_JOB_PATH = '/api/internal/sports/betsapi-settle';
const MAX_FIXTURES_PER_RUN = 3;
const SUPPORTED_MARKETS = new Set(['1x2', 'over_under', 'asian_handicap']);

export interface UnsettledFootballLeg {
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
}

export interface FootballResultSource {
  getEventResult(eventId: string): Promise<FeedResult>;
}

function bearerToken(header: string | undefined): string {
  const value = String(header ?? '').trim();
  if (value.toLowerCase().startsWith('bearer ')) return value.slice(7).trim();
  return value;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function gradeOpenFootballLegs(
  legs: UnsettledFootballLeg[],
  events: ReadonlyMap<string, NormalizedEvent | null>,
): SportsSettlementNotice[] {
  const notices: SportsSettlementNotice[] = [];
  const seen = new Set<string>();
  for (const leg of legs) {
    if (!SUPPORTED_MARKETS.has(leg.marketKey)) continue;
    const event = events.get(leg.fixtureId);
    if (!event) continue;
    const notice = settlementNoticeForLeg(event, leg);
    if (!notice || seen.has(notice.fingerprint)) continue;
    seen.add(notice.fingerprint);
    notices.push(notice);
  }
  return notices;
}

export async function ingestFootballResults(
  legs: UnsettledFootballLeg[],
  source: FootballResultSource,
  limit = MAX_FIXTURES_PER_RUN,
): Promise<{ events: Map<string, NormalizedEvent | null>; deferredFixtures: number }> {
  const ids = [...new Set(legs.map((leg) => leg.fixtureId))].filter((id) => /^\d{1,20}$/.test(id));
  const selected = ids.slice(0, Math.max(0, limit));
  const events = new Map<string, NormalizedEvent | null>();
  for (const id of selected) {
    const result = await source.getEventResult(id);
    events.set(id, result.ok ? result.feed?.events[0] ?? null : null);
  }
  return { events, deferredFixtures: Math.max(0, ids.length - selected.length) };
}

export async function deliverFootballSettlement(
  notices: SportsSettlementNotice[],
  env: NodeJS.ProcessEnv,
  ports: {
    fetch?: typeof fetch;
    apply?: (notices: SportsSettlementNotice[]) => Promise<{ status: number; body: Record<string, unknown> }>;
  } = {},
): Promise<{ mode: 'idle' | 'dispatch' | 'ledger'; status: number | null; count: number }> {
  if (!notices.length) return { mode: 'idle', status: null, count: 0 };
  const url = readSettlementWebhookUrl(env);
  const secret = readSettlementSecret(env);
  if (url && secret) {
    let status = 0;
    const fetchImpl = ports.fetch ?? fetch;
    await dispatchSettlementNotices(notices, env, {
      fetch: async (input, init) => {
        const response = await fetchImpl(input, init);
        status = response.status;
        return response;
      },
    });
    return { mode: 'dispatch', status: status || 502, count: notices.length };
  }
  const applied = await (ports.apply ?? applySportsSettlementNotices)(notices, env);
  return { mode: 'ledger', status: applied.status, count: notices.length };
}

export async function loadUnsettledBetsapiLegs(): Promise<UnsettledFootballLeg[]> {
  const staff = loadStaffOnboardingEnv();
  const client = createServiceRoleClient(staff.supabaseUrl, staff.supabaseServiceRoleKey);
  const { data, error } = await client
    .schema('private')
    .from('sports_bet_legs')
    .select('fixture_id, market_id, market_key, line, outcome_id')
    .eq('provider', 'betsapi')
    .is('settlement_code', null)
    .limit(50);
  if (error) throw new Error('OPEN_LEGS_UNAVAILABLE');
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return rows.flatMap((row) => {
    const fixtureId = text(row.fixture_id);
    const marketKey = text(row.market_key);
    const outcomeId = text(row.outcome_id);
    if (!fixtureId || !marketKey || !outcomeId) return [];
    return [{
      fixtureId,
      marketId: text(row.market_id),
      marketKey,
      line: text(row.line),
      outcomeId,
    }];
  });
}

export async function handleBetsapiSettlementJob(
  input: { method?: string; authorization?: string },
  env: NodeJS.ProcessEnv = process.env,
  ports: {
    loadLegs?: () => Promise<UnsettledFootballLeg[]>;
    results?: FootballResultSource;
    fetch?: typeof fetch;
    apply?: (notices: SportsSettlementNotice[]) => Promise<{ status: number; body: Record<string, unknown> }>;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const method = String(input.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'METHOD_NOT_ALLOWED' } };
  }
  const expected = text(env.CRON_SECRET);
  if (!settlementSecretsEqual(bearerToken(input.authorization), expected)) {
    return { status: 401, body: { ok: false, error: 'SETTLEMENT_JOB_UNAUTHORIZED' } };
  }
  if (!text(env.BETSAPI_TOKEN || env.BETSAPI_KEY)) {
    return {
      status: 200,
      body: { ok: true, skipped: 'TOKEN_MISSING', legs: 0, notices: 0, delivered: 0, mode: 'idle' },
    };
  }
  let legs: UnsettledFootballLeg[];
  try {
    legs = await (ports.loadLegs ?? loadUnsettledBetsapiLegs)();
  } catch {
    return { status: 503, body: { ok: false, error: 'OPEN_LEGS_UNAVAILABLE' } };
  }
  const results = ports.results ?? new BetsApiReadOnlyClient({ env, fetchImpl: ports.fetch });
  const ingested = await ingestFootballResults(legs, results);
  const gradedLegs = legs.filter((leg) => ingested.events.has(leg.fixtureId));
  const notices = gradeOpenFootballLegs(gradedLegs, ingested.events);
  const delivery = await deliverFootballSettlement(notices, env, ports);
  const failed = delivery.status != null && (delivery.status < 200 || delivery.status >= 300);
  return {
    status: failed ? 502 : 200,
    body: {
      ok: !failed,
      legs: legs.length,
      notices: notices.length,
      delivered: failed ? 0 : delivery.count,
      mode: delivery.mode,
      deferredFixtures: ingested.deferredFixtures,
    },
  };
}
