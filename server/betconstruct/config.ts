export const BETCONSTRUCT_PROVIDER_KEY = 'betconstruct';

export const BETCONSTRUCT_NOT_CONFIGURED = 'BETCONSTRUCT_NOT_CONFIGURED';
export const BETCONSTRUCT_WALLET_NOT_WIRED = 'BETCONSTRUCT_WALLET_NOT_WIRED';
export const BETCONSTRUCT_METHOD_UNSUPPORTED = 'BETCONSTRUCT_METHOD_UNSUPPORTED';

export const BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS = [
  'GetClientDetails',
  'GetClientBalance',
  'BetPlaced',
  'BetResulted',
  'Rollback',
] as const;

export const BETCONSTRUCT_SINGLE_WALLET_METHODS = [
  'Authentication',
  'GetBalance',
  'Withdraw',
  'Deposit',
  'WithdrawAndDeposit',
  'Rollback',
] as const;

export type BetConstructSportsbookOperatorMethod =
  (typeof BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS)[number];
export type BetConstructSingleWalletMethod =
  (typeof BETCONSTRUCT_SINGLE_WALLET_METHODS)[number];

export interface BetConstructCredentialStatus {
  enabledFlag: boolean;
  operatorId: boolean;
  sportsSharedKey: boolean;
  sportsAllowedIps: boolean;
  casinoSharedKey: boolean;
  casinoAllowedIps: boolean;
  sportsbookIframeOrigin: boolean;
  casinoIframeOrigin: boolean;
  allPresent: boolean;
}

function present(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

export function betConstructCredentialStatus(
  env: NodeJS.ProcessEnv = process.env,
): BetConstructCredentialStatus {
  const status = {
    enabledFlag: String(env.BETCONSTRUCT_ENABLED ?? '').trim() === '1',
    operatorId: present(env.BETCONSTRUCT_OPERATOR_ID),
    sportsSharedKey: present(env.BETCONSTRUCT_SPORTS_SHARED_KEY),
    sportsAllowedIps: present(env.BETCONSTRUCT_SPORTS_ALLOWED_IPS),
    casinoSharedKey: present(env.BETCONSTRUCT_CASINO_SHARED_KEY),
    casinoAllowedIps: present(env.BETCONSTRUCT_CASINO_ALLOWED_IPS),
    sportsbookIframeOrigin: present(env.BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN),
    casinoIframeOrigin: present(env.BETCONSTRUCT_CASINO_IFRAME_ORIGIN),
  };
  return {
    ...status,
    allPresent: Object.values(status).every(Boolean),
  };
}

/**
 * Live traffic stays off until a later phase supplies real credentials
 * AND wires Wallet Ledger. Dummy env must not enable money or iframes.
 */
export function isBetConstructLive(env: NodeJS.ProcessEnv = process.env): boolean {
  void env;
  return false;
}
