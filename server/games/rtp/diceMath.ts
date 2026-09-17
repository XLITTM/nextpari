export const DICE_V2_MATH_VERSION = 'dice-v2-rtp875';
export const DICE_V2_WIN_PAYOUT = 1.72;
export const DICE_V3_MATH_VERSION = 'dice-v3-win2';
export const DICE_V3_WIN_PAYOUT = 2;
export const DICE_MATH_VERSION = 'dice-v4-house-edge';
export const DICE_WIN_PAYOUT = 1.96;
export const DICE_DRAW_PAYOUT = 1;
export const DICE_V3_EXACT_RTP = 1;
export const DICE_V3_HOUSE_EDGE = 0;
export const DICE_V4_RTP_NUMERATOR = 1273;
export const DICE_V4_RTP_DENOMINATOR = 1296;
export const DICE_V4_EXACT_RTP = DICE_V4_RTP_NUMERATOR / DICE_V4_RTP_DENOMINATOR;
export const DICE_V4_HOUSE_EDGE = 1 - DICE_V4_EXACT_RTP;

/** Two fair dice vs two fair dice. 6^4 = 1296 equally likely outcomes. */
export const DICE_WIN_COUNT = 575;
export const DICE_DRAW_COUNT = 146;
export const DICE_LOSS_COUNT = 575;
export const DICE_OUTCOME_TOTAL = 1296;

export function diceExactRtp(winPayout = DICE_WIN_PAYOUT): {
  numerator: number;
  denominator: number;
  rtp: number;
  houseEdge: number;
} {
  const winCents = Math.round(winPayout * 100);
  const numerator = DICE_WIN_COUNT * winCents + DICE_DRAW_COUNT * 100;
  const denominator = DICE_OUTCOME_TOTAL * 100;
  return {
    numerator,
    denominator,
    rtp: numerator / denominator,
    houseEdge: 1 - numerator / denominator,
  };
}
