export type SportId =
  | 'all'
  | 'football'
  | 'tennis'
  | 'basketball'
  | 'hockey'
  | 'volleyball'
  | 'esports'
  | 'table-tennis'
  | 'badminton'
  | 'baseball'
  | 'polo'
  | 'cricket'
  | 'beach-volleyball'
  | 'snooker'
  | 'futsal'
  | 'elections'
  | 'pickleball'
  | 'fifa'
  | 'mk'
  | 'polybet'
  | 'ufc'
  | 'mma'
  | 'filter';

export interface Sport {
  id: SportId;
  name: string;
  icon: string;
  color: string;
}

export interface MarketOutcome {
  label: string;
  odds: number;
}

export type MarketCategory =
  | 'main'
  | '1st-half'
  | '2nd-half'
  | 'corners'
  | 'cards'
  | 'fouls'
  | 'shots'
  | 'offsides'
  | 'players'
  | 'statistics'
  | 'throw-ins'
  | 'totals'
  | 'handicaps'
  | 'combo'
  | 'intervals';

export type MarketLayout = 'grid' | 'table' | 'combo';

export interface MarketGroup {
  id: string;
  name: string;
  outcomes: MarketOutcome[];
  category?: MarketCategory;
  layout?: MarketLayout;
}

export interface MatchStat {
  label: string;
  team1: string | number;
  team2: string | number;
}

export interface H2HGame {
  date: string;
  result: string;
  score: string;
}

export interface MatchEvent {
  id: string;
  sport: SportId;
  league: string;
  leagueId?: string;
  country: string;
  team1: string;
  team2: string;
  team1Color: string;
  team2Color: string;
  team1Logo?: string;
  team2Logo?: string;
  startTime: number;
  isLive: boolean;
  liveStatus?: string;
  liveScore?: { team1: number; team2: number };
  markets: { '1': number; x: number; '2': number };
  extraMarkets: number;
  featured?: boolean;
  marketGroups?: MarketGroup[];
  marketsLocked?: boolean;
  marketsEstimated?: boolean;
  feedTag?: 'lsports';
  stats?: MatchStat[];
  h2h?: H2HGame[];
  stadium?: { name: string; city: string; capacity: string };
  hasStream?: boolean;
}

export interface Championship {
  id: string;
  name: string;
  country: string;
  flagColor: string;
  matchCount: number;
}

export interface CasinoCategory {
  id: string;
  name: string;
  gradient: string;
}

export interface EsportsDiscipline {
  id: string;
  name: string;
  gradient: string;
}

export interface CasinoGame {
  id: string;
  name: string;
  provider: string;
  category: string;
  rtp: string;
  hot?: boolean;
  new?: boolean;
  color: string;
  cover?: string;
}

export interface BetSelection {
  id: string;
  matchId: string;
  matchLabel: string;
  market: string;
  outcome: string;
  odds: number;
  marketKey?: string;
  selectionKey?: string;
  homeTeam?: string;
  awayTeam?: string;
  sport?: SportId;
  country?: string;
  league?: string;
  tournament?: string;
  isLive?: boolean;
  startTime?: number;
  liveStatus?: string;
  provider?: 'lsports' | 'betsapi';
  feedType?: 'inplay' | 'prematch';
  fixtureId?: string;
  marketId?: string;
  line?: string;
  outcomeId?: string;
  providerLastUpdate?: string;
  marketStatus?: string;
  betStatus?: string;
  betStatusId?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'bet' | 'win';
  title: string;
  date: string;
  amount: number;
  status: 'completed' | 'processing' | 'failed';
}

export type BetStatus = 'won' | 'lost' | 'in_progress' | 'pending';

export interface BetEvent {
  matchId?: string;
  matchLabel: string;
  market: string;
  outcome: string;
  selection?: string;
  odds: number;
  homeTeam?: string;
  awayTeam?: string;
  sport?: SportId;
  country?: string;
  league?: string;
  tournament?: string;
  isLive?: boolean;
  liveStatus?: string;
  matchStatus?: string;
  finalScore?: string;
}

export interface BetHistoryEntry {
  id: string;
  type: 'single' | 'express';
  events: BetEvent[];
  totalOdds: number;
  amount: number;
  payout: number;
  cashout?: number;
  status: BetStatus;
  date: string;
  ticketCode?: string;
}

export type WithdrawalMethod = 'card' | 'crypto' | 'ewallet' | 'cash';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface WithdrawalRequest {
  id: string;
  method: WithdrawalMethod;
  method_label: string;
  amount: number;
  status: WithdrawalStatus;
  rejection_reason: string | null;
  created_at: string;
  pin_code?: string | null;
  city?: string | null;
  point?: string | null;
  player_id?: string | null;
}

export interface PersonalData {
  first_name: string;
  last_name: string;
  middle_name: string;
  birth_date: string;
  phone: string;
  phone_verified: boolean;
  email: string;
  email_verified: boolean;
  passport: string;
}

export type MainTab = 'top' | 'sport' | 'esports' | 'casino' | 'games';
export type NavTab = 'home' | 'favorites' | 'betslip' | 'history' | 'menu';
export type Screen =
  | { name: 'home' }
  | { name: 'match'; matchId: string }
  | { name: 'betslip' }
  | { name: 'favorites' }
  | { name: 'history' }
  | { name: 'bet-details'; betId: string }
  | { name: 'menu' }
  | { name: 'wallet' }
  | { name: 'promo' }
  | { name: 'personal-data' }
  | { name: 'gamelist'; mode: 'live' | 'line' }
  | { name: 'sports'; mode: 'live' | 'line' | 'cybers' }
  | { name: 'championships'; sport: string; mode: 'live' | 'line' }
  | { name: 'slots' }
  | { name: 'live-casino' }
  | { name: 'games' }
  | { name: 'promo-details' }
  | { name: 'promo-marathon' }
  | { name: 'promo-welcome' }
  | { name: 'settings' }
  | { name: 'info' }
  | { name: 'promo-unbeatable' }
  | { name: 'blackjack' }
  | { name: 'aviator' }
  | { name: 'apples' }
  | { name: 'crystal' }
  | { name: 'dice' }
  | { name: 'pharaoh' }
  | { name: 'vip-cashback' }
  | { name: 'league'; leagueId: string };