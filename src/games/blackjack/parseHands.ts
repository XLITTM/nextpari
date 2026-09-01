import type { CardType } from './types';

export const BLACKJACK_V2_MATH_VERSION = 'blackjack-v2-rtp875';
export const BLACKJACK_V3_MATH_VERSION = 'blackjack-v3-visible-dealer-rtp875';
export const BLACKJACK_V4_MATH_VERSION = 'blackjack-v4-visible-dealer-win2';

function parseCard(raw: unknown, forceFaceUp: boolean): CardType {
  const card = raw as { suit?: string; rank?: string; value?: number; isHidden?: boolean };
  return {
    suit: (card.suit ?? '♠') as CardType['suit'],
    rank: (card.rank ?? 'A') as CardType['rank'],
    value: Number(card.value ?? 11),
    isHidden: forceFaceUp ? false : card.isHidden === true,
  };
}

export function parsePlayerCards(value: unknown): CardType[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => parseCard(raw, false));
}

export function parseDealerCards(value: unknown, mathVersion: string | null | undefined): CardType[] {
  if (!Array.isArray(value)) return [];
  const revealHole =
    mathVersion === BLACKJACK_V3_MATH_VERSION || mathVersion === BLACKJACK_V4_MATH_VERSION;
  return value.map((raw) => parseCard(raw, revealHole));
}
