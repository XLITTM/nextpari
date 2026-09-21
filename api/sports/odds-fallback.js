export const DEFAULT_1X2 = {
  home_od: '2.10',
  draw_od: '3.25',
  away_od: '2.80',
};

function extraOf(row) {
  return row?.extra && typeof row.extra === 'object' && !Array.isArray(row.extra) ? row.extra : {};
}

function numericOdd(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : 0;
}

export function hasMainOdds(row) {
  if (!row || typeof row !== 'object') return false;
  const extra = extraOf(row);
  const home = numericOdd(row.home_od ?? extra.home_od ?? row.odd_home);
  const away = numericOdd(row.away_od ?? extra.away_od ?? row.odd_away);
  return home > 1 && away > 1;
}

export function ensureOdds(row) {
  return row;
}

export function ensureOddsList(results) {
  return Array.isArray(results) ? results : [];
}
