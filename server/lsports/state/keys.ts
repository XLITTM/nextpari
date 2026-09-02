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

export function marketIdOf(market: unknown): string | number | null {
  const record = asRecord(market);
  return scalar(record?.Id) ?? scalar(record?.id);
}

export function canonicalMarketKey(fixtureId: number, market: unknown): string {
  return `${fixtureId}:${String(marketIdOf(market) ?? '')}:${marketLineKey(market)}`;
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
