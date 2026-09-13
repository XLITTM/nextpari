export interface SportsAcceptanceSettings {
  sportsBettingEnabled: boolean;
  maxStake: number | null;
  maxPotentialPayout: number | null;
  maxExpressLegs: number | null;
}

export const UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS: SportsAcceptanceSettings = {
  sportsBettingEnabled: true,
  maxStake: null,
  maxPotentialPayout: null,
  maxExpressLegs: null,
};

export function potentialPayoutFromAcceptedOdds(stake: number, acceptedOdds: number[]): number {
  const combined = acceptedOdds.reduce((product, price) => product * price, 1);
  return Math.round((stake * combined + Number.EPSILON) * 100) / 100;
}

export function evaluateSportsAcceptanceGuardrails(
  input: { stake: number; mode: 'single' | 'express'; legCount: number; potentialPayout: number },
  settings: SportsAcceptanceSettings = UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS,
): { ok: true } | { ok: false; code: string } {
  if (settings.sportsBettingEnabled === false) {
    return { ok: false, code: 'SPORTS_BET_DISABLED' };
  }
  if (settings.maxStake != null && input.stake > settings.maxStake) {
    return { ok: false, code: 'SPORTS_STAKE_LIMIT' };
  }
  if (settings.maxPotentialPayout != null && input.potentialPayout > settings.maxPotentialPayout) {
    return { ok: false, code: 'SPORTS_PAYOUT_LIMIT' };
  }
  if (
    input.mode === 'express'
    && settings.maxExpressLegs != null
    && input.legCount > settings.maxExpressLegs
  ) {
    return { ok: false, code: 'SPORTS_EXPRESS_LEG_LIMIT' };
  }
  return { ok: true };
}

export function sportsPlaceRequestFingerprint(input: {
  stake: number;
  mode: string;
  legs: Array<Record<string, unknown>>;
}): string {
  const stake = Math.round((Number(input.stake) + Number.EPSILON) * 100) / 100;
  const legs = input.legs.map((leg) => ({
    provider: String(leg.provider ?? '').trim().toLowerCase(),
    fixtureId: String(leg.fixtureId ?? leg.fixture_id ?? '').trim(),
    marketId: String(leg.marketId ?? leg.market_id ?? '').trim(),
    marketKey: String(leg.marketKey ?? leg.market_key ?? '').trim(),
    line: String(leg.line ?? '').trim(),
    outcomeId: String(leg.outcomeId ?? leg.betId ?? '').trim(),
    acceptedOdds: Math.round(Number(leg.acceptedOdds) * 1000) / 1000,
  })).sort((a, b) => {
    const left = `${a.provider}|${a.fixtureId}|${a.marketKey}|${a.outcomeId}`;
    const right = `${b.provider}|${b.fixtureId}|${b.marketKey}|${b.outcomeId}`;
    return left.localeCompare(right);
  });
  return JSON.stringify({ stake, mode: String(input.mode).trim().toLowerCase(), legs });
}
