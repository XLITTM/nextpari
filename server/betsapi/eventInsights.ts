import type { EventInsights } from './types.js';

const STAT_LABELS: Readonly<Record<string, string>> = {
  attacks: 'Атаки',
  dangerous_attacks: 'Опасные атаки',
  possession_rt: 'Владение',
  on_target: 'Удары в створ',
  off_target: 'Удары мимо',
  corners: 'Угловые',
  yellowcards: 'Жёлтые карточки',
  redcards: 'Красные карточки',
  goals: 'Голы',
  substitutions: 'Замены',
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pair(value: unknown): { home: number; away: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (!/^\d{1,3}$/.test(String(value[0])) || !/^\d{1,3}$/.test(String(value[1]))) return null;
  return { home: Number(value[0]), away: Number(value[1]) };
}

function viewRow(payload: unknown): Record<string, unknown> | null {
  const root = record(payload);
  if (!root) return null;
  const results = root.results ?? root;
  if (Array.isArray(results)) return record(results[0]);
  return record(results);
}

export function readEventInsights(payload: unknown, observedAtMs = Date.now()): EventInsights | null {
  const row = viewRow(payload);
  if (!row) return null;
  const stats = record(row.stats);
  const statistics = Object.entries(STAT_LABELS).flatMap(([key, label]) => {
    const sides = pair(stats?.[key]);
    return sides ? [{ key, label, ...sides }] : [];
  });
  const timeline = (Array.isArray(row.events) ? row.events : []).flatMap((item) => {
    const entry = record(item);
    const id = String(entry?.id ?? '').trim();
    const text = String(entry?.text ?? '').trim();
    if (!id || !text || text.length > 180) return [];
    return [{ id, text }];
  }).slice(0, 40);
  const scores = record(row.scores);
  const periodScores = Object.entries(scores ?? {}).flatMap(([period, value]) => {
    const sides = record(value);
    if (!/^\d+$/.test(period) || !sides) return [];
    const home = String(sides.home ?? '');
    const away = String(sides.away ?? '');
    if (!/^\d{1,2}$/.test(home) || !/^\d{1,2}$/.test(away)) return [];
    return [{ period, home: Number(home), away: Number(away) }];
  });
  return {
    source: 'betsapi',
    observedAt: new Date(observedAtMs).toISOString(),
    statistics,
    timeline,
    periodScores,
    availability: {
      statistics: statistics.length ? 'available' : 'absent',
      timeline: timeline.length ? 'available' : 'absent',
      headToHead: 'absent',
      previousMatches: 'absent',
    },
  };
}
