export const TEST_SPORTS_SHARED_KEY = 'TEST_SPORTS_SHARED_KEY';
export const TEST_CASINO_SHARED_KEY = 'TEST_CASINO_SHARED_KEY';

export const BETCONSTRUCT_SPORTS_TS_MAX_AGE_SEC = 20;
export const BETCONSTRUCT_SPORTS_TS_FUTURE_SKEW_SEC = 2;
export const BETCONSTRUCT_SESSION_EXTEND_MS = 20 * 60 * 1000;
/** Internal casino session TTL. Not a BetConstruct-documented lifetime; finalize with test env. */
export const BETCONSTRUCT_CASINO_SESSION_TTL_MS = 20 * 60 * 1000;
export const BETCONSTRUCT_CASINO_SESSION_TTL_MAX_MS = 24 * 60 * 60 * 1000;
export const BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY =
  'BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY';

export const BETCONSTRUCT_SPORTS_HASH_FIELDS = {
  GetClientDetails: ['AuthToken', 'TS'],
  GetClientBalance: ['AuthToken', 'TS'],
  BetPlaced: [
    'AuthToken',
    'TS',
    'TransactionId',
    'BetId',
    'Amount',
    'Created',
    'BetType',
    'SystemMinCount',
    'TotalPrice',
  ],
  BetResulted: [
    'AuthToken',
    'TS',
    'TransactionId',
    'BetId',
    'BetState',
    'Amount',
    'BonusAmount',
    'BonusId',
  ],
  Rollback: ['AuthToken', 'TS', 'TransactionId'],
} as const;

export const CASINO_ERROR = {
  WRONG_PLAYER_ID: 8,
  NOT_ENOUGH_BALANCE: 21,
  PLAYER_IS_BLOCKED: 29,
  INVALID_TOKEN: 102,
  TRANSACTION_NOT_FOUND: 107,
  WRONG_TRANSACTION_AMOUNT: 109,
  TRANSACTION_ALREADY_COMPLETE: 110,
  DEPOSIT_ALREADY_RECEIVED: 111,
  INVALID_BONUS_DEFINITION_ID: 125,
  GENERAL_ERROR: 130,
} as const;

export type CasinoErrorId = (typeof CASINO_ERROR)[keyof typeof CASINO_ERROR];
