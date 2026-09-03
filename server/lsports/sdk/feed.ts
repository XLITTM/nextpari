import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsFlow } from '../config.js';
import { createSdkSafeLogger } from './logger.js';
import { loadTrade360Sdk, type Trade360Sdk } from './loadSdk.js';
import { lsportsMqSettingsForSdk } from './mqSettings.js';
import { reconstructPayloadFromSdk, type SdkEntityLike, type SdkHeaderLike } from './payload.js';

export interface LsportsSdkFeedHandle {
  stop: () => Promise<void>;
}

export interface LsportsSdkFeedOptions {
  flow: LsportsFlow;
  env?: NodeJS.ProcessEnv;
  prefetch: number;
  onMessage: (payload: unknown) => void;
  onParseFailure: () => void;
  loadSdk?: () => Trade360Sdk;
}

/**
 * Official Feed.start(true) also starts distribution, and Feed.stop() then
 * calls DistributionUtil.stop(). We always start(false) and keep Nextpari's
 * existing Distribution/Start path.
 */
export async function startLsportsSdkFeed(options: LsportsSdkFeedOptions): Promise<LsportsSdkFeedHandle> {
  const env = options.env ?? process.env;
  const config = resolveLsportsRmqConfig(options.flow, env);
  publicLsportsConfig(config);
  const sdk = (options.loadSdk ?? loadTrade360Sdk)();
  const logger = createSdkSafeLogger([config.username, config.password]);
  const feed = new sdk.Feed(lsportsMqSettingsForSdk(config, options.prefetch), logger as never);

  const handler = {
    async processAsync(message: { header?: SdkHeaderLike; entity?: SdkEntityLike }) {
      try {
        options.onMessage(reconstructPayloadFromSdk(message.header, message.entity));
      } catch {
        options.onParseFailure();
      }
    },
  };

  await feed.addEntityHandler(handler as never, sdk.FixtureMetadataUpdate);
  await feed.addEntityHandler(handler as never, sdk.LivescoreUpdate);
  await feed.addEntityHandler(handler as never, sdk.MarketUpdate);
  await feed.addEntityHandler(handler as never, sdk.KeepAliveUpdate);
  await feed.addEntityHandler(handler as never, sdk.HeartbeatUpdate);
  await feed.addEntityHandler(handler as never, sdk.SettlementUpdate);
  await feed.start(false);

  return {
    async stop() {
      await feed.stop();
    },
  };
}
