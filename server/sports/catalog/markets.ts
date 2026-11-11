import { SportsCatalog } from './catalog.js';
import { identity, isId, isTimestamp, sourceKey, validSource } from './identity.js';
import type {
  CanonicalEvent, CanonicalMarket, CanonicalOdds, FeedPhase, MarketDefinition, MarketLine, MarketSnapshot, MarketState,
  ProviderEvent, ProviderMarket, ProviderMarketRule, ProviderSource, SelectionTarget,
} from './types.js';

export const STANDARD_MARKETS = [
  { id: '1x2', line: { kind: 'none' }, subject: 'event', selections: { kind: 'fixed', codes: ['home', 'draw', 'away'] } },
  { id: 'moneyline', line: { kind: 'none' }, subject: 'event', selections: { kind: 'fixed', codes: ['home', 'away'] } },
  { id: 'over_under', line: { kind: 'total' }, subject: 'event', selections: { kind: 'fixed', codes: ['over', 'under'] } },
  { id: 'asian_handicap', line: { kind: 'handicap', anchorRole: 'home' }, subject: 'event', selections: { kind: 'fixed', codes: ['home', 'away'] } },
] as const satisfies readonly MarketDefinition[];

function exactDecimal(value: string, invert: boolean): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const fraction = match[3]?.replace(/0+$/, '') ?? '';
  if (whole === '0' && fraction === '') return '0';
  const sign = (match[1] === '-') !== invert ? '-' : '';
  return sign + whole + (fraction ? '.' + fraction : '');
}

function lineFor(
  definition: MarketDefinition,
  rule: ProviderMarketRule,
  event: CanonicalEvent,
  input: string | undefined,
): MarketLine | null | undefined {
  if (definition.line.kind === 'none') return input === undefined ? null : undefined;
  if (typeof input !== 'string') return undefined;
  const raw = input.split(',');
  if (raw.length > 2) return undefined;
  const parts: string[] = [];
  for (const part of raw) {
    const value = exactDecimal(part, rule.handicapSign === 'invert');
    if (value === null || (definition.line.kind === 'total' && value.startsWith('-'))) return undefined;
    parts.push(value);
  }
  // Equal stake split components commute. Keep their precision and their split structure.
  parts.sort();
  if (definition.line.kind === 'total') return { kind: 'total', components: parts };
  const { anchorRole } = definition.line;
  const anchors = event.participants.filter(entry => entry.role === anchorRole);
  if (anchors.length !== 1) return undefined;
  return { kind: 'handicap', components: parts, anchorParticipantId: anchors[0].participantId };
}

function ruleKey(source: ProviderSource, bookmakerId: string, periodId: string, marketId: string): string {
  return identity(sourceKey(source), bookmakerId, periodId, marketId);
}

function selectionKey(selection: SelectionTarget): string {
  return selection.kind === 'code' ? identity('code', selection.code, selection.participantId ?? null) : identity('participant', selection.participantId);
}

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 1;
}

function validateRule(rule: ProviderMarketRule, definition: MarketDefinition): void {
  const handicap = definition.line.kind === 'handicap';
  if (handicap ? rule.handicapSign !== 'invert' && rule.handicapSign !== 'as-provided' : rule.handicapSign !== undefined) {
    throw new Error(`Invalid handicap sign mapping for ${rule.externalMarketId}`);
  }
  if (definition.selections.kind === 'event-participants') {
    if (rule.selectionCodes !== undefined) throw new Error('Participant markets must resolve exact participant aliases');
    return;
  }
  const mapping = Object.entries(rule.selectionCodes ?? {});
  const targets = new Set(mapping.map(([, target]) => target));
  if (mapping.some(([code]) => !isId(code)) || mapping.length !== definition.selections.codes.length
    || definition.selections.codes.some(code => !targets.has(code))) {
    throw new Error(`Expected a complete one-to-one selection mapping for ${rule.externalMarketId}`);
  }
}

type ProviderSelection = ProviderMarket['selections'][number];

function selectionsFor(definition: MarketDefinition, event: CanonicalEvent): SelectionTarget[] | null {
  if (definition.selections.kind === 'event-participants') {
    return event.participants.map(({ participantId }) => ({ kind: 'participant', participantId }));
  }
  const targets: SelectionTarget[] = [];
  for (const code of definition.selections.codes) {
    if (code === 'home' || code === 'away') {
      const side = event.participants.find(entry => entry.role === code);
      if (!side) return null;
      targets.push({ kind: 'code', code, participantId: side.participantId });
    } else {
      targets.push({ kind: 'code', code });
    }
  }
  return targets;
}

