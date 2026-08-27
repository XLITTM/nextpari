import { calculateHandScore, drawCard, freshShuffledDeck, isBust, isGoldenOchko } from './deck';
import type { CardType, GameResult } from './types';

export const CHIP_VALUES = [1, 5, 10, 25, 50, 100] as const;
export const MIN_STAKE = 6;
export const DEALER_STANDS_AT = 17;
export const DEALER_DRAW_DELAY_MS = 600;

export interface TableState {
  deck: CardType[];
  playerHand: CardType[];
  dealerHand: CardType[];
}

export function dealInitialHands(deck: CardType[] = freshShuffledDeck()): TableState {
  let next = deck.length >= 10 ? deck : freshShuffledDeck();
  const playerHand: CardType[] = [];
  const dealerHand: CardType[] = [];

  let drawn = drawCard(next);
  playerHand.push(drawn.card);
  next = drawn.deck;

  drawn = drawCard(next);
  dealerHand.push(drawn.card);
  next = drawn.deck;

  drawn = drawCard(next);
  playerHand.push(drawn.card);
  next = drawn.deck;

  drawn = drawCard(next);
  dealerHand.push(drawn.card);
  next = drawn.deck;

  return { deck: next, playerHand, dealerHand };
}

export function hitHand(deck: CardType[], hand: CardType[]): { deck: CardType[]; hand: CardType[] } {
  const drawn = drawCard(deck);
  return { deck: drawn.deck, hand: [...hand, drawn.card] };
}

export function revealDealer(hand: CardType[]): CardType[] {
  return hand.map((card) => ({ ...card, isHidden: false }));
}

export function dealerShouldHit(hand: CardType[]): boolean {
  return calculateHandScore(hand) < DEALER_STANDS_AT;
}

export function resolveResult(playerHand: CardType[], dealerHand: CardType[]): GameResult {
  const player = playerHand.map((card) => ({ ...card, isHidden: false }));
  const dealer = dealerHand.map((card) => ({ ...card, isHidden: false }));
  const playerScore = calculateHandScore(player);
  const dealerScore = calculateHandScore(dealer);

  if (isGoldenOchko(player)) return 'golden';
  if (isBust(player) || playerScore > 21) return 'lose';
  if (isGoldenOchko(dealer)) return 'lose';
  if (isBust(dealer) || dealerScore > 21) return 'win';
  if (playerScore > dealerScore) return 'win';
  if (playerScore === dealerScore) return 'push';
  return 'lose';
}

export function payoutAmount(stake: number, result: GameResult): number {
  if (result === 'golden' || result === 'blackjack' || result === 'win') {
    return Number((stake * 2).toFixed(2));
  }
  if (result === 'push') return Number(stake.toFixed(2));
  return 0;
}

export function resultCopy(result: GameResult, bust: boolean): { title: string; subtitle: string } {
  if (result === 'golden') return { title: 'Золотое очко!', subtitle: 'Два туза — мгновенная победа' };
  if (result === 'blackjack' || result === 'win') return { title: 'Победа!', subtitle: 'Выплата 1:1' };
  if (result === 'push') return { title: 'Ничья', subtitle: 'Ставка возвращена' };
  if (bust) return { title: 'Перебор', subtitle: 'Проигрыш' };
  return { title: 'Проигрыш', subtitle: 'Банк забирает ставку' };
}
