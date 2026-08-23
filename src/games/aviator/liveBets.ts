export interface LiveBetRow {
  id: string;
  name: string;
  color: string;
  initial: string;
  stake: number;
  target: number | null;
  cashedAt: number | null;
  payout: number;
  isMe: boolean;
}

export interface MyBetRecord {
  id: string;
  at: number;
  stake: number;
  multiplier: number;
  result: 'win' | 'loss';
  payout: number;
}

const BOT_NAMES = [
  'alex***',
  'crypto_king',
  'user_882',
  'nurs***',
  'pilot_07',
  'maks***',
  'diana_x',
  'turbo_tm',
  'shadow99',
  'ari***',
  'betlord',
  'luna_22',
  'vk_4401',
  'sultan',
  'neo_cash',
  'irina***',
  'flyhigh',
  'qwerty7',
  'timur_k',
  'goldwing',
  'roma***',
  'nightowl',
  'aziz***',
  'spark_88',
  'cashflow',
  'vera_n',
  'hawk_13',
  'mobi***',
  'pari_pro',
  'skyline',
];

const COLORS = ['#ef4444', '#22c55e', '#38bdf8', '#a78bfa', '#f59e0b', '#fb7185', '#2dd4bf', '#60a5fa'];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomStake(): number {
  const pool = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 350];
  return pick(pool);
}

function randomTarget(): number | null {
  if (Math.random() < 0.18) return null;
  const roll = Math.random();
  if (roll < 0.45) return Number((1.2 + Math.random() * 0.9).toFixed(2));
  if (roll < 0.8) return Number((2.1 + Math.random() * 3).toFixed(2));
  return Number((5 + Math.random() * 12).toFixed(2));
}

export function createBotField(count = 42): LiveBetRow[] {
  const used = new Set<string>();
  const rows: LiveBetRow[] = [];
  while (rows.length < count) {
    const name = pick(BOT_NAMES);
    const key = `${name}-${rows.length}`;
    if (used.has(name) && Math.random() < 0.6) continue;
    used.add(name);
    const color = pick(COLORS);
    rows.push({
      id: key,
      name,
      color,
      initial: name.replace(/[^a-zа-я]/gi, '').slice(0, 1).toUpperCase() || 'U',
      stake: randomStake(),
      target: randomTarget(),
      cashedAt: null,
      payout: 0,
      isMe: false,
    });
  }
  return rows;
}

export function playerLiveRow(panelIndex: number, stake: number): LiveBetRow {
  return {
    id: `me-${panelIndex}`,
    name: panelIndex === 0 ? 'you***' : 'you***_2',
    color: '#22c55e',
    initial: 'Y',
    stake,
    target: null,
    cashedAt: null,
    payout: 0,
    isMe: true,
  };
}

export function applyCashouts(rows: LiveBetRow[], multiplier: number, crashPoint: number): LiveBetRow[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.isMe || row.cashedAt != null || row.target == null) return row;
    if (multiplier >= row.target && row.target < crashPoint) {
      changed = true;
      return {
        ...row,
        cashedAt: row.target,
        payout: Number((row.stake * row.target).toFixed(2)),
      };
    }
    return row;
  });
  return changed ? next : rows;
}

export function roundBank(rows: LiveBetRow[]): number {
  return rows.reduce((sum, row) => sum + row.stake, 0);
}
