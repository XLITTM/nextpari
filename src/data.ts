import type { Sport, MatchEvent, CasinoGame, Transaction, Championship, CasinoCategory, EsportsDiscipline, BetHistoryEntry } from './types';
import { CASINO_COVERS } from './lib/casinoCovers';

export const teamLogoMap: Record<string, string> = {
  'Манчестер Сити': '/crest1.webp',
  'Арсенал': '/crest2.webp',
  'Лейкерс': '/crest3.webp',
  'Бостон': '/crest4.webp',
  'Алькарас': '/crest5.webp',
  'Синнер': '/crest6.webp',
  'Реал Мадрид': '/crest7.webp',
  'Барселона': '/crest8.webp',
  'Рейнджерс': '/crest9.webp',
  'Питтсбург': '/crest10.webp',
  'NaVi': '/crest1.webp',
  'Vitality': '/crest2.webp',
  'ПСЖ': '/crest3.webp',
  'Бавария': '/crest4.webp',
  'Интер': '/crest5.webp',
  'Милан': '/crest6.webp',
  'Боруссия Д': '/crest7.webp',
  'Лейпциг': '/crest8.webp',
  'ЦСКА': '/crest9.webp',
  'Реал': '/crest7.webp',
  'Швёнтек': '/crest10.webp',
  'Сабаленка': '/crest1.webp',
  'Махачев': '/crest2.webp',
  'Топурия': '/crest3.webp',
  'СКА': '/crest4.webp',
  'Динамо М': '/crest5.webp',
  'Team Spirit': '/crest6.webp',
  'Gaimin Gladiators': '/crest7.webp',
  'Natus Vincere': '/crest1.webp',
  '3DMAX': '/crest8.webp',
  'Tundra': '/crest9.webp',
  'BetBoom': '/crest10.webp',
  'T1': '/crest2.webp',
  'Gen.G': '/crest7.webp',
  'FaZe': '/crest3.webp',
  'G2': '/crest4.webp',
  'LGD': '/crest5.webp',
  'Sentinels': '/crest6.webp',
  'LOUD': '/crest9.webp',
};

export const sports: Sport[] = [
  { id: 'all', name: 'Все', icon: 'Grid', color: '#4ade80' },
  { id: 'football', name: 'Футбол', icon: 'Circle', color: '#4ade80' },
  { id: 'tennis', name: 'Теннис', icon: 'Circle', color: '#4ade80' },
  { id: 'basketball', name: 'Баскетбол', icon: 'Circle', color: '#4ade80' },
  { id: 'hockey', name: 'Хоккей', icon: 'Circle', color: '#4ade80' },
  { id: 'volleyball', name: 'Волейбол', icon: 'Circle', color: '#4ade80' },
  { id: 'esports', name: 'КиберСпорт', icon: 'Gamepad', color: '#4ade80' },
  { id: 'table-tennis', name: 'Настольный теннис', icon: 'Circle', color: '#4ade80' },
  { id: 'badminton', name: 'Бадминтон', icon: 'Circle', color: '#4ade80' },
  { id: 'baseball', name: 'Бейсбол', icon: 'Circle', color: '#4ade80' },
  { id: 'polo', name: 'Поло', icon: 'Circle', color: '#4ade80' },
  { id: 'cricket', name: 'Крикет', icon: 'Circle', color: '#4ade80' },
  { id: 'beach-volleyball', name: 'Пляжный волейбол', icon: 'Circle', color: '#4ade80' },
  { id: 'snooker', name: 'Снукер', icon: 'Circle', color: '#4ade80' },
  { id: 'futsal', name: 'Футзал', icon: 'Circle', color: '#4ade80' },
  { id: 'elections', name: 'Выборы США', icon: 'Circle', color: '#4ade80' },
  { id: 'pickleball', name: 'Пиклбол', icon: 'Circle', color: '#4ade80' },
  { id: 'fifa', name: 'FIFA', icon: 'Gamepad', color: '#4ade80' },
  { id: 'mk', name: 'Mortal Kombat', icon: 'Circle', color: '#4ade80' },
  { id: 'polybet', name: 'Polybet', icon: 'Circle', color: '#4ade80' },
  { id: 'ufc', name: 'UFC', icon: 'Circle', color: '#4ade80' },
  { id: 'filter', name: 'Фильтр', icon: 'Sliders', color: '#4ade80' },
];

export const liveMatches: MatchEvent[] = [];
export const upcomingMatches: MatchEvent[] = [];
export const allMatches: MatchEvent[] = [];
export function getMatchById(_id: string): MatchEvent | undefined {
  return undefined;
}

