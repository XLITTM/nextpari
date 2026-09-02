import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsFlow } from '../config.js';
import { createSdkSafeLogger } from './logger.js';
import { loadTrade360Sdk, type Trade360Sdk } from './loadSdk.js';
import { LSPORTS_SDK_CUSTOMERS_API_BASE_URL } from './mqSettings.js';

export interface LsportsSdkDistributionProbe {
  flow: LsportsFlow;
  packageId: number;
  ok: boolean;
  isDistributionOn: boolean | null;
  consumerCount: number | null;
  numberMessagesInQueue: number | null;
}

export interface LsportsSdkDistributionDeps {
  loadSdk?: () => Trade360Sdk;
}

/**
 * Official CustomersApiFactory.createPackageDistributionHttpClient().getDistributionStatus.
 * Does not call startDistribution or stopDistribution.
 */
export async function probeSdkDistributionStatus(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsSdkDistributionDeps = {},
): Promise<LsportsSdkDistributionProbe> {
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const sdk = (deps.loadSdk ?? loadTrade360Sdk)();
  const client = new sdk.CustomersApiFactory().createPackageDistributionHttpClient({
    restApiBaseUrl: LSPORTS_SDK_CUSTOMERS_API_BASE_URL,
    packageCredentials: {
      packageId: config.packageId,
      username: config.username,
      password: config.password,
    },
    logger: createSdkSafeLogger([config.username, config.password]) as never,
  });
  const StatusBody = sdk.StatusResponseBody;
  const status = await client.getDistributionStatus(StatusBody as never);
  const consumers = status?.consumers;
  return {
    flow,
    packageId: published.packageId,
    ok: status != null,
    isDistributionOn: status?.isDistributionOn ?? null,
    consumerCount: Array.isArray(consumers) ? consumers.length : null,
    numberMessagesInQueue: status?.numberMessagesInQueue ?? null,
  };
}
