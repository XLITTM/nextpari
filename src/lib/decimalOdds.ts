const LOCKED = new Set(['', '-', '0', '0.00', 'sp', 'susp', 'suspended', 'lock', 'locked', 'off']);

export function roundOdds(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 0;
  return Math.round(Math.min(value, 101) * 1000) / 1000;
}

export function toDecimalOdds(value: unknown): number {
  if (value == null || typeof value === 'boolean') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return 0;
    if (value <= -100) return roundOdds(1 + 100 / Math.abs(value));
    if (value >= 100) return roundOdds(1 + value / 100);
    if (value > 1) return roundOdds(value);
    return 0;
  }

  const text = String(value).trim();
  if (!text || LOCKED.has(text.toLowerCase())) return 0;
  if (/^[+-]\d+(?:\.\d+)?$/.test(text)) {
    const american = Number(text);
    if (american <= -100) return roundOdds(1 + 100 / Math.abs(american));
    if (american >= 100) return roundOdds(1 + american / 100);
  }
  if (text.includes('/')) {
    const [left, right] = text.split('/').map((part) => Number(part.replace(',', '.')));
    if (right) return roundOdds(left / right + 1);
  }

  const numeric = Number(text.replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  if (numeric <= -100) return roundOdds(1 + 100 / Math.abs(numeric));
  if (numeric >= 100 && numeric <= 10000) return roundOdds(1 + numeric / 100);
  if (numeric > 1) return roundOdds(numeric);
  return 0;
}
