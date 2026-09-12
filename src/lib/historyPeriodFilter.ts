export type HistoryPeriodKind = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

export interface HistoryPeriodSelection {
  kind: HistoryPeriodKind;
  from?: string;
  to?: string;
}

export type HistoryPeriodInput = HistoryPeriodSelection | 'all' | '30d';

export const HISTORY_PERIOD_PRESETS: { kind: Exclude<HistoryPeriodKind, 'custom'>; label: string }[] = [
  { kind: 'today', label: 'Сегодня' },
  { kind: 'yesterday', label: 'Вчера' },
  { kind: '7d', label: '7 дней' },
  { kind: '30d', label: '30 дней' },
  { kind: 'all', label: 'Всё время' },
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalIsoDate(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseLocalIsoDate(iso: string | undefined): { y: number; m: number; d: number } | null {
  const match = String(iso ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

export function startOfLocalDayIso(iso: string): number | null {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d, 0, 0, 0, 0).getTime();
}

export function endOfLocalDayIso(iso: string): number | null {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d, 23, 59, 59, 999).getTime();
}

export function addLocalDays(iso: string, days: number): string {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return iso;
  return toLocalIsoDate(new Date(parsed.y, parsed.m - 1, parsed.d + days));
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function normalizeHistoryPeriod(period: HistoryPeriodInput): HistoryPeriodSelection {
  if (period === 'all') return { kind: 'all' };
  if (period === '30d') return { kind: '30d' };
  return {
    kind: period.kind,
    from: period.from,
    to: period.to,
  };
}

export function historyPeriodRange(
  period: HistoryPeriodInput,
  now = Date.now(),
): { startMs: number; endMs: number } | null {
  const selection = normalizeHistoryPeriod(period);
  const todayIso = toLocalIsoDate(now);
  if (selection.kind === 'all') return null;
  if (selection.kind === 'today') {
    return { startMs: startOfLocalDayIso(todayIso)!, endMs: endOfLocalDayIso(todayIso)! };
  }
  if (selection.kind === 'yesterday') {
    const yesterday = addLocalDays(todayIso, -1);
    return { startMs: startOfLocalDayIso(yesterday)!, endMs: endOfLocalDayIso(yesterday)! };
  }
  if (selection.kind === '7d') {
    const from = addLocalDays(todayIso, -6);
    return { startMs: startOfLocalDayIso(from)!, endMs: endOfLocalDayIso(todayIso)! };
  }
  if (selection.kind === '30d') {
    const from = addLocalDays(todayIso, -29);
    return { startMs: startOfLocalDayIso(from)!, endMs: endOfLocalDayIso(todayIso)! };
  }
  const custom = validateCustomHistoryRange(selection.from, selection.to, now);
  if (!custom.ok) return { startMs: Number.NaN, endMs: Number.NaN };
  return { startMs: custom.startMs, endMs: custom.endMs };
}

export function validateCustomHistoryRange(
  from: string | undefined,
  to: string | undefined,
  now = Date.now(),
): { ok: true; startMs: number; endMs: number } | { ok: false; reason: 'missing' | 'invalid' | 'order' | 'future' } {
  if (!from || !to) return { ok: false, reason: 'missing' };
  const startMs = startOfLocalDayIso(from);
  const endMs = endOfLocalDayIso(to);
  if (startMs == null || endMs == null) return { ok: false, reason: 'invalid' };
  if (startMs > endMs) return { ok: false, reason: 'order' };
  const todayEnd = endOfLocalDayIso(toLocalIsoDate(now))!;
  if (startMs > todayEnd || endMs > todayEnd) return { ok: false, reason: 'future' };
  return { ok: true, startMs, endMs };
}

export function isSelectableHistoryDate(iso: string, now = Date.now()): boolean {
  if (!parseLocalIsoDate(iso)) return false;
  return compareIsoDates(iso, toLocalIsoDate(now)) <= 0;
}

export function historyPeriodLabel(period: HistoryPeriodInput): string {
  const selection = normalizeHistoryPeriod(period);
  const preset = HISTORY_PERIOD_PRESETS.find((item) => item.kind === selection.kind);
  if (preset) return preset.label;
  const from = parseLocalIsoDate(selection.from);
  const to = parseLocalIsoDate(selection.to);
  if (!from || !to) return 'Свой период';
  const fromLabel = `${pad2(from.d)}.${pad2(from.m)}`;
  const toLabel = `${pad2(to.d)}.${pad2(to.m)}`;
  if (from.y !== to.y) return `${fromLabel}.${String(from.y).slice(2)} — ${toLabel}.${String(to.y).slice(2)}`;
  return `${fromLabel} — ${toLabel}`;
}

export function formatHistoryDay(iso: string): string {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return '';
  return `${pad2(parsed.d)}.${pad2(parsed.m)}.${parsed.y}`;
}
