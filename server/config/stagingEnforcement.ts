import {
  assertEnvironmentIsolation,
  collectEnvironmentIsolationFailures,
  configuredPublicHost,
  EnvironmentIsolationError,
  hostFromAuthority,
  isProductionHost,
  resolveRuntimeRole,
  supabaseProjectRef,
  trustedDeploymentHosts,
} from './environmentIsolation.js';

/**
 * No synthetic wallet implementation has been reviewed.
 * Staging must refuse monetary side effects until that changes in a later change.
 */
export const STAGING_SYNTHETIC_WALLET_VERIFIED = false;

const INTERNAL_AUTH_DOMAIN = 'auth.nextpari.invalid';

export interface StagingHttpDenial {
  status: 503;
  body: Record<string, unknown>;
}

function denial(code: string): StagingHttpDenial {
  return {
    status: 503,
    body: { ok: false, authenticated: false, error: code },
  };
}

function isolationDenial(error: unknown): StagingHttpDenial | null {
  if (error instanceof EnvironmentIsolationError) return denial(error.code);
  return null;
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? '').split(',')[0].trim();
}

export function requestHost(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  return hostFromAuthority(headerValue(headers, 'x-forwarded-host') || headerValue(headers, 'host'));
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function isDeployed(env: NodeJS.ProcessEnv): boolean {
  const read = (key: string) => String(env[key] ?? '').trim();
  return Boolean(
    read('VERCEL')
    || read('VERCEL_ENV')
    || read('RAILWAY_ENVIRONMENT')
    || read('RAILWAY_ENVIRONMENT_NAME')
    || read('RAILWAY_PROJECT_ID')
    || read('RAILWAY_SERVICE_ID'),
  );
}

export function assertStagingRequestHost(
  env: NodeJS.ProcessEnv,
  headers: Record<string, string | string[] | undefined> | undefined,
): void {
  const host = requestHost(headers);
  const trusted = trustedDeploymentHosts(env);
  if (host && isProductionHost(host)) {
    throw new EnvironmentIsolationError('STAGING_REQUEST_HOST_IS_PRODUCTION');
  }
  if (isDeployed(env)) {
    if (!host) throw new EnvironmentIsolationError('STAGING_REQUEST_HOST_REQUIRED');
    if (!trusted.includes(host)) throw new EnvironmentIsolationError('STAGING_REQUEST_HOST_UNTRUSTED');
    return;
  }
  if (!host || isLocalHost(host)) return;
  if (host !== configuredPublicHost(env)) {
    throw new EnvironmentIsolationError('STAGING_REQUEST_HOST_UNTRUSTED');
  }
}

export function stagingHttpDenial(
  headers: Record<string, string | string[] | undefined> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): StagingHttpDenial | null {
  try {
    const role = assertEnvironmentIsolation(env);
    if (role !== 'staging') return null;
    assertStagingRequestHost(env, headers);
    return null;
  } catch (error) {
    const denied = isolationDenial(error);
    if (denied) return denied;
    throw error;
  }
}

export function assertStagingMonetarySideEffect(env: NodeJS.ProcessEnv = process.env): void {
  if (resolveRuntimeRole(env) !== 'staging') return;
  assertEnvironmentIsolation(env);
  if (!STAGING_SYNTHETIC_WALLET_VERIFIED) {
    throw new EnvironmentIsolationError('STAGING_MONEY_SIDE_EFFECT_FORBIDDEN');
  }
}

const MONEY_PATHS: RegExp[] = [
  /^\/api\/player\/games\/start$/,
  /^\/api\/player\/games\/[^/]+\/action$/,
  /^\/api\/player\/sports\/place$/,
  /^\/api\/player\/withdrawals$/,
  /^\/api\/player\/wallets\/add$/,
  /^\/api\/player\/crypto\/usdt-quote$/,
  /^\/api\/player\/betconstruct(?:\/|$)/,
  /^\/api\/betconstruct(?:\/|$)/,
  /^\/api\/internal\/sports\/settle$/,
  /^\/api\/owner\/fund(?:\/currency)?$/,
  /^\/api\/owner\/treasury\/capital-in$/,
  /^\/api\/owner\/players\/[^/]+\/debit$/,
  /^\/api\/owner\/withdrawals\/[^/]+\/(?:approve|reject|paid)$/,
  /^\/api\/owner\/withdrawal-reviews\/[^/]+\/(?:start|approve|reject)$/,
  /^\/api\/owner\/usdt-rates$/,
  /^\/api\/owner\/currency-limits(?:\/|$)/,
  /^\/api\/security\/withdrawal-reviews\/[^/]+\/(?:start|approve|reject)$/,
  /^\/api\/cashier\/deposits$/,
  /^\/api\/cashier\/deposits\/[^/]+\/reverse$/,
  /^\/api\/cashier\/payouts\/[^/]+\/confirm$/,
  /^\/api\/manager\/cashiers\/[^/]+\/fund$/,
  /^\/api\/manager\/cashiers\/[^/]+\/collect$/,
  /^\/api\/manager\/cashiers\/[^/]+\/currencies$/,
  /^\/api\/owner\/managers\/[^/]+\/currencies$/,
  /^\/api\/owner\/cashiers\/[^/]+\/currencies$/,
];

export function isMonetaryHttpPath(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  return MONEY_PATHS.some((pattern) => pattern.test(path));
}

export function stagingMoneyDenial(
  pathname: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env,
): StagingHttpDenial | null {
  if (!isMonetaryHttpPath(pathname, method)) return null;
  try {
    assertStagingMonetarySideEffect(env);
    return null;
  } catch (error) {
    const denied = isolationDenial(error);
    if (denied) return denied;
    throw error;
  }
}

const MONETARY_RPC_EXACT = new Set([
  'player_game_start',
  'player_game_action',
  'sports_place_for_player',
  'sports_apply_settlement',
  'player_add_wallet',
  'player_create_usdt_quote',
  'player_create_withdrawal',
  'provider_ingest_transaction',
]);

export function isMonetaryRpc(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized === 'ensure_player_account'
    || normalized === 'player_set_active_wallet'
    || normalized === 'player_wallets'
    || normalized === 'player_usdt_quote_targets'
    || normalized === 'player_game_get'
    || normalized.includes('_list_')
    || normalized.includes('_summary')
    || normalized.includes('_overview')
    || normalized.includes('_lookup_')
  ) {
    return false;
  }
  if (MONETARY_RPC_EXACT.has(normalized)) return true;
  return /deposit_player|reverse_player_deposit|confirm_player_payout|create_withdrawal|capital_in|fund_manager|fund_cashier|fund_player|collect_cashier|debit_player|add_manager_currency|add_cashier_currency|adjust_player_balance|topup_cashier|mark_withdrawal_paid|approve_withdrawal|reject_withdrawal|start_withdrawal_review|set_usdt_deposit_rate|set_currency_limits|currency_sports_enabled|owned_games_enabled/.test(normalized);
}

