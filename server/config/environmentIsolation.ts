/**
 * Fail-closed boundary between production and a future staging deployment.
 * Unset NEXTPARI_ENV keeps the current production, preview, and local behavior.
 * Staging must name a different Supabase project, a different public host,
 * synthetic users, and real-money providers left off.
 */

export class EnvironmentIsolationError extends Error {
  readonly code: string;
  readonly httpStatus = 503;

  constructor(code: string) {
    super(code);
    this.name = 'EnvironmentIsolationError';
    this.code = code;
  }
}

export type RuntimeRole = 'production' | 'staging' | 'development' | 'test' | 'unspecified';

export const PRODUCTION_PUBLIC_SUFFIX = 'nextpari.net';
export const PRODUCTION_RAILWAY_HOST = 'nextpari-production.up.railway.app';
export const PRODUCTION_LSPORTS_PACKAGE_IDS = ['4351', '4352'] as const;

const ROLES = new Set<RuntimeRole>(['production', 'staging', 'development', 'test']);

export const STAGING_REQUIRED_KEYS = [
  'NEXTPARI_ENV',
  'NEXTPARI_SYNTHETIC_USERS_ONLY',
  'NEXTPARI_REAL_MONEY_ENABLED',
  'NEXTPARI_PAYMENTS_ENABLED',
  'NEXTPARI_WALLET_MODE',
  'NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT',
  'NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT',
  'NEXTPARI_PLAYER_EMAIL_DOMAIN',
  'NEXTPARI_COOKIE_DOMAIN',
  'NEXTPARI_PUBLIC_ORIGIN',
  'NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF',
  'NEXTPARI_STAGING_SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'PLAYER_EMAIL_OTP_PEPPER',
  'PLAYER_SECURITY_SIGNAL_PEPPER',
  'BETCONSTRUCT_ENABLED',
  'CANONICAL_SPORTS_BET_ENABLED',
  'LSPORTS_DISPLAY_FEED',
  'VITE_SENTRY_ENVIRONMENT',
  'SENTRY_ENVIRONMENT',
] as const;

const DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DIRECT_URL',
  'PRODUCTION_DATABASE_URL',
  'PROD_DATABASE_URL',
  'SUPABASE_PRODUCTION_URL',
  'PROD_SUPABASE_URL',
] as const;

const BETCONSTRUCT_KEYS = [
  'BETCONSTRUCT_OPERATOR_ID',
  'BETCONSTRUCT_SPORTS_SHARED_KEY',
  'BETCONSTRUCT_SPORTS_ALLOWED_IPS',
  'BETCONSTRUCT_CASINO_SHARED_KEY',
  'BETCONSTRUCT_CASINO_ALLOWED_IPS',
  'BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN',
  'BETCONSTRUCT_CASINO_IFRAME_ORIGIN',
] as const;

const EMAIL_PROVIDER_KEYS = ['RESEND_API_KEY', 'PLAYER_EMAIL_FROM'] as const;

const PAYMENT_PREFIXES = [
  'STRIPE_',
  'NOWPAYMENTS_',
  'COINBASE_',
  'PAYPAL_',
  'PAYBOX_',
  'CASHFREE_',
  'PAYMENT_',
  'PAYMENTS_',
] as const;

const VITE_PUBLIC_KEYS = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SENTRY_DSN',
  'VITE_SENTRY_ENVIRONMENT',
  'VITE_SENTRY_RELEASE',
  'VITE_LSPORTS_DISPLAY_FEED',
  'VITE_LSPORTS_FEED_BASE_URL',
]);

const PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'replace-me',
  'todo',
  'dummy',
  'secret',
  'password',
  'your-key-here',
  'xxx',
]);

const PROJECT_REF = /^[a-z0-9]{20}$/;

function read(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] ?? '').trim();
}

function hasLabel(value: string, label: string): boolean {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).includes(label);
}

function isDeployed(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    read(env, 'VERCEL')
    || read(env, 'VERCEL_ENV')
    || read(env, 'RAILWAY_ENVIRONMENT')
    || read(env, 'RAILWAY_ENVIRONMENT_NAME')
    || read(env, 'RAILWAY_PROJECT_ID')
    || read(env, 'RAILWAY_SERVICE_ID'),
  );
}

function railwayIsStaging(env: NodeJS.ProcessEnv): boolean {
  return hasLabel(read(env, 'RAILWAY_ENVIRONMENT_NAME'), 'staging')
    || hasLabel(read(env, 'RAILWAY_ENVIRONMENT'), 'staging');
}

