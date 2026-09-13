/**
 * Canonical Security restriction gates for future adapters.
 *
 * BetB2B casino/slot/live-casino launch is not connected in this PR.
 * Do not invent a provider session here. When a real adapter lands, it MUST
 * call `public.require_player_external_casino_allowed(player_user_id)` with
 * service-role authority before issuing a provider session/launch.
 * Expected deny code: SECURITY_CASINO_RESTRICTED.
 *
 * Sports and Nextpari-owned games must keep using wallet-active checks only.
 * They must not call these restriction helpers.
 */
export const PLAYER_EXTERNAL_CASINO_GATE_RPC = 'require_player_external_casino_allowed';
export const PLAYER_EXTERNAL_CASINO_RESTRICTED = 'SECURITY_CASINO_RESTRICTED';
export const PLAYER_SECURITY_WITHDRAWAL_RESTRICTED = 'SECURITY_WITHDRAWAL_RESTRICTED';
export const PLAYER_SECURITY_DEPOSIT_RESTRICTED = 'SECURITY_DEPOSIT_RESTRICTED';