export function guardStagingMonetaryRpc(name: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!isMonetaryRpc(name)) return;
  assertStagingMonetarySideEffect(env);
}

export function assertSupabaseTarget(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const role = assertEnvironmentIsolation(env);
  if (role !== 'staging') return;
  const ref = supabaseProjectRef(url);
  const expected = String(env.NEXTPARI_STAGING_SUPABASE_PROJECT_REF ?? '').trim();
  if (!ref || ref !== expected) throw new EnvironmentIsolationError('STAGING_SUPABASE_URL_MISMATCH');
}

export function assertStagingClientBuild(env: NodeJS.ProcessEnv): void {
  if (resolveRuntimeRole(env) !== 'staging') return;
  assertEnvironmentIsolation(env);
  const serverUrl = String(env.SUPABASE_URL ?? '').trim();
  const clientUrl = String(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!clientUrl || clientUrl !== serverUrl) {
    throw new EnvironmentIsolationError('STAGING_VITE_SUPABASE_URL_MISMATCH');
  }
  const productionRef = String(env.NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF ?? '').trim();
  const clientRef = supabaseProjectRef(clientUrl);
  if (productionRef && clientRef === productionRef) {
    throw new EnvironmentIsolationError('STAGING_VALUE_CONTAINS_PRODUCTION_REF');
  }
  const nextPublicUrl = String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  if (nextPublicUrl && nextPublicUrl !== serverUrl) {
    throw new EnvironmentIsolationError('STAGING_VITE_SUPABASE_URL_MISMATCH');
  }
  const nextPublicKey = String(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const anon = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (nextPublicKey && nextPublicKey !== anon) {
    throw new EnvironmentIsolationError('STAGING_VITE_SUPABASE_ANON_KEY_MISMATCH');
  }
}

function stagingRoleFailure(env: NodeJS.ProcessEnv): string | null {
  try {
    if (resolveRuntimeRole(env) !== 'staging') return null;
  } catch (error) {
    if (error instanceof EnvironmentIsolationError) return error.code;
    throw error;
  }
  return collectEnvironmentIsolationFailures(env)[0] ?? null;
}

export function syntheticAccountEmailFailure(email: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const blocked = stagingRoleFailure(env);
  if (blocked) return blocked;
  if (resolveRuntimeRole(env) !== 'staging') return null;
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  const required = String(env.NEXTPARI_PLAYER_EMAIL_DOMAIN ?? '').trim().toLowerCase();
  if (domain === required || domain === INTERNAL_AUTH_DOMAIN) return null;
  return 'STAGING_SYNTHETIC_EMAIL_REQUIRED';
}

export function syntheticRegistrationFailure(
  input: { method?: string; email?: string; phone?: string },
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const blocked = stagingRoleFailure(env);
  if (blocked) return blocked;
  if (resolveRuntimeRole(env) !== 'staging') return null;
  const method = String(input.method ?? '').trim().toLowerCase().replace(/-/g, '_')
    || (String(input.email ?? '').trim() ? 'email' : '');
  if (method === 'phone' || String(input.phone ?? '').trim()) return 'STAGING_PHONE_REGISTRATION_FORBIDDEN';
  if (method === 'one_click') return null;
  if (method === 'email') return syntheticAccountEmailFailure(String(input.email ?? ''), env);
  return null;
}
