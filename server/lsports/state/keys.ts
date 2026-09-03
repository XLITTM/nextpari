function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scalar(value: unknown): string | number | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function normalizeFixtureId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isInteger(Number(value))) {
    return Number(value);
  }
  return null;
}

export function normalizeMarketLine(value: unknown): string {
  const found = scalar(value);
  if (found == null) return '';
  return String(found);
}

function sharedBetLine(market: Record<string, unknown>, field: 'BaseLine' | 'Line'): string {
  const bets = Array.isArray(market.Bets) ? market.Bets : [];
  const lines = bets
    .map((bet) => normalizeMarketLine(asRecord(bet)?.[field]))
    .filter((line) => line !== '');
  if (lines.length === 0 || lines.length !== bets.length) return '';
  return lines.every((line) => line === lines[0]) ? lines[0] : '';
}

export function marketLineKey(market: unknown): string {
  const record = asRecord(market);
  if (!record) return '';
  return normalizeMarketLine(record.MainLine)
    || normalizeMarketLine(record.BaseLine)
    || normalizeMarketLine(record.Line)
    || sharedBetLine(record, 'BaseLine')
    || sharedBetLine(record, 'Line');
}

/**
 * Live GetFixtureMarkets / Type 3 football packs every line variant into one
 * Market.Id object. Home/away handicap Bet.Line values are opposite; Bet.BaseLine
 * is the same for the pair. Prefer BaseLine, then Bet.Line, then market-level line.
 */
export function selectionLineKey(bet: unknown, market?: unknown): string {
  const record = asRecord(bet);
  return normalizeMarketLine(record?.BaseLine)
    || normalizeMarketLine(record?.Line)
    || marketLineKey(market);
}

export function expandMarketLineGroups(
  market: unknown,
): Array<{ line: string; payload: Record<string, unknown> }> {
  const record = asRecord(market);
  if (!record) return [];
  const bets = Array.isArray(record.Bets)
    ? record.Bets
    : Array.isArray(record.bets)
      ? record.bets
      : [];
  if (bets.length === 0) {
    return [{ line: marketLineKey(record), payload: record }];
  }
  const groups = new Map<string, unknown[]>();
  for (const bet of bets) {
    const line = selectionLineKey(bet, record);
    const list = groups.get(line);
    if (list) list.push(bet);
    else groups.set(line, [bet]);
  }
  return [...groups.entries()].map(([line, groupBets]) => ({
    line,
    payload: { ...record, Bets: groupBets },
  }));
}

export function parseCanonicalMarketKey(
  value: unknown,
): { fixtureId: string; marketId: string; line: string } | null {
  const raw = String(value ?? '').trim();
  const first = raw.indexOf(':');
  const second = first >= 0 ? raw.indexOf(':', first + 1) : -1;
  if (first <= 0 || second < 0) return null;
  const fixtureId = raw.slice(0, first);
  const marketId = raw.slice(first + 1, second);
  if (!/^\d+$/.test(fixtureId) || !marketId) return null;
  return { fixtureId, marketId, line: raw.slice(second + 1) };
}

export function marketIdOf(market: unknown): string | number | null {
  const record = asRecord(market);
  return scalar(record?.Id) ?? scalar(record?.id);
}

export function canonicalMarketKey(fixtureId: number, market: unknown, line?: string): string {
  return `${fixtureId}:${String(marketIdOf(market) ?? '')}:${line ?? marketLineKey(market)}`;
}

export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function marketLastUpdate(market: unknown): string | null {
  const record = asRecord(market);
  if (!record) return null;
  const direct = scalar(record.LastUpdate) ?? scalar(record.lastUpdate);
  if (typeof direct === 'string') return direct;
  const bets = Array.isArray(record.Bets) ? record.Bets : [];
  let newest: { raw: string; ms: number } | null = null;
  for (const bet of bets) {
    const raw = scalar(asRecord(bet)?.LastUpdate);
    if (typeof raw !== 'string') continue;
    const ms = parseTimestamp(raw);
    if (ms == null) continue;
    if (!newest || ms > newest.ms) newest = { raw, ms };
  }
  return newest?.raw ?? null;
}
