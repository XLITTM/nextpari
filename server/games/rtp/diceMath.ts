export const DICE_MATH_VERSION = 'dice-v2-rtp875';
export const DICE_WIN_PAYOUT = 1.72;
export const DICE_DRAW_PAYOUT = 1;

/** Two fair dice vs two fair dice. 6^4 = 1296 equally likely outcomes. */
export const DICE_WIN_COUNT = 575;
export const DICE_DRAW_COUNT = 146;
export const DICE_LOSS_COUNT = 575;
export const DICE_OUTCOME_TOTAL = 1296;

export function diceExactRtp(): { numerator: number; denominator: number; rtp: number; houseEdge: number } {
  const numerator = DICE_WIN_COUNT * 172 + DICE_DRAW_COUNT * 100;
  const denominator = DICE_OUTCOME_TOTAL * 100;
  return {
    numerator,
    denominator,
    rtp: numerator / denominator,
    houseEdge: 1 - numerator / denominator,
  };
}
