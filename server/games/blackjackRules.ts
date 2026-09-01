import {
  BLACKJACK_V2_MATH_VERSION,
  BLACKJACK_V3_MATH_VERSION,
  BLACKJACK_V4_MATH_VERSION,
  BlackjackMathVersionError,
} from './blackjackPayout.js';

export type BlackjackTieRule = 'push' | 'banker';
export type BlackjackDealerRule = 'stand17' | 'chasePlayer';

function requireMathVersion(mathVersion: string | null): string {
  if (mathVersion == null || mathVersion === '') {
    throw new BlackjackMathVersionError('BLACKJACK_MATH_VERSION_MISSING');
  }
  if (
    mathVersion === BLACKJACK_V2_MATH_VERSION
    || mathVersion === BLACKJACK_V3_MATH_VERSION
    || mathVersion === BLACKJACK_V4_MATH_VERSION
  ) {
    return mathVersion;
  }
  throw new BlackjackMathVersionError('BLACKJACK_MATH_VERSION_UNSUPPORTED');
}

export function blackjackRulesForVersion(mathVersion: string | null): {
  tieRule: BlackjackTieRule;
  dealerRule: BlackjackDealerRule;
} {
  const version = requireMathVersion(mathVersion);
  if (version === BLACKJACK_V4_MATH_VERSION) {
    return { tieRule: 'banker', dealerRule: 'chasePlayer' };
  }
  return { tieRule: 'push', dealerRule: 'stand17' };
}

/** Version-keyed dealer draw. v2/v3 never inherit v4 chase. */
export function blackjackDealerShouldDraw(
  dealerTotal: number,
  playerTotal: number,
  mathVersion: string | null,
): boolean {
  const rules = blackjackRulesForVersion(mathVersion);
  if (dealerTotal >= 21) return false;
  if (rules.dealerRule === 'chasePlayer') {
    return dealerTotal < Math.max(17, playerTotal);
  }
  return dealerTotal < 17;
}

export function blackjackResolveForVersion(
  playerScore: number,
  dealerScore: number,
  mathVersion: string | null,
  options: { playerGolden?: boolean; dealerGolden?: boolean } = {},
): 'golden' | 'win' | 'push' | 'lose' {
  const rules = blackjackRulesForVersion(mathVersion);
  if (options.playerGolden) return 'golden';
  if (playerScore > 21) return 'lose';
  if (options.dealerGolden) return 'lose';
  if (dealerScore > 21) return 'win';
  if (playerScore > dealerScore) return 'win';
  if (playerScore === dealerScore) return rules.tieRule === 'banker' ? 'lose' : 'push';
  return 'lose';
}