export function isProductionHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (normalized === PRODUCTION_RAILWAY_HOST) return true;
  if (normalized === PRODUCTION_PUBLIC_SUFFIX || normalized.endsWith(`.${PRODUCTION_PUBLIC_SUFFIX}`)) {
    return true;
  }
  return normalized === 'nextpari.vercel.app'
    || normalized === 'www.nextpari.vercel.app'
    || normalized === 'nextpari-production.vercel.app';
}

function readPublicHost(value: string): { ok: true; host: string } | { ok: false } {
  if (!value) return { ok: false };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== 'https:') return { ok: false };
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) return { ok: false };
  if (parsed.pathname !== '/' && parsed.pathname !== '') return { ok: false };
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) return { ok: false };
  return { ok: true, host };
}

function supabaseRefFromUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) return null;
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  return match?.[1] ?? null;
}

function unique(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

export function resolveRuntimeRole(env: NodeJS.ProcessEnv): RuntimeRole {
  const name = read(env, 'NEXTPARI_ENV');
  if (name && !ROLES.has(name as RuntimeRole)) {
    throw new EnvironmentIsolationError('NEXTPARI_ENV_INVALID');
  }
  const deployed = isDeployed(env);
  if (deployed && (name === 'development' || name === 'test')) {
    throw new EnvironmentIsolationError('DEPLOYED_RUNTIME_ROLE_FORBIDDEN');
  }

  const origin = readPublicHost(read(env, 'NEXTPARI_PUBLIC_ORIGIN'));
  const originStaging = origin.ok && hasLabel(origin.host, 'staging');
  if (name === 'staging') return 'staging';

  if (railwayIsStaging(env) || originStaging) {
    if (name === 'production') throw new EnvironmentIsolationError('STAGING_MISLABELED_AS_PRODUCTION');
    if (!name) throw new EnvironmentIsolationError('NEXTPARI_ENV_REQUIRED');
  }

  if (name === 'production') return 'production';
  if (name === 'development') return 'development';
  if (name === 'test') return 'test';
  return 'unspecified';
}

function requireExact(codes: string[], env: NodeJS.ProcessEnv, key: string, expected: string, code: string) {
  if (read(env, key) !== expected) codes.push(code);
}

function collectStagingFailures(env: NodeJS.ProcessEnv): string[] {
  const codes: string[] = [];
  requireExact(codes, env, 'NEXTPARI_SYNTHETIC_USERS_ONLY', 'true', 'STAGING_SYNTHETIC_USERS_REQUIRED');
  requireExact(codes, env, 'NEXTPARI_REAL_MONEY_ENABLED', 'false', 'STAGING_REAL_MONEY_FORBIDDEN');
  requireExact(codes, env, 'NEXTPARI_PAYMENTS_ENABLED', 'false', 'STAGING_PAYMENTS_FORBIDDEN');
  requireExact(codes, env, 'NEXTPARI_WALLET_MODE', 'synthetic', 'STAGING_WALLET_MODE_INVALID');
  requireExact(codes, env, 'NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT', 'false', 'STAGING_PLAYER_IMPORT_FORBIDDEN');
  requireExact(codes, env, 'NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT', 'true', 'STAGING_CREDENTIALS_MUST_BE_DISTINCT');

  const productionRef = read(env, 'NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF');
  const stagingRef = read(env, 'NEXTPARI_STAGING_SUPABASE_PROJECT_REF');
  if (!PROJECT_REF.test(productionRef)) codes.push('STAGING_PRODUCTION_SUPABASE_REF_REQUIRED');
  if (!PROJECT_REF.test(stagingRef)) codes.push('STAGING_SUPABASE_REF_REQUIRED');
  if (PROJECT_REF.test(productionRef) && productionRef === stagingRef) {
    codes.push('STAGING_SUPABASE_REFS_MUST_DIFFER');
  }

  const supabaseUrl = read(env, 'SUPABASE_URL');
  const urlRef = supabaseRefFromUrl(supabaseUrl);
  if (!supabaseUrl) codes.push('STAGING_SUPABASE_URL_REQUIRED');
  else if (!urlRef) codes.push('STAGING_SUPABASE_URL_INVALID');
  else if (PROJECT_REF.test(stagingRef) && urlRef !== stagingRef) codes.push('STAGING_SUPABASE_URL_MISMATCH');

  const viteUrl = read(env, 'VITE_SUPABASE_URL');
  if (!viteUrl || viteUrl !== supabaseUrl) codes.push('STAGING_VITE_SUPABASE_URL_MISMATCH');

  const anonKey = read(env, 'SUPABASE_ANON_KEY');
  const serviceKey = read(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) codes.push('STAGING_SUPABASE_ANON_KEY_REQUIRED');
  if (!serviceKey) codes.push('STAGING_SUPABASE_SERVICE_ROLE_KEY_REQUIRED');
  if (anonKey && serviceKey && anonKey === serviceKey) codes.push('STAGING_SUPABASE_KEYS_MUST_DIFFER');
  if ((anonKey && (anonKey.length < 20 || PLACEHOLDERS.has(anonKey.toLowerCase())))
    || (serviceKey && (serviceKey.length < 20 || PLACEHOLDERS.has(serviceKey.toLowerCase())))) {
    codes.push('STAGING_SECRET_PLACEHOLDER');
  }
  const viteAnon = read(env, 'VITE_SUPABASE_ANON_KEY');
  if (!viteAnon || viteAnon !== anonKey) codes.push('STAGING_VITE_SUPABASE_ANON_KEY_MISMATCH');
  if (read(env, 'VITE_SUPABASE_SERVICE_ROLE_KEY')) codes.push('STAGING_VITE_SECRET_FORBIDDEN');

  for (const key of DATABASE_URL_KEYS) {
    if (read(env, key)) codes.push('STAGING_DATABASE_URL_FORBIDDEN');
  }

  const origin = readPublicHost(read(env, 'NEXTPARI_PUBLIC_ORIGIN'));
  if (!origin.ok) codes.push('STAGING_PUBLIC_ORIGIN_INVALID');
  else if (isProductionHost(origin.host)) codes.push('STAGING_PUBLIC_ORIGIN_IS_PRODUCTION');
  else if (!hasLabel(origin.host, 'staging')) codes.push('STAGING_PUBLIC_ORIGIN_INVALID');
  if (read(env, 'NEXTPARI_COOKIE_DOMAIN')) codes.push('STAGING_COOKIE_DOMAIN_MUST_BE_HOST_ONLY');

  const emailDomain = read(env, 'NEXTPARI_PLAYER_EMAIL_DOMAIN').toLowerCase();
  if (!emailDomain) codes.push('STAGING_EMAIL_DOMAIN_REQUIRED');
  else if (
    !/^[a-z0-9.-]+$/.test(emailDomain)
    || emailDomain.includes('..')
    || emailDomain.startsWith('.')
    || emailDomain.endsWith('.')
    || (!emailDomain.endsWith('.test') && !emailDomain.endsWith('.invalid'))
    || !hasLabel(emailDomain, 'staging')
  ) {
    codes.push('STAGING_EMAIL_DOMAIN_INVALID');
  }

  const otpPepper = read(env, 'PLAYER_EMAIL_OTP_PEPPER');
  const signalPepper = read(env, 'PLAYER_SECURITY_SIGNAL_PEPPER');
  if (!otpPepper) codes.push('STAGING_EMAIL_OTP_PEPPER_REQUIRED');
  if (!signalPepper) codes.push('STAGING_SECURITY_PEPPER_REQUIRED');
  if ((otpPepper && (otpPepper.length < 32 || PLACEHOLDERS.has(otpPepper.toLowerCase())))
    || (signalPepper && (signalPepper.length < 32 || PLACEHOLDERS.has(signalPepper.toLowerCase())))) {
    codes.push('STAGING_PEPPER_WEAK');
  }
  if (otpPepper && signalPepper && otpPepper === signalPepper) codes.push('STAGING_PEPPER_REUSED');
  if ((otpPepper && (otpPepper === anonKey || otpPepper === serviceKey))
    || (signalPepper && (signalPepper === anonKey || signalPepper === serviceKey))) {
    codes.push('STAGING_PEPPER_REUSED');
  }

  for (const key of EMAIL_PROVIDER_KEYS) {
    if (read(env, key)) codes.push('STAGING_EMAIL_PROVIDER_FORBIDDEN');
  }

  for (const key of ['VITE_SENTRY_ENVIRONMENT', 'SENTRY_ENVIRONMENT'] as const) {
    const value = read(env, key);
    if (value && value !== 'staging') codes.push('STAGING_SENTRY_ENVIRONMENT_INVALID');
  }
  if (read(env, 'VITE_SENTRY_DSN') && read(env, 'VITE_SENTRY_ENVIRONMENT') !== 'staging') {
    codes.push('STAGING_SENTRY_ENVIRONMENT_INVALID');
  }
  if (read(env, 'SENTRY_DSN') && read(env, 'SENTRY_ENVIRONMENT') !== 'staging') {
    codes.push('STAGING_SENTRY_ENVIRONMENT_INVALID');
  }

  const betconstructEnabled = read(env, 'BETCONSTRUCT_ENABLED');
  if (betconstructEnabled !== '' && betconstructEnabled !== '0') codes.push('STAGING_BETCONSTRUCT_FORBIDDEN');
  for (const key of BETCONSTRUCT_KEYS) {
    if (read(env, key)) codes.push('STAGING_BETCONSTRUCT_FORBIDDEN');
  }
  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith('BETCONSTRUCT_') || key === 'BETCONSTRUCT_ENABLED') continue;
    if (String(raw ?? '').trim()) codes.push('STAGING_BETCONSTRUCT_FORBIDDEN');
  }

  const sportsBets = read(env, 'CANONICAL_SPORTS_BET_ENABLED');
  if (sportsBets !== '' && sportsBets !== '0') codes.push('STAGING_SPORTS_BETTING_FORBIDDEN');
  const displayFeed = read(env, 'LSPORTS_DISPLAY_FEED');
  if (displayFeed !== '' && displayFeed !== '0') codes.push('STAGING_LSPORTS_FORBIDDEN');
  const viteDisplay = read(env, 'VITE_LSPORTS_DISPLAY_FEED');
  if (viteDisplay !== '' && viteDisplay !== '0') codes.push('STAGING_LSPORTS_FORBIDDEN');
  for (const [key, raw] of Object.entries(env)) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (key.startsWith('LSPORTS_') && key !== 'LSPORTS_DISPLAY_FEED') codes.push('STAGING_LSPORTS_FORBIDDEN');
    if (key === 'VITE_LSPORTS_FEED_BASE_URL' || key === 'NEXTPARI_SPORTS_SETTLE_URL' || key === 'NEXTPARI_SPORTS_SETTLEMENT_SECRET') {
      codes.push('STAGING_LSPORTS_FORBIDDEN');
    }
    if (PAYMENT_PREFIXES.some((prefix) => key.startsWith(prefix))) codes.push('STAGING_PAYMENT_PROVIDER_FORBIDDEN');
    if (key.startsWith('VITE_') && !VITE_PUBLIC_KEYS.has(key) && /SECRET|PASSWORD|SERVICE_ROLE|SHARED_KEY|PEPPER|RMQ|API_KEY|SETTLEMENT/i.test(key)) {
      codes.push('STAGING_VITE_SECRET_FORBIDDEN');
    }
  }

  for (const [key, raw] of Object.entries(env)) {
    if (key === 'NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF') continue;
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) continue;
    if (PROJECT_REF.test(productionRef) && value.includes(productionRef)) {
      codes.push('STAGING_VALUE_CONTAINS_PRODUCTION_REF');
    }
    if (value.includes(PRODUCTION_PUBLIC_SUFFIX) || value.includes(PRODUCTION_RAILWAY_HOST)) {
      codes.push('STAGING_VALUE_POINTS_AT_PRODUCTION');
    }
  }

  return unique(codes);
}

