export const DICE_V2_MATH_VERSION = 'dice-v2-rtp875';
export const DICE_V3_MATH_VERSION = 'dice-v3-win2';

export class DiceMathVersionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'DiceMathVersionError';
    this.code = code;
  }
}

function winMultiplierForVersion(mathVersion: string | null): number {
  if (mathVersion == null || mathVersion === '') {
    throw new DiceMathVersionError('DICE_MATH_VERSION_MISSING');
  }
  if (mathVersion === DICE_V2_MATH_VERSION) return 1.72;
  if (mathVersion === DICE_V3_MATH_VERSION) return 2;
  throw new DiceMathVersionError('DICE_MATH_VERSION_UNSUPPORTED');
}

/** Settlement table keyed by the round's own math_version, never live catalog. */
export function dicePayoutForVersion(
  stake: number,
  outcome: string,
  mathVersion: string | null,
): number {
  if (outcome === 'win') {
    return Number((stake * winMultiplierForVersion(mathVersion)).toFixed(2));
  }
  if (outcome === 'draw') {
    winMultiplierForVersion(mathVersion);
    return Number((stake * 1).toFixed(2));
  }
  if (outcome === 'lose') {
    winMultiplierForVersion(mathVersion);
    return 0;
  }
  return 0;
}
