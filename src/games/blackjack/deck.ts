import type { CardType, Rank, Suit } from './types';

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const OCHKO_VALUE: Record<Rank, number> = {
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 2,
  Q: 3,
  K: 4,
  A: 11,
};

export function rankValue(rank: Rank): number {
  return OCHKO_VALUE[rank];
}

export function createDeck(): CardType[] {
  const deck: CardType[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: rankValue(rank) });
    }
  }
  return deck;
}

export function shuffleDeck<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i];
    const swap = next[j];
    if (current === undefined || swap === undefined) continue;
    next[i] = swap;
    next[j] = current;
  }
  return next;
}

/** Fisher–Yates shuffle of a 36-card ochko deck. */
export function shuffle(deck: CardType[]): CardType[] {
  return shuffleDeck(deck);
}

export function freshShuffledDeck(): CardType[] {
  return shuffleDeck(createDeck());
}

export function calculateHandScore(hand: CardType[]): number {
  return hand
    .filter((card) => !card.isHidden)
    .reduce((total, card) => total + card.value, 0);
}

export function isGoldenOchko(hand: CardType[]): boolean {
  const visible = hand.filter((card) => !card.isHidden);
  return visible.length === 2 && visible.every((card) => card.rank === 'A');
}

export function isNaturalOchko(hand: CardType[]): boolean {
  const visible = hand.filter((card) => !card.isHidden);
  return visible.length === 2 && calculateHandScore(visible) === 21;
}

export function isBust(hand: CardType[]): boolean {
  if (isGoldenOchko(hand)) return false;
  return calculateHandScore(hand) > 21;
}

export function drawCard(deck: CardType[], hidden = false): { card: CardType; deck: CardType[] } {
  const source = deck.length > 0 ? deck : freshShuffledDeck();
  const [raw, ...rest] = source;
  const fallback: CardType = { suit: '♠', rank: 'A', value: 11 };
  const card: CardType = { ...(raw ?? fallback), isHidden: hidden };
  return { card, deck: rest };
}
