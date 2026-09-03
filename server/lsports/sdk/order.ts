import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsFlow } from '../config.js';
import { createSdkSafeLogger } from './logger.js';
import { loadTrade360Sdk, type Trade360Sdk } from './loadSdk.js';
import { LSPORTS_SDK_CUSTOMERS_API_BASE_URL } from './mqSettings.js';

export class LsportsSdkOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LsportsSdkOrderError';
  }
}

export interface LsportsSdkOrderResult {
  flow: LsportsFlow;
  fixtureId: number;
  success: boolean | null;
  error: string | null;
  quotaRemaining: number | null;
}

export interface LsportsSdkOrderDeps {
  loadSdk?: () => Trade360Sdk;
  subscribe?: (fixtureId: number) => Promise<{ success?: boolean; errorMessage?: string } | undefined>;
  quota?: () => Promise<{ creditRemaining?: number } | undefined>;
}

function parseFixtureId(raw: string | number | undefined): number {
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new LsportsSdkOrderError('LSPORTS_SDK_ORDER_FIXTURE_REQUIRED');
  }
  return value;
}

/**
 * Manual TRADE fixture ordering via official
 * CustomersApiFactory.createSubscriptionHttpClient().subscribeByFixtures.
 * Never call this on worker startup. One FixtureId only.
 */
export async function orderLsportsFixtureById(
  flow: LsportsFlow,
  fixtureIdInput: string | number,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsSdkOrderDeps = {},
): Promise<LsportsSdkOrderResult> {
  const fixtureId = parseFixtureId(fixtureIdInput);
  const config = resolveLsportsRmqConfig(flow, env);
  publicLsportsConfig(config);

  if (deps.subscribe) {
    const subscribed = await deps.subscribe(fixtureId);
    const quota = deps.quota ? await deps.quota() : undefined;
    return {
      flow,
      fixtureId,
      success: subscribed?.success ?? null,
      error: subscribed?.errorMessage ?? null,
      quotaRemaining: quota?.creditRemaining ?? null,
    };
  }

  const sdk = (deps.loadSdk ?? loadTrade360Sdk)();
  const client = new sdk.CustomersApiFactory().createSubscriptionHttpClient({
    restApiBaseUrl: LSPORTS_SDK_CUSTOMERS_API_BASE_URL,
    packageCredentials: {
      packageId: config.packageId,
      username: config.username,
      password: config.password,
    },
    logger: createSdkSafeLogger([config.username, config.password]) as never,
  });
  const request = new sdk.FixturesSubscriptionRequestDto({ fixtures: [fixtureId] });
  const [subscribed, quota] = await Promise.all([
    client.subscribeByFixtures(request),
    client.getPackageQuota().catch(() => undefined),
  ]);
  const first = subscribed?.fixtures?.[0];
  return {
    flow,
    fixtureId,
    success: first?.success ?? null,
    error: typeof first?.errorMessage === 'string' ? first.errorMessage : null,
    quotaRemaining: quota?.creditRemaining ?? null,
  };
}

export function readOrderFixtureArg(argv: readonly string[]): string | number | undefined {
  const joined = argv.find((arg) => arg.startsWith('--fixture='));
  if (joined) return joined.slice('--fixture='.length);
  const index = argv.indexOf('--fixture');
  if (index >= 0) return argv[index + 1];
  const positional = argv.filter((arg) => !arg.startsWith('-') && /^\d+$/.test(arg));
  return positional[positional.length - 1];
}
