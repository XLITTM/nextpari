export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface CardType {
  suit: Suit;
  rank: Rank;
  value: number;
  isHidden?: boolean;
}

export type GameStage = 'betting' | 'playerTurn' | 'dealerTurn' | 'gameOver';
export type GameResult = 'win' | 'lose' | 'push' | 'blackjack' | 'golden' | null;