export type MarketResolution =
  | { readonly ok: true; readonly value: MarketSnapshot }
  | { readonly ok: false; readonly reason: 'unmapped-market' | 'wrong-sport' | 'invalid-line' | 'invalid-subject' | 'invalid-market' };

export class SportsMarketNormalizer {
  private readonly rules = new Map<string, { rule: ProviderMarketRule; definition: MarketDefinition }>();

  constructor(
    private readonly catalog: SportsCatalog,
    rules: readonly ProviderMarketRule[],
    additionalDefinitions: readonly MarketDefinition[] = [],
  ) {
    const definitions = new Map<string, MarketDefinition>();
    for (const definition of structuredClone([...STANDARD_MARKETS, ...additionalDefinitions])) {
      const { id, line, selections } = definition;
      if (!isId(id) || definitions.has(id)
        || (line.kind === 'handicap' && !isId(line.anchorRole))
        || (selections.kind === 'fixed' && (selections.codes.length === 0
          || !selections.codes.every(isId) || new Set(selections.codes).size !== selections.codes.length))) {
        throw new Error(`Invalid or duplicate market definition: ${id}`);
      }
      definitions.set(id, definition);
    }

    for (const rule of structuredClone(rules)) {
      const { source, bookmakerId, externalPeriodId, externalMarketId } = rule;
      const key = ruleKey(source, bookmakerId, externalPeriodId, externalMarketId);
      const definition = definitions.get(rule.marketDefinitionId);
      if (!definition || !catalog.get('period', rule.periodId) || !validSource(source)
        || ![bookmakerId, externalPeriodId, externalMarketId].every(isId) || this.rules.has(key)) {
        throw new Error(`Invalid or duplicate provider market rule: ${key}`);
      }
      validateRule(rule, definition);
      this.rules.set(key, { rule, definition });
    }
  }

  normalize(
    event: CanonicalEvent, origin: ProviderEvent, input: ProviderMarket, currentEventStatus: ProviderEvent['status'],
  ): MarketResolution {
    const { bookmakerId, externalMarketId, externalPeriodId, phase } = input;
    if (!['live', 'prematch'].includes(phase) || !['open', 'closed', 'suspended'].includes(input.status)) {
      return { ok: false, reason: 'invalid-market' };
    }
    const mapped = this.rules.get(ruleKey(origin.source, bookmakerId, externalPeriodId, externalMarketId));
    if (!mapped) return { ok: false, reason: 'unmapped-market' };
    const { rule, definition } = mapped;
    if (this.catalog.get('period', rule.periodId)?.sportId !== event.sportId) {
      return { ok: false, reason: 'wrong-sport' };
    }
    const line = lineFor(definition, rule, event, input.line);
    if (line === undefined) return { ok: false, reason: 'invalid-line' };
    const subjectId = this.subjectFor(definition, event, origin.source, input.subjectExternalId);
    if (subjectId === undefined) return { ok: false, reason: 'invalid-subject' };

    const lineKey = line?.kind === 'handicap'
      ? [line.kind, line.anchorParticipantId, line.components]
      : line && [line.kind, line.components];
    const market: CanonicalMarket = {
      id: identity('market', event.id, rule.periodId, definition.id, subjectId, lineKey),
      eventId: event.id,
      periodId: rule.periodId,
      definitionId: definition.id,
      subjectId,
      line,
    };
    const id = identity('market-offer', market.id, sourceKey(origin.source), bookmakerId);
    const targets = selectionsFor(definition, event);
    if (!targets) return { ok: false, reason: 'invalid-market' };
    const marketStatus = currentEventStatus === phase ? input.status : 'closed';
    const prices = marketStatus === 'open' ? this.pricesFor(targets, rule, origin.source, input.selections) : null;
    const state = marketStatus === 'open' && prices === null ? 'incomplete' : marketStatus;
    const odds: CanonicalOdds[] = targets.map(selection => {
      const key = selectionKey(selection);
      const selectionId = identity('selection', market.id, key);
      const row = prices?.get(key);
      return {
        id: identity('odds', id, key), selectionId, selection,
        sourceSelectionId: row?.externalId ?? null,
        sourceOddsId: row?.externalOddsId ?? null,
        price: row?.price ?? null,
      };
    });
    const updated = input.sourceUpdatedAtMs;
    return {
      ok: true,
      value: {
        id, market, source: origin.source, bookmakerId, providerEventId: origin.externalId,
        externalPeriodId, externalMarketId, phase, state, odds,
        sourceLine: input.line ?? null,
        sourceSubjectId: input.subjectExternalId ?? null,
        sourceUpdatedAtMs: isTimestamp(updated) && updated <= origin.receivedAtMs ? updated : null,
        receivedAtMs: origin.receivedAtMs,
      },
    };
  }

