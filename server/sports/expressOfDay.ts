import { randomUUID } from 'node:crypto';
import { pricesEqual, roundPrice } from './quote.js';
import { staffError } from '../staff/errors.js';

export const EXPRESS_STATUSES = ['draft', 'published', 'unpublished', 'archived'] as const;
export type ExpressStatus = (typeof EXPRESS_STATUSES)[number];

export interface ExpressSelectionInput {
  canonicalEventId: string;
  provider: string;
  feedType: string;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  selectionId: string;
  outcomeId: string;
  line?: string;
  oddsSnapshot: number;
  oddsSnapshotAt?: string;
  matchLabel: string;
  league: string;
  outcomeName: string;
}

export interface ExpressSelection extends ExpressSelectionInput {
  id: string;
  sortOrder: number;
  line: string;
  oddsSnapshotAt: string;
}

export interface ExpressOfDay {
  id: string;
  title: string;
  description: string;
  status: ExpressStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  combinedOdds: number | null;
  oddsComputedAt: string | null;
  creatorId: string;
  publisherId: string | null;
  createdAt: string;
  updatedAt: string;
  selections: ExpressSelection[];
}

export interface ExpressCatalogOutcome {
  selectionId: string;
  outcomeId: string;
  name: string;
  odds: number;
}

export interface ExpressCatalogMarket {
  marketId: string;
  marketKey: string;
  line: string;
  status: 'open' | 'suspended' | 'closed';
  outcomes: ExpressCatalogOutcome[];
}

export interface ExpressCatalogEvent {
  canonicalEventId: string;
  provider: string;
  feedType: string;
  fixtureId: string;
  matchLabel: string;
  league: string;
  sport: string;
  kickoffAt?: string;
  markets: ExpressCatalogMarket[];
}

export interface ExpressCatalogPort {
  search(query: string): Promise<ExpressCatalogEvent[]>;
  resolve(canonicalEventId: string): Promise<ExpressCatalogEvent | null>;
}

export interface ExpressAuditEvent {
  action: string;
  targetId: string;
  actorId: string;
  payload: Record<string, unknown>;
}

export interface ExpressStore {
  list(): Promise<ExpressOfDay[]>;
  get(id: string): Promise<ExpressOfDay | null>;
  save(row: ExpressOfDay): Promise<ExpressOfDay>;
}

export interface ExpressCouponIssue {
  selectionId: string;
  code: string;
  message: string;
}

export function combinedDecimalOdds(selections: ExpressSelectionInput[]): number {
  if (selections.length === 0) return 0;
  const product = selections.reduce((acc, row) => acc * row.oddsSnapshot, 1);
  return roundPrice(product);
}

export function selectionIdentity(row: ExpressSelectionInput): string {
  return [
    row.provider,
    row.fixtureId,
    row.feedType,
    row.marketId,
    row.marketKey,
    row.line ?? '',
    row.outcomeId,
  ].join(':');
}

export class MemoryExpressCatalog implements ExpressCatalogPort {
  constructor(private readonly events: ExpressCatalogEvent[] = []) {}

