export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

export function readName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readNamed(value: unknown): { id?: string; name?: string } {
  const record = asRecord(value);
  if (!record) return {};
  return {
    id: readId(record.Id ?? record.id),
    name: readName(record.Name ?? record.name),
  };
}

export function readPosition(value: unknown): string {
  return String(value ?? '').trim();
}

export function toUnixStartTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(value > 1e12 ? Math.floor(value / 1000) : Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value.trim())) return toUnixStartTime(Number(value.trim()));
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return String(Math.floor(ms / 1000));
  }
  return '';
}

export function formatClockSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function toDecimalPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return Math.round(value * 1000) / 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(numeric) && numeric > 1) return Math.round(numeric * 1000) / 1000;
  }
  return null;
}
