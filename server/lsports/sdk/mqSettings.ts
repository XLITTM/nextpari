import { LSPORTS_STM_API_BASE } from '../distribution.js';
import type { LsportsRmqConfig } from '../config.js';

/** Trailing slash required by trade360-nodejs-sdk MQSettingsSchema.customersApiBaseUrl. */
export const LSPORTS_SDK_CUSTOMERS_API_BASE_URL = `${LSPORTS_STM_API_BASE}/`;
export const LSPORTS_SDK_SNAPSHOT_API_BASE_URL = 'https://stm-snapshot.lsports.eu/';

export function lsportsMqSettingsForSdk(config: LsportsRmqConfig, prefetchCount: number) {
  return {
    hostname: config.host,
    port: config.port,
    vhost: config.vhost,
    username: config.username,
    password: config.password,
    packageId: config.packageId,
    sslEnabled: false,
    prefetchCount,
    autoAck: true,
    networkRecoveryIntervalInMs: 5_000,
    maxRetryAttempts: 3_000,
    consumptionLatencyThreshold: 5,
    requestedHeartbeatSeconds: config.heartbeat,
    dispatchConsumersAsync: true,
    automaticRecoveryEnabled: true,
    distributionPropagationDelayMs: 2_000,
    initialConnectionRetryIntervalMs: 1_000,
    initialConnectionMaxAttempts: 5,
    customersApiBaseUrl: LSPORTS_SDK_CUSTOMERS_API_BASE_URL,
  };
}

export function publicSdkMqSettings(config: LsportsRmqConfig, prefetchCount: number) {
  const settings = lsportsMqSettingsForSdk(config, prefetchCount);
  return {
    hostname: settings.hostname,
    port: settings.port,
    vhost: settings.vhost,
    packageId: settings.packageId,
    prefetchCount: settings.prefetchCount,
    requestedHeartbeatSeconds: settings.requestedHeartbeatSeconds,
    customersApiBaseUrl: settings.customersApiBaseUrl,
    automaticRecoveryEnabled: settings.automaticRecoveryEnabled,
  };
}
