import {
  canonicalMarketKey,
  marketIdOf,
  marketLastUpdate,
  marketLineKey,
  parseTimestamp,
} from './keys.js';
import { buildMarketInventory, emptyIngestCounters } from './marketInventory.js';
import {
  mergeFixtureMetadata,
  readActiveEvents,
  readBetId,
  readBets,
  readEvents,
  readFixture,
  readFixtureId,
  readHeader,
  readLivescore,
  readMarkets,
} from './parse.js';
import {
  applySettlementCode,
  LSPORTS_SETTLEMENT,
  readSettlementCode,
  settlementFingerprint,
  type LsportsOutcomeSettlement,
} from './settlement.js';
import {
  LSPORTS_HEARTBEAT_STALE_MS,
  type LsportsApplyOptions,
  type LsportsFeedHealth,
  type LsportsFixtureState,
  type LsportsIngestCounters,
  type LsportsIngestSource,
  type LsportsKeepAliveDiscrepancy,
  type LsportsMarketInventory,
  type LsportsMarketRecord,
  type LsportsStateMetrics,
} from './types.js';

export interface LsportsSettlementNotice {
  fixtureId: number;
  marketId: string;
  marketKey: string;
  betId: string;
  settlement: number;
  fingerprint: string;
  lastUpdate: string | null;
}

function isOpenBetStatus(value: unknown): boolean {
  return value === 1 || value === '1';
}

/**
 * Type 3 / snapshot market replace is authoritative for open bets.
 * Clear sticky Type 35 result overlays when the incoming bet is open and
 * unsettled so later prices can be displayed again.
 */
export function clearStickySettlementsForOpenBets(
  settlements: Map<string, LsportsOutcomeSettlement>,
  market: Record<string, unknown>,
): void {
  for (const bet of readBets(market)) {
    const id = readBetId(bet);
    if (id == null) continue;
    const code = readSettlementCode(bet.Settlement);
    const open = isOpenBetStatus(bet.Status) || isOpenBetStatus(bet.BetStatusId);
    const unsettled = code == null
      || code === LSPORTS_SETTLEMENT.NotSettled
      || code === LSPORTS_SETTLEMENT.Cancelled;
    if (open && unsettled) settlements.delete(String(id));
  }
}

function emptyFixture(fixtureId: number): LsportsFixtureState {
  return {
    fixtureId,
    fixture: null,
    livescore: null,
    livescoreSource: { source: null, serverTimestamp: null, lastUpdate: null },
    markets: new Map(),
    active: false,
    lastSource: null,
  };
}

function overlaySettlements(
  market: Record<string, unknown>,
  settlements: Map<string, LsportsOutcomeSettlement>,
): Record<string, unknown> {
  const bets = readBets(market).map((bet) => {
    const id = readBetId(bet);
    if (id == null) return { ...bet };
    const state = settlements.get(String(id));
    if (!state) return { ...bet };
    return { ...bet, Settlement: state.received };
  });
  return { ...market, Bets: bets };
}

function newerOrEqual(incoming: string | null, existing: string | null): boolean {
  const incomingMs = parseTimestamp(incoming);
  const existingMs = parseTimestamp(existing);
  if (incomingMs != null && existingMs != null) return incomingMs >= existingMs;
  if (incomingMs != null) return true;
  return false;
}

/**
 * Market conflict policy for recovery replay:
 * - If both sides have LastUpdate, the later timestamp wins.
 * - If LastUpdate is absent, apply a buffered RMQ update only when it arrived
 *   at or after snapshotRequestedAt. Pre-snapshot messages yield to the snapshot.
 */
export function shouldReplaceMarket(
  incomingLastUpdate: string | null,
  existingLastUpdate: string | null,
  options: LsportsApplyOptions = {},
): boolean {
  const incomingMs = parseTimestamp(incomingLastUpdate);
  const existingMs = parseTimestamp(existingLastUpdate);
  if (incomingMs != null && existingMs != null) return incomingMs >= existingMs;
  if (incomingMs != null && existingMs == null) return true;
  const snapshotRequestedAt = options.snapshotRequestedAt;
  if (snapshotRequestedAt == null) return true;
  const receivedAt = options.receivedAt ?? snapshotRequestedAt;
  return receivedAt >= snapshotRequestedAt;
}