export const casinoGames: CasinoGame[] = [
  { id: 'c1', name: 'Sweet Bonanza', provider: 'Pragmatic Play', category: 'Слоты', rtp: '96.5%', hot: true, color: '#EC4899', cover: CASINO_COVERS.c1 },
  { id: 'c2', name: 'Gates of Olympus', provider: 'Pragmatic Play', category: 'Слоты', rtp: '96.5%', hot: true, color: '#8B5CF6', cover: CASINO_COVERS.c2 },
  { id: 'c3', name: 'Crazy Time', provider: 'Evolution', category: 'Live', rtp: '95.4%', hot: true, color: '#EF4444', cover: CASINO_COVERS.c3 },
  { id: 'c4', name: 'Aviator', provider: 'Nextpari Originals', category: 'Crash', rtp: '97.0%', hot: true, color: '#A855F7', cover: '/images/25910.png' },
  { id: 'apples', name: 'Apple of Fortune', provider: 'Nextpari Originals', category: 'Originals', rtp: '96.0%', hot: true, color: '#22C55E', cover: '/images/25924.png' },
  { id: 'crystal', name: 'Crystal', provider: 'Nextpari Originals', category: 'Originals', rtp: '96.0%', hot: true, color: '#22D3EE', cover: '/images/25953.png' },
  { id: 'dice', name: 'Dice', provider: 'Nextpari Originals', category: 'Originals', rtp: '97.0%', hot: true, color: '#32CD32', cover: '/images/26164.png' },
  { id: 'c5', name: 'Big Bass Bonanza', provider: 'Pragmatic Play', category: 'Слоты', rtp: '96.7%', color: '#0EA5E9', cover: CASINO_COVERS.c5 },
  { id: 'c6', name: 'Mega Moolah', provider: 'Microgaming', category: 'Jackpot', rtp: '88.1%', color: '#EAB308', cover: CASINO_COVERS.c6 },
  { id: 'c7', name: 'Lightning Roulette', provider: 'Evolution', category: 'Live', rtp: '97.3%', color: '#F97316', cover: CASINO_COVERS.c7 },
  { id: 'c8', name: 'JetX', provider: 'SmartSoft', category: 'Crash', rtp: '97.0%', new: true, color: '#3B82F6', cover: CASINO_COVERS.c8 },
  { id: 'c9', name: 'Wolf Gold', provider: 'Pragmatic Play', category: 'Слоты', rtp: '96.0%', color: '#D97706', cover: CASINO_COVERS.c9 },
  { id: 'c10', name: 'Book of Dead', provider: "Play'n GO", category: 'Слоты', rtp: '96.2%', color: '#7C3AED', cover: CASINO_COVERS.c10 },
  { id: 'c11', name: 'Plinko', provider: 'Spribe', category: 'Mini', rtp: '97.0%', new: true, color: '#14B8A6', cover: CASINO_COVERS.c11 },
  { id: 'c12', name: 'Monopoly Live', provider: 'Evolution', category: 'Live', rtp: '96.2%', color: '#0891B2', cover: CASINO_COVERS.c12 },
];

export const transactions: Transaction[] = [
  { id: 't1', type: 'deposit', title: 'Пополнение счёта', date: '10 авг, 14:32', amount: 5000, status: 'completed' },
  { id: 't2', type: 'bet', title: 'Ставка: Манчестер Сити — Арсенал', date: '10 авг, 14:15', amount: -1000, status: 'completed' },
  { id: 't3', type: 'win', title: 'Выигрыш: Реал — Барселона', date: '09 авг, 22:40', amount: 2450, status: 'completed' },
  { id: 't4', type: 'bet', title: 'Ставка: Лейкерс — Бостон', date: '09 авг, 20:00', amount: -500, status: 'completed' },
  { id: 't5', type: 'withdraw', title: 'Вывод средств', date: '08 авг, 16:20', amount: -3000, status: 'processing' },
  { id: 't6', type: 'deposit', title: 'Пополнение по карте', date: '07 авг, 10:05', amount: 2000, status: 'completed' },
  { id: 't7', type: 'bet', title: 'Ставка: Алькарас — Синнер', date: '06 авг, 19:30', amount: -800, status: 'failed' },
  { id: 't8', type: 'win', title: 'Выигрыш: ПСЖ — Бавария', date: '05 авг, 23:15', amount: 1750, status: 'completed' },
  { id: 't9', type: 'deposit', title: 'Пополнение: Apple Pay', date: '04 авг, 09:45', amount: 10000, status: 'completed' },
  { id: 't10', type: 'withdraw', title: 'Вывод на карту', date: '03 авг, 15:10', amount: -5000, status: 'completed' },
];

