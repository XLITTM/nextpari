export const THEORETICAL_CONTROLLED_GAME_RTP = 0.875;

export const DEFAULT_REPORT_TIMEZONE = 'Asia/Ashgabat';

export const CONTROLLED_GAME_CODES = [
  'pharaoh',
  'dice',
  'blackjack',
  'crystal',
  'aviator',
] as const;

export const CANONICAL_GAME_CODES = [
  'pharaoh',
  'dice',
  'blackjack',
  'apples',
  'crystal',
  'aviator',
] as const;

export type CanonicalGameCode = (typeof CANONICAL_GAME_CODES)[number];

export const GAME_CATALOG_STATUSES = ['active', 'disabled', 'maintenance'] as const;

export const GAME_ROUND_STATES = ['open', 'settled', 'cancelled'] as const;

export const PLAYER_GAME_RPC = {
  start: 'player_game_start',
  action: 'player_game_action',
  get: 'player_game_get',
} as const;

export const PLAYER_GAME_PATHS = {
  start: '/api/player/games/start',
  action: (roundId: string) => `/api/player/games/${roundId}/action`,
  get: (roundId: string) => `/api/player/games/${roundId}`,
} as const;

export interface GameAdapterMeta {
  gameCode: CanonicalGameCode | string;
  displayName: string;
  engineType: 'instant' | 'stateful' | 'crash';
  startSettles: boolean;
  actions: string[];
}

/**
 * Registry metadata only. Financial rules live in PostgreSQL adapters.
 * Future Game #7: insert game_catalog + SQL adapter + this row + UI.
 */
export const GAME_ADAPTERS: GameAdapterMeta[] = [
  { gameCode: 'pharaoh', displayName: 'Pharaoh', engineType: 'instant', startSettles: true, actions: [] },
  { gameCode: 'dice', displayName: 'Dice', engineType: 'instant', startSettles: true, actions: [] },
  { gameCode: 'blackjack', displayName: 'Blackjack', engineType: 'stateful', startSettles: false, actions: ['hit', 'stand'] },
  { gameCode: 'apples', displayName: 'Apples', engineType: 'stateful', startSettles: false, actions: ['pick', 'cashout'] },
  { gameCode: 'crystal', displayName: 'Crystal', engineType: 'instant', startSettles: true, actions: [] },
  { gameCode: 'aviator', displayName: 'Aviator', engineType: 'crash', startSettles: false, actions: ['cashout'] },
];