export class LsportsInPlayStore {
  private readonly fixtures = new Map<number, LsportsFixtureState>();
  private activeEvents: number[] = [];
  private lastHeartbeatServerTimestamp: number | null = null;
  private lastHeartbeatReceivedAt: number | null = null;
  private bufferDepth = 0;
  private readonly ingestCounters: LsportsIngestCounters = emptyIngestCounters();
  private settlementNotices: LsportsSettlementNotice[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  setBufferDepth(depth: number): void {
    this.bufferDepth = Math.max(0, depth);
  }

  getFixture(fixtureId: number): LsportsFixtureState | undefined {
    return this.fixtures.get(fixtureId);
  }

  listFixtures(): LsportsFixtureState[] {
    return [...this.fixtures.values()];
  }

  private ensure(fixtureId: number): LsportsFixtureState {
    let current = this.fixtures.get(fixtureId);
    if (!current) {
      current = emptyFixture(fixtureId);
      this.fixtures.set(fixtureId, current);
    }
    return current;
  }

  private markLive(state: LsportsFixtureState, source: LsportsIngestSource): void {
    state.active = true;
    state.lastSource = source;
  }

  ingestFixturesSnapshot(payload: unknown): void {
    for (const event of readEvents(payload)) {
      const fixtureId = readFixtureId(event);
      if (fixtureId == null) continue;
      const state = this.ensure(fixtureId);
      state.fixture = mergeFixtureMetadata(state.fixture, readFixture(event));
      state.lastSource = 'snapshot-fixtures';
    }
  }

  ingestScoresSnapshot(payload: unknown, options: LsportsApplyOptions = {}): void {
    const header = readHeader(payload);
    for (const event of readEvents(payload)) {
      this.applyLivescore(event, 'snapshot-scores', header.serverTimestamp, options);
    }
  }

  ingestMarketsSnapshot(payload: unknown, options: LsportsApplyOptions = {}): void {
    for (const event of readEvents(payload)) {
      this.ingestCounters.snapshotMarketEvents += 1;
      this.applyMarkets(event, 'snapshot-markets', options);
    }
  }

  noteRmqTransport(result: 'parsed' | 'parse-failed'): void {
    this.ingestCounters.rmqReceived += 1;
    if (result === 'parsed') this.ingestCounters.rmqParsed += 1;
    else this.ingestCounters.rmqParseFailed += 1;
  }

  ingestRmq(payload: unknown, options: LsportsApplyOptions = {}): void {
    const header = readHeader(payload);
    if (header.type == null) this.ingestCounters.typeNullMessages += 1;
    else if (header.type === 1) this.ingestCounters.type1Messages += 1;
    else if (header.type === 2) this.ingestCounters.type2Messages += 1;
    else if (header.type === 3) this.ingestCounters.type3Messages += 1;
    else if (header.type === 31) this.ingestCounters.type31Messages += 1;
    else if (header.type === 32) this.ingestCounters.type32Messages += 1;
    else if (header.type === 35) this.ingestCounters.type35Messages += 1;
    else this.ingestCounters.typeUnknownMessages += 1;

    switch (header.type) {
      case 1:
        this.ingestFixtureDelta(payload, header.serverTimestamp);
        break;
      case 2:
        this.ingestLivescoreDelta(payload, header.serverTimestamp, options);
        break;
      case 3:
        this.applyMarketDeltaEvents(payload, options);
        break;
      case 31:
        this.ingestKeepAlive(payload);
        break;
      case 32:
        this.ingestHeartbeat(payload, options.receivedAt);
        break;
      case 35:
        this.applySettlementEvents(payload, options);
        break;
      default:
        break;
    }
  }

  ingestFixtureDelta(payload: unknown, _serverTimestamp: number | null = readHeader(payload).serverTimestamp): void {
    for (const event of readEvents(payload)) {
      const fixtureId = readFixtureId(event);
      if (fixtureId == null) continue;
      const state = this.ensure(fixtureId);
      state.fixture = mergeFixtureMetadata(state.fixture, readFixture(event));
      state.lastSource = 'rmq-1';
    }
  }

  ingestLivescoreDelta(
    payload: unknown,
    serverTimestamp: number | null = readHeader(payload).serverTimestamp,
    options: LsportsApplyOptions = {},
  ): void {
    for (const event of readEvents(payload)) {
      this.applyLivescore(event, 'rmq-2', serverTimestamp, options);
    }
  }

  ingestMarketDelta(payload: unknown, options: LsportsApplyOptions = {}): void {
    this.applyMarketDeltaEvents(payload, options);
  }

  private applyMarketDeltaEvents(payload: unknown, options: LsportsApplyOptions = {}): void {
    for (const event of readEvents(payload)) {
      this.applyMarkets(event, 'rmq-3', options);
    }
  }

  ingestSettlement(payload: unknown, options: LsportsApplyOptions = {}): void {
    this.applySettlementEvents(payload, options);
  }

  private applySettlementEvents(payload: unknown, options: LsportsApplyOptions = {}): void {
    const header = readHeader(payload);
    for (const event of readEvents(payload)) {
      this.patchSettlementEvent(event, header.msgGuid, options);
    }
  }

  ingestKeepAlive(payload: unknown): void {
    this.activeEvents = readActiveEvents(payload);
  }

  ingestHeartbeat(payload: unknown, receivedAt = this.now()): void {
    const header = readHeader(payload);
    if (header.serverTimestamp != null) {
      this.lastHeartbeatServerTimestamp = header.serverTimestamp;
    }
    this.lastHeartbeatReceivedAt = receivedAt;
  }

  getLastHeartbeatServerTimestamp(): number | null {
    return this.lastHeartbeatServerTimestamp;
  }

  private applyLivescore(
    event: Record<string, unknown>,
    source: 'snapshot-scores' | 'rmq-2',
    serverTimestamp: number | null,
    options: LsportsApplyOptions,
  ): void {
    const fixtureId = readFixtureId(event);
    const livescore = readLivescore(event);
    if (fixtureId == null || livescore == null) return;
    const state = this.ensure(fixtureId);
    state.fixture = mergeFixtureMetadata(state.fixture, readFixture(event));
    const incomingLastUpdate = typeof livescore.LastUpdate === 'string' ? livescore.LastUpdate : null;
    if (incomingLastUpdate && state.livescoreSource.lastUpdate) {
      if (!newerOrEqual(incomingLastUpdate, state.livescoreSource.lastUpdate)) return;
    } else if (
      source === 'rmq-2'
      && options.snapshotRequestedAt != null
      && (options.receivedAt ?? 0) < options.snapshotRequestedAt
      && state.livescore != null
    ) {
      return;
    }
    state.livescore = livescore;
    state.livescoreSource = {
      source,
      serverTimestamp,
      lastUpdate: incomingLastUpdate,
    };
    this.markLive(state, source);
  }

  private applyMarkets(
    event: Record<string, unknown>,
    source: 'snapshot-markets' | 'rmq-3',
    options: LsportsApplyOptions,
  ): void {
    const fixtureId = readFixtureId(event);
    if (fixtureId == null) return;
    const state = this.ensure(fixtureId);
    state.fixture = mergeFixtureMetadata(state.fixture, readFixture(event));
    let replaced = false;
    for (const market of readMarkets(event)) {
      const key = canonicalMarketKey(fixtureId, market);
      const incomingLastUpdate = marketLastUpdate(market);
      const existing = state.markets.get(key);
      if (existing && !shouldReplaceMarket(incomingLastUpdate, existing.lastUpdate, options)) {
        continue;
      }
      const settlements = existing?.settlements ?? new Map();
      clearStickySettlementsForOpenBets(settlements, market);
      const marketId = marketIdOf(market);
      state.markets.set(key, {
        key,
        marketId,
        line: marketLineKey(market),
        payload: overlaySettlements(market, settlements),
        lastUpdate: incomingLastUpdate,
        settlements,
      });
      replaced = true;
      if (source === 'rmq-3') {
        this.ingestCounters.marketsAppliedFromType3 += 1;
        if (String(marketId) === '1') this.ingestCounters.market1AppliedFromType3 += 1;
      } else {
        this.ingestCounters.marketsAppliedFromSnapshot += 1;
        if (String(marketId) === '1') this.ingestCounters.market1AppliedFromSnapshot += 1;
      }
    }
    if (replaced) this.markLive(state, source);
  }

  private patchSettlementEvent(
    event: Record<string, unknown>,
    msgGuid: string | null,
    options: LsportsApplyOptions,
  ): void {
    const fixtureId = readFixtureId(event);
    if (fixtureId == null) return;
    const state = this.ensure(fixtureId);
    let patched = false;
    for (const incoming of readMarkets(event)) {
      const key = canonicalMarketKey(fixtureId, incoming);
      const existing = state.markets.get(key);
      const settlements = existing?.settlements ?? new Map();
      const bets = existing ? readBets(existing.payload).map((bet) => ({ ...bet })) : [];
      const byId = new Map<string, Record<string, unknown>>();
      const order: string[] = [];
      for (const bet of bets) {
        const id = readBetId(bet);
        if (id == null) continue;
        const sid = String(id);
        byId.set(sid, bet);
        order.push(sid);
      }
      for (const bet of readBets(incoming)) {
        const id = readBetId(bet);
        if (id == null) continue;
        const sid = String(id);
        const incomingLastUpdate = typeof bet.LastUpdate === 'string' ? bet.LastUpdate : null;
        const previousBet = byId.get(sid);
        if (previousBet && incomingLastUpdate && typeof previousBet.LastUpdate === 'string') {
          if (!shouldReplaceMarket(incomingLastUpdate, previousBet.LastUpdate, options)) continue;
        }
        const code = readSettlementCode(bet.Settlement);
        if (code != null) {
          const fingerprint = settlementFingerprint({
            msgGuid,
            betId: sid,
            settlement: code,
            lastUpdate: incomingLastUpdate,
          });
          const applied = applySettlementCode(settlements.get(sid), code, fingerprint);
          settlements.set(sid, applied.next);
          if (applied.changed) {
            this.settlementNotices.push({
              fixtureId,
              marketId: String(marketIdOf(existing?.payload ?? incoming) ?? ''),
              marketKey: key,
              betId: sid,
              settlement: code,
              fingerprint,
              lastUpdate: incomingLastUpdate,
            });
          }
        }
        if (!previousBet) {
          byId.set(sid, { ...bet });
          order.push(sid);
        } else {
          const nextBet = { ...previousBet };
          for (const field of ['Settlement', 'Status', 'BetStatusId', 'LastUpdate', 'Price'] as const) {
            if (bet[field] !== undefined) nextBet[field] = bet[field];
          }
          byId.set(sid, nextBet);
        }
        patched = true;
      }
      const nextBets = order
        .map((id) => byId.get(id))
        .filter((bet): bet is Record<string, unknown> => bet != null);
      const payload = existing
        ? { ...existing.payload, Bets: nextBets }
        : { ...incoming, Bets: nextBets };
      state.markets.set(key, {
        key,
        marketId: marketIdOf(existing?.payload ?? incoming),
        line: marketLineKey(existing?.payload ?? incoming),
        payload: overlaySettlements(payload, settlements),
        lastUpdate: marketLastUpdate(payload),
        settlements,
      });
    }
    if (patched) this.markLive(state, 'rmq-35');
  }

  keepAliveDiscrepancies(): LsportsKeepAliveDiscrepancy {
    const activeSet = new Set(this.activeEvents);
    const activeInLsportsAbsentLocal = this.activeEvents.filter((id) => !this.fixtures.has(id));
    const localActiveAbsentFromKeepAlive = [...this.fixtures.values()]
      .filter((fixture) => fixture.active && !activeSet.has(fixture.fixtureId))
      .map((fixture) => fixture.fixtureId);
    return { activeInLsportsAbsentLocal, localActiveAbsentFromKeepAlive };
  }

  feedHealth(at = this.now()): LsportsFeedHealth {
    if (this.lastHeartbeatReceivedAt == null) return 'UNKNOWN';
    return at - this.lastHeartbeatReceivedAt <= LSPORTS_HEARTBEAT_STALE_MS ? 'HEALTHY' : 'STALE';
  }

  metrics(): LsportsStateMetrics {
    let marketCount = 0;
    let outcomeCount = 0;
    let activeFixtureCount = 0;
    for (const fixture of this.fixtures.values()) {
      if (fixture.active) activeFixtureCount += 1;
      marketCount += fixture.markets.size;
      for (const market of fixture.markets.values()) {
        outcomeCount += readBets(market.payload).length;
      }
    }
    const discrepancies = this.keepAliveDiscrepancies();
    return {
      fixtureCount: this.fixtures.size,
      activeFixtureCount,
      marketCount,
      outcomeCount,
      lastHeartbeatTimestamp: this.lastHeartbeatServerTimestamp,
      bufferDepth: this.bufferDepth,
      discrepanciesCount:
        discrepancies.activeInLsportsAbsentLocal.length
        + discrepancies.localActiveAbsentFromKeepAlive.length,
    };
  }

  getIngestCounters(): LsportsIngestCounters {
    return { ...this.ingestCounters };
  }

  marketInventory(): LsportsMarketInventory {
    return buildMarketInventory(this, this.ingestCounters);
  }

  getMarket(fixtureId: number, market: unknown): LsportsMarketRecord | undefined {
    return this.fixtures.get(fixtureId)?.markets.get(canonicalMarketKey(fixtureId, market));
  }

  getKeepAliveActiveEvents(): readonly number[] {
    return this.activeEvents;
  }

  heartbeatAgeMs(at = this.now()): number | null {
    if (this.lastHeartbeatReceivedAt == null) return null;
    return at - this.lastHeartbeatReceivedAt;
  }

  takeSettlementNotices(): LsportsSettlementNotice[] {
    const next = this.settlementNotices;
    this.settlementNotices = [];
    return next;
  }
}

export function betById(market: LsportsMarketRecord | undefined, betId: string | number) {
  if (!market) return undefined;
  return readBets(market.payload).find((bet) => String(readBetId(bet)) === String(betId));
}

export { newerOrEqual };