  private subjectFor(
    definition: MarketDefinition, event: CanonicalEvent, source: ProviderSource, externalId: string | undefined,
  ): string | null | undefined {
    if (definition.subject === 'event') return externalId === undefined ? null : undefined;
    if (externalId === undefined) return undefined;
    const resolved = this.catalog.resolve('participant', { source, externalId });
    if (!resolved.ok) return undefined;
    const { id } = resolved.value;
    if (event.eligibleSubjectIds?.includes(id) || event.participants.some(entry => entry.participantId === id)) return id;
    return undefined;
  }

  private pricesFor(
    targets: readonly SelectionTarget[], rule: ProviderMarketRule, source: ProviderSource, rows: ProviderMarket['selections'],
  ): Map<string, ProviderSelection> | null {
    if (targets.length === 0 || rows.length !== targets.length) return null;
    const expected = new Map(targets.map(target => [
      target.kind === 'code' ? target.code : target.participantId, target,
    ]));
    const seenIds = new Set<string>();
    const prices = new Map<string, ProviderSelection>();
    for (const row of rows) {
      if (!isId(row.externalId) || seenIds.has(row.externalId) || !validPrice(row.price)
        || (row.externalOddsId !== undefined && !isId(row.externalOddsId))) return null;
      seenIds.add(row.externalId);
      let targetId: string;
      if (rule.selectionCodes) {
        if (!isId(row.code) || !Object.hasOwn(rule.selectionCodes, row.code)) return null;
        targetId = rule.selectionCodes[row.code];
      } else {
        if (row.code !== undefined || !isId(row.participantExternalId)) return null;
        const participant = this.catalog.resolve('participant', { source, externalId: row.participantExternalId });
        if (!participant.ok) return null;
        targetId = participant.value.id;
      }
      const target = expected.get(targetId);
      if (!target) return null;
      if (target.kind === 'code' && row.participantExternalId !== undefined) {
        const participant = this.catalog.resolve('participant', { source, externalId: row.participantExternalId });
        if (!participant.ok || participant.value.id !== target.participantId) return null;
      }
      const key = selectionKey(target);
      if (prices.has(key)) return null;
      prices.set(key, row);
    }
    return prices;
  }
}

function observationTime(snapshot: MarketSnapshot): number {
  return snapshot.sourceUpdatedAtMs ?? snapshot.receivedAtMs;
}

function provenanceKey(snapshot: MarketSnapshot): string {
  return identity(snapshot.providerEventId, snapshot.externalPeriodId, snapshot.externalMarketId,
    snapshot.phase, snapshot.sourceUpdatedAtMs, snapshot.sourceLine, snapshot.sourceSubjectId);
}

export function latestMarketSnapshot(left: MarketSnapshot, right: MarketSnapshot): MarketSnapshot {
  if (left.id !== right.id) throw new Error('Cannot deduplicate different market offers');
  const delta = observationTime(left) - observationTime(right);
  if (delta !== 0) return delta > 0 ? left : right;
  const receiptDifference = left.receivedAtMs - right.receivedAtMs;
  const preferred = (receiptDifference || (provenanceKey(left) <= provenanceKey(right) ? -1 : 1)) < 0 ? left : right;
  const same = left.phase === right.phase && left.state === right.state
    && left.sourceUpdatedAtMs === right.sourceUpdatedAtMs
    && left.odds.length === right.odds.length
    && left.odds.every((odd, index) => {
      const other = right.odds[index];
      return odd.selectionId === other.selectionId && odd.price === other.price
        && odd.sourceSelectionId === other.sourceSelectionId && odd.sourceOddsId === other.sourceOddsId;
    });
  if (same) return preferred;
  return {
    ...preferred, state: 'conflict',
    odds: preferred.odds.map(odd => ({ ...odd, price: null, sourceSelectionId: null, sourceOddsId: null })),
  };
}

export type MarketAvailability = MarketState | 'stale';
export type MarketFreshness = Readonly<Record<FeedPhase, number>>;

export function marketAvailability(snapshot: MarketSnapshot, nowMs: number, freshness: MarketFreshness): MarketAvailability {
  if (snapshot.state !== 'open') return snapshot.state;
  const limit = freshness[snapshot.phase];
  const updated = snapshot.sourceUpdatedAtMs;
  if (!isTimestamp(nowMs) || !isTimestamp(limit) || updated === null
    || nowMs < snapshot.receivedAtMs || nowMs - updated > limit) return 'stale';
  return 'open';
}

export function selectableOdds(snapshot: MarketSnapshot, nowMs: number, freshness: MarketFreshness): readonly CanonicalOdds[] {
  return marketAvailability(snapshot, nowMs, freshness) === 'open' ? snapshot.odds : [];
}
