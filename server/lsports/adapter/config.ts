type EnvMap = Record<string, string | undefined>;

/**
 * Explicit shadow/display-feed switch. Not a secret.
 * Server/scripts read LSPORTS_DISPLAY_FEED=1.
 * Client UI uses a separate non-secret app-env selector.
 * Never put LSports credentials in frontend-exposed variables.
 */
export function isLsportsDisplayFeedEnabled(env: EnvMap = process.env): boolean {
  return String(env.LSPORTS_DISPLAY_FEED ?? '').trim() === '1';
}
