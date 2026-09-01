export const BLACKJACK_V2_MATH_VERSION = 'blackjack-v2-rtp875';
export const BLACKJACK_V3_MATH_VERSION = 'blackjack-v3-visible-dealer-rtp875';
export const BLACKJACK_V4_MATH_VERSION = 'blackjack-v4-visible-banker-ties-chase-win2';

export class BlackjackMathVersionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'BlackjackMathVersionError';
    this.code = code;
  }
}

function multipliersForVersion(mathVersion: string | null): { win: number; golden: number; push: number } {
  if (mathVersion == null || mathVersion === '') {
    throw new BlackjackMathVersionError('BLACKJACK_MATH_VERSION_MISSING');
  }
  if (mathVersion === BLACKJACK_V2_MATH_VERSION) {
    return { win: 1.84, golden: 2, push: 1 };
  }
  if (mathVersion === BLACKJACK_V3_MATH_VERSION) {
    return { win: 1.7, golden: 2, push: 1 };
  }
  if (mathVersion === BLACKJACK_V4_MATH_VERSION) {
    return { win: 2, golden: 2, push: 1 };
  }
  throw new BlackjackMathVersionError('BLACKJACK_MATH_VERSION_UNSUPPORTED');
}

/** Settlement table keyed by the round's own math_version, never live catalog. */
export function blackjackPayoutForVersion(
  stake: number,
  result: string,
  mathVersion: string | null,
): number {
  const table = multipliersForVersion(mathVersion);
  if (result === 'golden') return Number((stake * table.golden).toFixed(2));
  if (result === 'blackjack' || result === 'win') return Number((stake * table.win).toFixed(2));
  if (result === 'push') return Number((stake * table.push).toFixed(2));
  return 0;
}