  async search(query: string): Promise<ExpressCatalogEvent[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...this.events];
    return this.events.filter((event) => {
      const hay = `${event.matchLabel} ${event.league} ${event.canonicalEventId} ${event.fixtureId}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  async resolve(canonicalEventId: string): Promise<ExpressCatalogEvent | null> {
    return this.events.find((event) => event.canonicalEventId === canonicalEventId) ?? null;
  }
}

export class MemoryExpressStore implements ExpressStore {
  private readonly rows = new Map<string, ExpressOfDay>();

  async list(): Promise<ExpressOfDay[]> {
    return [...this.rows.values()]
      .map(cloneExpress)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<ExpressOfDay | null> {
    const row = this.rows.get(id);
    return row ? cloneExpress(row) : null;
  }

  async save(row: ExpressOfDay): Promise<ExpressOfDay> {
    const stored = cloneExpress(row);
    this.rows.set(stored.id, stored);
    return cloneExpress(stored);
  }
}

export function publicPlayerExpress(row: ExpressOfDay, nowIso: string): ExpressOfDay | null {
  if (row.status !== 'published') return null;
  if (row.expiresAt && row.expiresAt <= nowIso) return null;
  return cloneExpress(row);
}

export function listPublishedExpresses(rows: ExpressOfDay[], nowIso: string): ExpressOfDay[] {
  return rows
    .map((row) => publicPlayerExpress(row, nowIso))
    .filter((row): row is ExpressOfDay => row != null);
}

export async function searchExpressEvents(
  catalog: ExpressCatalogPort,
  query: string,
): Promise<ExpressCatalogEvent[]> {
  return catalog.search(query.trim());
}

export function normalizeSelectionInput(
  raw: ExpressSelectionInput,
  sortOrder: number,
  nowIso: string,
): ExpressSelection {
  const odds = Number(raw.oddsSnapshot);
  if (!Number.isFinite(odds) || odds <= 1) throw staffError('EXPRESS_ODDS_INVALID', 400);
  const canonicalEventId = requireText(raw.canonicalEventId, 'EXPRESS_EVENT_REQUIRED');
  const provider = requireText(raw.provider, 'EXPRESS_PROVIDER_REQUIRED');
  const fixtureId = requireText(raw.fixtureId, 'EXPRESS_FIXTURE_REQUIRED');
  const marketId = requireText(raw.marketId, 'EXPRESS_MARKET_REQUIRED');
  const marketKey = requireText(raw.marketKey, 'EXPRESS_MARKET_REQUIRED');
  const selectionId = requireText(raw.selectionId, 'EXPRESS_SELECTION_REQUIRED');
  const outcomeId = requireText(raw.outcomeId, 'EXPRESS_OUTCOME_REQUIRED');
  return {
    id: randomUUID(),
    sortOrder,
    canonicalEventId,
    provider,
    feedType: requireText(raw.feedType, 'EXPRESS_FEED_TYPE_REQUIRED'),
    fixtureId,
    marketId,
    marketKey,
    selectionId,
    outcomeId,
    line: String(raw.line ?? ''),
    oddsSnapshot: roundPrice(odds),
    oddsSnapshotAt: raw.oddsSnapshotAt?.trim() || nowIso,
    matchLabel: requireText(raw.matchLabel, 'EXPRESS_MATCH_LABEL_REQUIRED'),
    league: requireText(raw.league, 'EXPRESS_LEAGUE_REQUIRED'),
    outcomeName: requireText(raw.outcomeName, 'EXPRESS_OUTCOME_NAME_REQUIRED'),
  };
}

export async function createExpressDraft(input: {
  title: string;
  description?: string;
  expiresAt?: string | null;
  selections?: ExpressSelectionInput[];
  creatorId: string;
  nowIso: string;
  catalog: ExpressCatalogPort;
}): Promise<ExpressOfDay> {
  const selections = await normalizeSelections(input.selections ?? [], input.nowIso, input.catalog, false);
  return {
    id: randomUUID(),
    title: requireText(input.title, 'EXPRESS_TITLE_REQUIRED'),
    description: String(input.description ?? '').trim(),
    status: 'draft',
    publishedAt: null,
    expiresAt: emptyToNull(input.expiresAt),
    combinedOdds: selections.length ? combinedDecimalOdds(selections) : null,
    oddsComputedAt: selections.length ? input.nowIso : null,
    creatorId: input.creatorId,
    publisherId: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    selections,
  };
}

export async function updateExpressDraft(
  current: ExpressOfDay,
  patch: {
    title?: string;
    description?: string;
    expiresAt?: string | null;
    selections?: ExpressSelectionInput[];
  },
  nowIso: string,
  catalog: ExpressCatalogPort,
): Promise<ExpressOfDay> {
  if (current.status === 'archived') throw staffError('EXPRESS_ARCHIVED', 409);
  const selections = patch.selections
    ? await normalizeSelections(patch.selections, nowIso, catalog, false)
    : current.selections.map((row, index) => ({ ...row, sortOrder: index }));
  return {
    ...current,
    title: patch.title == null ? current.title : requireText(patch.title, 'EXPRESS_TITLE_REQUIRED'),
    description: patch.description == null ? current.description : String(patch.description).trim(),
    expiresAt: patch.expiresAt === undefined ? current.expiresAt : emptyToNull(patch.expiresAt),
    combinedOdds: selections.length ? combinedDecimalOdds(selections) : null,
    oddsComputedAt: selections.length ? nowIso : null,
    updatedAt: nowIso,
    selections,
  };
}

export async function publishExpress(
  current: ExpressOfDay,
  publisherId: string,
  nowIso: string,
  catalog: ExpressCatalogPort,
): Promise<ExpressOfDay> {
  if (current.status === 'archived') throw staffError('EXPRESS_ARCHIVED', 409);
  const selections = await normalizeSelections(current.selections, nowIso, catalog, true);
  if (selections.length < 2) throw staffError('EXPRESS_REQUIRES_LEGS', 400);
  if (current.expiresAt && current.expiresAt <= nowIso) throw staffError('EXPRESS_EXPIRED', 409);
  return {
    ...current,
    status: 'published',
    publishedAt: nowIso,
    publisherId,
    combinedOdds: combinedDecimalOdds(selections),
    oddsComputedAt: nowIso,
    updatedAt: nowIso,
    selections,
  };
}

export function unpublishExpress(current: ExpressOfDay, nowIso: string): ExpressOfDay {
  if (current.status !== 'published') throw staffError('EXPRESS_NOT_PUBLISHED', 409);
  return { ...current, status: 'unpublished', updatedAt: nowIso };
}

export function archiveExpress(current: ExpressOfDay, nowIso: string): ExpressOfDay {
  return { ...current, status: 'archived', updatedAt: nowIso };
}

export function archiveExpiredExpresses(rows: ExpressOfDay[], nowIso: string): ExpressOfDay[] {
  return rows.map((row) => {
    if (row.status === 'archived') return row;
    if (row.expiresAt && row.expiresAt <= nowIso) return archiveExpress(row, nowIso);
    return row;
  });
}

export async function validateExpressSelections(
  selections: ExpressSelectionInput[],
  catalog: ExpressCatalogPort,
  strict: boolean,
): Promise<ExpressCouponIssue[]> {
  const issues: ExpressCouponIssue[] = [];
  const seenFixtures = new Set<string>();
  const seenIdentity = new Set<string>();
  for (const [index, selection] of selections.entries()) {
    const id = selection.selectionId || `index:${index}`;
    if (seenFixtures.has(selection.fixtureId)) {
      issues.push({ selectionId: id, code: 'EXPRESS_DUPLICATE_FIXTURE', message: 'Один матч нельзя добавить дважды.' });
    }
    seenFixtures.add(selection.fixtureId);
    const identity = selectionIdentity(selection);
    if (seenIdentity.has(identity)) {
      issues.push({ selectionId: id, code: 'EXPRESS_DUPLICATE_SELECTION', message: 'Исход уже добавлен.' });
    }
    seenIdentity.add(identity);
    const event = await catalog.resolve(selection.canonicalEventId);
    if (!event) {
      issues.push({ selectionId: id, code: 'EVENT_UNAVAILABLE', message: 'Событие недоступно в каталоге.' });
      continue;
    }
    if (event.provider !== selection.provider || event.fixtureId !== selection.fixtureId) {
      issues.push({ selectionId: id, code: 'EVENT_IDENTITY_MISMATCH', message: 'Каноническая ссылка события не совпадает.' });
      continue;
    }
    const market = event.markets.find((row) =>
      row.marketId === selection.marketId
      && row.marketKey === selection.marketKey
      && row.line === String(selection.line ?? ''),
    );
    if (!market) {
      issues.push({ selectionId: id, code: 'MARKET_UNAVAILABLE', message: 'Рынок недоступен.' });
      continue;
    }
    if (market.status !== 'open') {
      issues.push({
        selectionId: id,
        code: market.status === 'suspended' ? 'MARKET_SUSPENDED' : 'MARKET_CLOSED',
        message: market.status === 'suspended' ? 'Рынок приостановлен.' : 'Рынок закрыт.',
      });
      continue;
    }
    const outcome = market.outcomes.find((row) =>
      row.outcomeId === selection.outcomeId && row.selectionId === selection.selectionId,
    );
    if (!outcome) {
      issues.push({ selectionId: id, code: 'SELECTION_UNAVAILABLE', message: 'Исход недоступен.' });
      continue;
    }
    if (strict && !pricesEqual(outcome.odds, selection.oddsSnapshot)) {
      issues.push({ selectionId: id, code: 'ODDS_CHANGED', message: 'Коэффициент изменился.' });
    }
  }
  return issues;
}

export async function revalidateExpressForCoupon(
  express: ExpressOfDay,
  catalog: ExpressCatalogPort,
  nowIso: string,
): Promise<{ ok: true; combinedOdds: number } | { ok: false; issues: ExpressCouponIssue[] }> {
  if (express.status !== 'published') {
    return { ok: false, issues: [{ selectionId: express.id, code: 'EXPRESS_NOT_PUBLISHED', message: 'Экспресс не опубликован.' }] };
  }
  if (express.expiresAt && express.expiresAt <= nowIso) {
    return { ok: false, issues: [{ selectionId: express.id, code: 'EXPRESS_EXPIRED', message: 'Срок экспресса истёк.' }] };
  }
  const issues = await validateExpressSelections(express.selections, catalog, true);
  if (issues.length) return { ok: false, issues };
  return { ok: true, combinedOdds: combinedDecimalOdds(express.selections) };
}

function requireText(value: unknown, code: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw staffError(code, 400);
  return text;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text ? text : null;
}

async function normalizeSelections(
  rows: ExpressSelectionInput[],
  nowIso: string,
  catalog: ExpressCatalogPort,
  strict: boolean,
): Promise<ExpressSelection[]> {
  const selections = rows.map((row, index) => normalizeSelectionInput(row, index, nowIso));
  const issues = await validateExpressSelections(selections, catalog, strict);
  if (strict && issues.length) {
    throw staffError(issues[0].code, issues[0].code === 'ODDS_CHANGED' ? 409 : 400, {
      issues,
    });
  }
  if (!strict && issues.some((issue) => issue.code === 'EXPRESS_DUPLICATE_FIXTURE' || issue.code === 'EXPRESS_DUPLICATE_SELECTION')) {
    throw staffError(issues[0].code, 400, { issues });
  }
  return selections;
}

function cloneExpress(row: ExpressOfDay): ExpressOfDay {
  return {
    ...row,
    selections: row.selections.map((selection) => ({ ...selection })),
  };
}