export const championships: Championship[] = [
  { id: 'ch1', name: 'Лига Конференций УЕФА', country: 'Европа', flagColor: '#1A4DA1', matchCount: 8 },
  { id: 'ch2', name: 'Суперкубок Греции', country: 'Греция', flagColor: '#0D5EAF', matchCount: 2 },
  { id: 'ch3', name: 'Кубок Либертадорес', country: 'Южная Америка', flagColor: '#EAB308', matchCount: 6 },
  { id: 'ch4', name: 'Про Лига Саудовской Аравии', country: 'Саудовская Аравия', flagColor: '#16A34A', matchCount: 5 },
  { id: 'ch5', name: 'Бундеслига 2', country: 'Германия', flagColor: '#DC052D', matchCount: 9 },
  { id: 'ch6', name: 'Сегунда', country: 'Испания', flagColor: '#AA151B', matchCount: 11 },
];

export const casinoCategories: CasinoCategory[] = [
  { id: 'cat1', name: 'Слоты', gradient: 'from-violet-500 to-purple-700' },
  { id: 'cat2', name: 'Лайв казино', gradient: 'from-red-500 to-rose-700' },
  { id: 'cat3', name: 'TV игры', gradient: 'from-blue-500 to-indigo-700' },
  { id: 'cat4', name: 'Бинго', gradient: 'from-brand-500 to-accent-700' },
];

export const esportsDisciplines: EsportsDiscipline[] = [
  { id: 'd1', name: 'CS 2', gradient: 'from-slate-600 to-slate-900' },
  { id: 'd2', name: 'Dota 2', gradient: 'from-red-600 to-red-900' },
  { id: 'd3', name: 'League of Legends', gradient: 'from-cyan-500 to-blue-800' },
  { id: 'd4', name: 'Valorant', gradient: 'from-pink-500 to-rose-800' },
];

export const esportsLiveMatches: MatchEvent[] = [];
export const esportsUpcomingMatches: MatchEvent[] = [];
export const allEsportsMatches: MatchEvent[] = [];

export const betHistory: BetHistoryEntry[] = [
  {
    id: 'bh1',
    type: 'express',
    events: [
      { matchLabel: 'Манчестер Сити — Арсенал', market: '1X2', outcome: 'П1', odds: 1.85, finalScore: '2:1' },
      { matchLabel: 'Реал — Барселона', market: '1X2', outcome: 'П2', odds: 2.10, finalScore: '1:3' },
      { matchLabel: 'ПСЖ — Бавария', market: 'Тотал', outcome: 'ТБ 2.5', odds: 1.72, finalScore: '3:1' },
    ],
    totalOdds: 6.68,
    amount: 500,
    payout: 3340,
    status: 'won',
    date: '12 авг, 18:30',
    ticketCode: '4829173',
  },
  {
    id: 'bh2',
    type: 'single',
    events: [
      { matchLabel: 'Лейкерс — Бостон', market: 'Победа матча', outcome: 'П1', odds: 1.90, finalScore: '102:108' },
    ],
    totalOdds: 1.90,
    amount: 1000,
    payout: 0,
    status: 'lost',
    date: '11 авг, 22:15',
  },
  {
    id: 'bh3',
    type: 'express',
    events: [
      { matchLabel: 'Ювентус — Милан', market: '1X2', outcome: '1X', odds: 1.55 },
      { matchLabel: 'Атлетико — Севилья', market: '1X2', outcome: 'П1', odds: 2.05 },
    ],
    totalOdds: 3.18,
    amount: 800,
    payout: 0,
    cashout: 580,
    status: 'in_progress',
    date: '12 авг, 20:00',
    ticketCode: '7193048',
  },
  {
    id: 'bh4',
    type: 'single',
    events: [
      { matchLabel: 'Алькарас — Синнер', market: 'Победа матча', outcome: 'П2', odds: 2.40, finalScore: '3:1' },
    ],
    totalOdds: 2.40,
    amount: 600,
    payout: 1440,
    status: 'won',
    date: '10 авг, 19:30',
  },
  {
    id: 'bh5',
    type: 'single',
    events: [
      { matchLabel: 'Челси — Ливерпуль', market: 'Тотал', outcome: 'ТМ 2.5', odds: 1.88, finalScore: '3:2' },
    ],
    totalOdds: 1.88,
    amount: 750,
    payout: 0,
    status: 'lost',
    date: '09 авг, 17:45',
  },
  {
    id: 'bh6',
    type: 'express',
    events: [
      { matchLabel: 'Барселона — Сельта', market: '1X2', outcome: 'П1', odds: 1.65 },
      { matchLabel: 'Интер — Рома', market: '1X2', outcome: 'П1', odds: 1.78 },
    ],
    totalOdds: 2.94,
    amount: 400,
    payout: 0,
    cashout: 340,
    status: 'in_progress',
    date: '12 авг, 21:30',
    ticketCode: '3051842',
  },
];
