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
  if (!row || typeof row !== 'object') return row;
  const extra = extraOf(row);
  const home = numericOdd(row.home_od ?? extra.home_od ?? row.odd_home);
  const draw = numericOdd(row.draw_od ?? extra.draw_od ?? row.odd_draw);
  const away = numericOdd(row.away_od ?? extra.away_od ?? row.odd_away);
  return {
    ...row,
    home_od: home > 1 ? String(row.home_od ?? extra.home_od ?? home) : DEFAULT_1X2.home_od,
    draw_od: draw > 1 ? String(row.draw_od ?? extra.draw_od ?? draw) : DEFAULT_1X2.draw_od,
    away_od: away > 1 ? String(row.away_od ?? extra.away_od ?? away) : DEFAULT_1X2.away_od,
  };
}

export function ensureOddsList(results) {
  return (Array.isArray(results) ? results : []).map(ensureOdds);
}