function collectCrossEnvironmentFailures(env: NodeJS.ProcessEnv, role: RuntimeRole): string[] {
  const codes: string[] = [];
  const stagingRef = read(env, 'NEXTPARI_STAGING_SUPABASE_PROJECT_REF');
  const url = read(env, 'SUPABASE_URL') || read(env, 'VITE_SUPABASE_URL');
  if (PROJECT_REF.test(stagingRef) && url.includes(`${stagingRef}.supabase.co`)) {
    codes.push('PRODUCTION_POINTS_AT_STAGING_DATABASE');
  }
  if (role === 'production' && read(env, 'NEXTPARI_WALLET_MODE') === 'synthetic') {
    codes.push('PRODUCTION_WALLET_MODE_INVALID');
  }
  return codes;
}

export function collectEnvironmentIsolationFailures(env: NodeJS.ProcessEnv): string[] {
  try {
    const role = resolveRuntimeRole(env);
    if (role === 'staging') return collectStagingFailures(env);
    if (role === 'production' || role === 'unspecified') return collectCrossEnvironmentFailures(env, role);
    return [];
  } catch (error) {
    if (error instanceof EnvironmentIsolationError) return [error.code];
    throw error;
  }
}

export function assertEnvironmentIsolation(env: NodeJS.ProcessEnv = process.env): RuntimeRole {
  const role = resolveRuntimeRole(env);
  const failures = role === 'staging'
    ? collectStagingFailures(env)
    : role === 'production' || role === 'unspecified'
      ? collectCrossEnvironmentFailures(env, role)
      : [];
  if (failures.length > 0) throw new EnvironmentIsolationError(failures[0]);
  return role;
}
