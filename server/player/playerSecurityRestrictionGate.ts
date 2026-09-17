/**
 * Canonical Security restriction gates for future adapters.
 *
 * BetConstruct casino/slot/live-casino launch is iframe-first and currently
 * fail-closed (`BETCONSTRUCT_NOT_CONFIGURED`). Do not invent a native casino
 * canvas or a provider session here. When credentials exist, the launch
 * adapter MUST call `public.require_player_external_casino_allowed(player_user_id)`
 * with service-role authority before issuing an AuthToken.
 * Expected deny code: SECURITY_CASINO_RESTRICTED.
 *
 * Sports and Nextpari-owned games must keep using wallet-active checks only.
 * They must not call these restriction helpers.
 */
export const PLAYER_EXTERNAL_CASINO_GATE_RPC = 'require_player_external_casino_allowed';
export const PLAYER_EXTERNAL_CASINO_RESTRICTED = 'SECURITY_CASINO_RESTRICTED';
export const PLAYER_SECURITY_WITHDRAWAL_RESTRICTED = 'SECURITY_WITHDRAWAL_RESTRICTED';
export const PLAYER_SECURITY_DEPOSIT_RESTRICTED = 'SECURITY_DEPOSIT_RESTRICTED';
