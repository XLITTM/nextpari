import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';
import { normalizeRegistrationCurrency } from './playerCurrency.js';
import { parseExactPositiveDecimal } from './exactDecimal.js';

export const PLAYER_WALLETS_PATH = '/api/player/wallets';
export const PLAYER_WALLETS_ADD_PATH = '/api/player/wallets/add';
export const PLAYER_WALLETS_ACTIVE_PATH = '/api/player/wallets/active';
export const PLAYER_USDT_TARGETS_PATH = '/api/player/crypto/usdt-targets';
export const PLAYER_USDT_QUOTE_PATH = '/api/player/crypto/usdt-quote';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stripTmtm(value: unknown): unknown {
  if (typeof value === 'string') {
    return value === 'TMTM' ? 'TMT' : value;
  }
  if (Array.isArray(value)) return value.map(stripTmtm);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'wallet_currency_code' || key === 'storageCurrency' || key === 'storage_currency') continue;
      out[key] = stripTmtm(item);
    }
    return out;
  }
  return value;
}

export function mapPlayerWalletError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (code === 'AUTH_REQUIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
    return staffError(code, 401);
  }
  if (code === 'STAFF_ACCOUNT' || code === 'PLAYER_ACCOUNT_REQUIRED' || code === 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER') {
    return staffError(code, 403);
  }
  if (code === 'CURRENCY_WALLET_ALREADY_EXISTS') {
    return staffError(code, 409);
  }
  if (code === 'USDT_RATE_UNAVAILABLE' || code === 'CURRENCY_LIMITS_UNCONFIGURED' || code === 'WALLET_BLOCKED' || code === 'WALLET_CLOSED' || code === 'PLAYER_WALLET_NOT_ACTIVE' || code === 'QUOTE_IMMUTABLE') {
    return staffError(code, 409);
  }
  if (code === 'DEPOSIT_BELOW_CURRENCY_MIN' || code === 'WITHDRAWAL_BELOW_CURRENCY_MIN') {
    return staffError(code, 400);
  }
  if (code && (code.endsWith('_REQUIRED') || code.endsWith('_INVALID') || code.endsWith('_UNSUPPORTED') || code === 'WALLET_NOT_OWNED')) {
    return staffError(code, 400);
  }
  return staffError('WALLET_UNAVAILABLE', 503);
}

export interface PlayerWalletPorts {
  list: (accessToken: string) => Promise<Record<string, unknown>>;
  add: (accessToken: string, currency: string) => Promise<Record<string, unknown>>;
  setActive: (accessToken: string, input: { currency?: string; walletId?: string }) => Promise<Record<string, unknown>>;
  usdtTargets: (accessToken: string) => Promise<Record<string, unknown>>;
  createUsdtQuote: (accessToken: string, input: { sourceAmount: string; walletId: string }) => Promise<Record<string, unknown>>;
}

export function livePlayerWalletPorts(): PlayerWalletPorts {
  const env = loadOwnerAuthEnv();
  return {
    async list(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_wallets');
      if (error) throw mapPlayerWalletError(error);
      return asRecord(stripTmtm(data));
    },
    async add(accessToken, currency) {
      const display = normalizeRegistrationCurrency(currency);
      if (!display) throw staffError('CURRENCY_UNSUPPORTED', 400);
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_add_wallet', { p_currency: display });
      if (error) throw mapPlayerWalletError(error);
      return asRecord(stripTmtm(data));
    },
    async setActive(accessToken, input) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const args: Record<string, unknown> = {};
      if (input.walletId) args.p_wallet_id = input.walletId;
      if (input.currency) {
        const display = normalizeRegistrationCurrency(input.currency);
        if (!display) throw staffError('CURRENCY_UNSUPPORTED', 400);
        args.p_currency = display;
      }
      const { data, error } = await client.rpc('player_set_active_wallet', args);
      if (error) throw mapPlayerWalletError(error);
      return asRecord(stripTmtm(data));
    },
    async usdtTargets(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_usdt_quote_targets');
      if (error) throw mapPlayerWalletError(error);
      return asRecord(stripTmtm(data));
    },
    async createUsdtQuote(accessToken, input) {
      const sourceAmount = parseExactPositiveDecimal(input.sourceAmount, 'USDT_AMOUNT_INVALID');
      if (!input.walletId) throw staffError('WALLET_NOT_OWNED', 400);
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_create_usdt_quote', {
        p_source_amount: sourceAmount,
        p_wallet_id: input.walletId,
      });
      if (error) throw mapPlayerWalletError(error);
      return asRecord(stripTmtm(data));
    },
  };
}
