export function isCanonicalSportsBetEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return String(env.CANONICAL_SPORTS_BET_ENABLED ?? '').trim() === '1';
}
