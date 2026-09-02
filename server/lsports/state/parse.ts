import { normalizeFixtureId } from './keys.js';
import type { LsportsHeaderMeta } from './types.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickNumber(record: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function pickString(record: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function readHeader(payload: unknown): LsportsHeaderMeta {
  const root = asRecord(payload);
  const header = asRecord(root?.Header) ?? asRecord(root?.header);
  return {
    type: pickNumber(header, ['Type', 'type', 'MessageType']),
    msgSeq: pickNumber(header, ['MsgSeq', 'msgSeq']),
    msgGuid: pickString(header, ['MsgGuid', 'msgGuid']),
    serverTimestamp: pickNumber(header, ['ServerTimestamp', 'serverTimestamp']),
    creationDate: pickString(header, ['CreationDate', 'creationDate']),
  };
}

export function readEvents(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const body = root?.Body ?? root?.body;
  if (Array.isArray(body)) {
    return body.map(asRecord).filter((entry): entry is Record<string, unknown> => entry != null);
  }
  const inner = asRecord(body);
  const events = inner?.Events ?? inner?.events;
  if (Array.isArray(events)) {
    return events.map(asRecord).filter((entry): entry is Record<string, unknown> => entry != null);
  }
  return [];
}

export function readFixtureId(event: Record<string, unknown>): number | null {
  return normalizeFixtureId(event.FixtureId ?? event.fixtureId);
}

export function readFixture(event: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(event.Fixture) ?? asRecord(event.fixture);
}

export function readLivescore(event: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(event.Livescore) ?? asRecord(event.livescore);
}

export function readMarkets(event: Record<string, unknown>): Record<string, unknown>[] {
  const markets = event.Markets ?? event.markets;
  if (!Array.isArray(markets)) return [];
  return markets.map(asRecord).filter((entry): entry is Record<string, unknown> => entry != null);
}

export function readBets(market: Record<string, unknown>): Record<string, unknown>[] {
  const bets = market.Bets ?? market.bets;
  if (!Array.isArray(bets)) return [];
  return bets.map(asRecord).filter((entry): entry is Record<string, unknown> => entry != null);
}

export function readBetId(bet: Record<string, unknown>): string | number | null {
  const value = bet.Id ?? bet.id;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

export function readActiveEvents(payload: unknown): number[] {
  const root = asRecord(payload);
  const body = asRecord(root?.Body) ?? asRecord(root?.body);
  const keepAlive = asRecord(body?.KeepAlive) ?? asRecord(body?.keepAlive);
  const raw = keepAlive?.ActiveEvents ?? keepAlive?.activeEvents;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => normalizeFixtureId(value))
    .filter((id): id is number => id != null);
}

export function mergeFixtureMetadata(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (incoming == null) return existing;
  if (existing == null) return { ...incoming };
  const next: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue;
    const previous = next[key];
    if (
      asRecord(value)
      && asRecord(previous)
    ) {
      next[key] = mergeFixtureMetadata(asRecord(previous), asRecord(value));
      continue;
    }
    next[key] = value;
  }
  return next;
}
