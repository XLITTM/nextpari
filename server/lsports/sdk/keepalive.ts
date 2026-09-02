import { normalizeFixtureId } from '../state/keys.js';

/** Fixture LSports support asked us to prove inside Type 31 KeepAlive. */
export const LSPORTS_KEEPALIVE_PROBE_FIXTURE_ID = 20003734;
export const LSPORTS_KEEPALIVE_SAMPLE_LIMIT = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function idsFrom(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    const id = normalizeFixtureId(value);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function keepAliveRecord(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  const body = asRecord(root.Body) ?? asRecord(root.body);
  return asRecord(body?.KeepAlive)
    ?? asRecord(body?.keepAlive)
    ?? asRecord(root.KeepAlive)
    ?? asRecord(root.keepAlive)
    ?? asRecord(root.entity)
    ?? null;
}

export interface LsportsKeepAliveExtraction {
  fixtureIds: number[];
  hasKeepAliveObject: boolean;
}

/**
 * SDK KeepAlive uses keepAlive.activeEvents (Expose ActiveEvents).
 * Direct RMQ JSON uses Body.KeepAlive.ActiveEvents.
 */
export function extractKeepAliveActiveEvents(payload: unknown): LsportsKeepAliveExtraction {
  const keepAlive = keepAliveRecord(payload);
  if (!keepAlive) return { fixtureIds: [], hasKeepAliveObject: false };
  const fixtureIds = idsFrom(keepAlive.ActiveEvents ?? keepAlive.activeEvents);
  return { fixtureIds, hasKeepAliveObject: true };
}

export interface LsportsKeepAliveDiagnostics {
  lastType31At: number | null;
  activeEventCount: number;
  probeFixtureId: number;
  probeFixtureInKeepAlive: boolean | null;
  sampleFixtureIds: number[];
}

export function emptyKeepAliveDiagnostics(
  probeFixtureId = LSPORTS_KEEPALIVE_PROBE_FIXTURE_ID,
): LsportsKeepAliveDiagnostics {
  return {
    lastType31At: null,
    activeEventCount: 0,
    probeFixtureId,
    probeFixtureInKeepAlive: null,
    sampleFixtureIds: [],
  };
}

export function keepAliveDiagnosticsFromIds(
  fixtureIds: number[],
  lastType31At: number | null,
  probeFixtureId = LSPORTS_KEEPALIVE_PROBE_FIXTURE_ID,
): LsportsKeepAliveDiagnostics {
  return {
    lastType31At,
    activeEventCount: fixtureIds.length,
    probeFixtureId,
    probeFixtureInKeepAlive: lastType31At == null ? null : fixtureIds.includes(probeFixtureId),
    sampleFixtureIds: fixtureIds.slice(0, LSPORTS_KEEPALIVE_SAMPLE_LIMIT),
  };
}
