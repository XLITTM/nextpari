import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LsportsConfigError,
  packageQueueName,
  publicLsportsConfig,
  resolveLsportsRmqConfig,
} from './config.js';
import {
  LSPORTS_OBSERVE_MAX_MESSAGES,
  LSPORTS_OBSERVE_TIMEOUT_MS,
  LSPORTS_PROBE_TIMEOUT_MS,
  LSPORTS_TYPE_CAPTURE_MAX_MESSAGES,
  LSPORTS_TYPE_CAPTURE_TIMEOUT_MS,
  formatSampleJson,
  observationSamplePath,
  observeBudget,
  readHeaderServerTimestamp,
  typeCaptureBudget,
  typeSampleName,
  probeBudget,
  sampleKindForMessageType,
  samplePayloadPath,
  summarizeLsportsMessage,
  type3MatchesTrackedMarket,
} from './probe.js';
import {
  LSPORTS_DISTRIBUTION_START_URL,
  LSPORTS_GET_DISTRIBUTION_STATUS_URL,
  buildDistributionStartRequest,
  buildGetDistributionStatusRequest,
  inferCredentialsAccepted,
  isDistributionAlreadyActiveMessage,
  isDistributionStartSuccess,
  readDistributionConsumerCount,
  readDistributionConsumers,
  readDistributionStartMessage,
  readIsDistributionOn,
  readMessagesPerSecond,
  readNumberMessagesInQueue,
  startDistributionAcceptingActive,
} from './distribution.js';
import { containsSecret, serializeDiagnostic } from './redact.js';
import { classifyRmqError } from './rmq.js';
import {
  LSPORTS_FOOTBALL_SPORT_ID,
  LSPORTS_INPLAY_GET_FIXTURE_MARKETS_URL,
  LSPORTS_INPLAY_GET_FIXTURES_URL,
  LSPORTS_INPLAY_GET_SCORES_URL,
  LSPORTS_SNAPSHOT_FOOTBALL_SAMPLE,
  LSPORTS_SNAPSHOT_MARKETS_SAMPLE,
  LSPORTS_SNAPSHOT_MIN_INTERVAL_MS,
  LSPORTS_SNAPSHOT_SCORES_SAMPLE,
  buildGetFixturesRequest,
  buildSnapshotFilteredRequest,
  readSnapshotFixtures,
  snapshotSamplePath,
} from './snapshot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const SHARED = {
  LSPORTS_RMQ_USERNAME: 'shared-user',
  LSPORTS_RMQ_PASSWORD: 'shared-secret',
};

describe('lsports rmq config', () => {
  it('resolves inplay package 4351 and queue _4351_', () => {
    const config = resolveLsportsRmqConfig('inplay', SHARED);
    assert.equal(config.host, 'stm-inplay.lsports.eu');
    assert.equal(config.vhost, 'StmInPlay');
    assert.equal(config.packageId, 4351);
    assert.equal(config.queue, '_4351_');
    assert.equal(packageQueueName(4351), '_4351_');
    assert.equal(config.port, 5672);
    assert.equal(config.heartbeat, 30);
    assert.equal(config.ssl, false);
  });

  it('resolves prematch package 4352 and queue _4352_', () => {
    const config = resolveLsportsRmqConfig('prematch', SHARED);
    assert.equal(config.host, 'stm-prematch.lsports.eu');
    assert.equal(config.vhost, 'StmPreMatch');
    assert.equal(config.packageId, 4352);
    assert.equal(config.queue, '_4352_');
    assert.equal(packageQueueName(4352), '_4352_');
  });

  it('falls back to shared RMQ credentials', () => {
    const config = resolveLsportsRmqConfig('inplay', SHARED);
    assert.equal(config.username, 'shared-user');
    assert.equal(config.password, 'shared-secret');
  });

  it('uses flow-specific credential overrides', () => {
    const config = resolveLsportsRmqConfig('prematch', {
      ...SHARED,
      LSPORTS_PREMATCH_USERNAME: 'prematch-user',
      LSPORTS_PREMATCH_PASSWORD: 'prematch-secret',
    });
    assert.equal(config.username, 'prematch-user');
    assert.equal(config.password, 'prematch-secret');
  });

  it('fails closed when username is missing', () => {
    assert.throws(
      () => resolveLsportsRmqConfig('inplay', { LSPORTS_RMQ_PASSWORD: 'x' }),
      (error: unknown) => error instanceof LsportsConfigError && error.code === 'CONFIG_USERNAME_MISSING',
    );
  });

  it('fails closed when password is missing', () => {
    assert.throws(
      () => resolveLsportsRmqConfig('inplay', { LSPORTS_RMQ_USERNAME: 'x' }),
      (error: unknown) => error instanceof LsportsConfigError && error.code === 'CONFIG_PASSWORD_MISSING',
    );
  });

  it('rejects a bad port', () => {
    assert.throws(
      () => resolveLsportsRmqConfig('inplay', { ...SHARED, LSPORTS_INPLAY_PORT: '99999' }),
      (error: unknown) => error instanceof LsportsConfigError && error.code === 'CONFIG_PORT_INVALID',
    );
  });
});

describe('lsports diagnostics stay secret-free', () => {
  it('does not serialize username or password', () => {
    const config = resolveLsportsRmqConfig('inplay', SHARED);
    const json = serializeDiagnostic(publicLsportsConfig(config));
    const redacted = serializeDiagnostic(config);
    assert.equal(json.includes('shared-secret'), false);
    assert.equal(json.includes('shared-user'), false);
    assert.equal(redacted.includes('shared-secret'), false);
    assert.equal(containsSecret(json, [config.password, config.username]), false);
    assert.match(redacted, /\[redacted\]/);
  });

  it('does not use VITE secrets in LSports modules', () => {
    const config = read('server/lsports/config.ts');
    const probe = read('server/lsports/probe.ts');
    const rmq = read('server/lsports/rmq.ts');
    const script = read('scripts/run-lsports-probe.ts');
    const observe = read('scripts/run-lsports-observe.ts');
    const typeCapture = read('scripts/run-lsports-type-capture.ts');
    const distribution = read('server/lsports/distribution.ts');
    const snapshot = read('server/lsports/snapshot.ts');
    const snapshotScript = read('scripts/run-lsports-snapshot.ts');
    const scoresMarketsScript = read('scripts/run-lsports-snapshot-scores-markets.ts');
    const stateStore = read('server/lsports/state/store.ts');
    const stateRecovery = read('server/lsports/state/recovery.ts');
    const stateCoordinator = read('server/lsports/state/coordinator.ts');
    const stateSettlement = read('server/lsports/state/settlement.ts');
    const statePlan = read('server/lsports/state/plan.ts');
    const stateRateLimit = read('server/lsports/state/rateLimit.ts');
    const adapterAdapt = read('server/lsports/adapter/adapt.ts');
    const adapterConfig = read('server/lsports/adapter/config.ts');
    const adapterPublish = read('server/lsports/adapter/publish.ts');
    const adapterMarkets = read('server/lsports/adapter/markets.ts');
    const adapterEvent = read('server/lsports/adapter/event.ts');
    const adapterPrematch = read('server/lsports/adapter/prematchAdapt.ts');
    const adapterPrematchMarkets = read('server/lsports/adapter/prematchMarkets.ts');
    const prematchRuntime = read('server/lsports/prematch/runtime.ts');
    const prematchPayload = read('server/lsports/prematch/payload.ts');
    const bridgePayload = read('server/lsports/bridge/payload.ts');
    const bridgePublisher = read('server/lsports/bridge/publisher.ts');
    const bridgeHttp = read('server/lsports/bridge/http.ts');
    const bridgeRuntime = read('server/lsports/bridge/runtime.ts');
    const bridgeIo = read('server/lsports/bridge/io.ts');
    const bridgeStatus = read('server/lsports/bridge/status.ts');
    const bridgeCors = read('server/lsports/bridge/cors.ts');
    const bridgeRate = read('server/lsports/bridge/rateLimitHttp.ts');
    const shadowScript = read('scripts/run-lsports-shadow.ts');
    const workerScript = read('scripts/run-lsports-worker.ts');
    const sdkMode = read('server/lsports/sdk/mode.ts');
    const sdkWriter = read('server/lsports/sdk/writer.ts');
    const sdkShadow = read('server/lsports/sdk/shadow.ts');
    const sdkKeepAlive = read('server/lsports/sdk/keepalive.ts');
    const sdkFeed = read('server/lsports/sdk/feed.ts');
    const sdkOrder = read('server/lsports/sdk/order.ts');
    const sdkHealth = read('server/lsports/sdk/health.ts');
    const sdkClassify = read('server/lsports/sdk/classify.ts');
    const sdkCustomers = read('server/lsports/sdk/customers.ts');
    const sdkSnapshotIo = read('server/lsports/sdk/snapshotIo.ts');
    const sdkLogger = read('server/lsports/sdk/logger.ts');
    const sdkPayload = read('server/lsports/sdk/payload.ts');
    const sdkMq = read('server/lsports/sdk/mqSettings.ts');
    const sdkConstants = read('server/lsports/sdk/constants.ts');
    const sdkEntityKeys = read('server/lsports/sdk/entityKeys.ts');
    const sdkOrderScript = read('scripts/run-lsports-sdk-order.ts');
    for (const src of [config, probe, rmq, script, observe, typeCapture, distribution, snapshot, snapshotScript, scoresMarketsScript, stateStore, stateRecovery, stateCoordinator, stateSettlement, statePlan, stateRateLimit, adapterAdapt, adapterConfig, adapterPublish, adapterMarkets, adapterEvent, adapterPrematch, adapterPrematchMarkets, prematchRuntime, prematchPayload, bridgePayload, bridgePublisher, bridgeHttp, bridgeRuntime, bridgeIo, bridgeStatus, bridgeCors, bridgeRate, shadowScript, workerScript, sdkMode, sdkWriter, sdkShadow, sdkKeepAlive, sdkFeed, sdkOrder, sdkHealth, sdkClassify, sdkCustomers, sdkSnapshotIo, sdkLogger, sdkPayload, sdkMq, sdkConstants, sdkEntityKeys, sdkOrderScript]) {
      assert.equal(src.includes('VITE_'), false);
      assert.equal(src.includes(['264', '390-'].join('')), false);
    }
    const workerEnv = read('deploy/lsports-worker.env.example');
    const vercelEnv = read('deploy/vercel.lsports.env.example');
    assert.match(workerEnv, /LSPORTS_RMQ_USERNAME=/);
    assert.match(workerEnv, /LSPORTS_TRANSPORT=direct/);
    assert.equal(workerEnv.includes('VITE_'), false);
    assert.match(vercelEnv, /VITE_LSPORTS_DISPLAY_FEED=1/);
    assert.match(vercelEnv, /VITE_LSPORTS_FEED_BASE_URL=/);
    assert.equal(vercelEnv.includes('LSPORTS_RMQ_PASSWORD'), false);
  });
});

describe('lsports probe budget', () => {
  it('stops after required type 2 and type 3 samples', () => {
    assert.equal(probeBudget(true, 0, 1), 'samples-captured');
    assert.equal(probeBudget(false, 0, 1), 'continue');
  });

  it('bounds the probe timeout to 60 seconds', () => {
    assert.equal(LSPORTS_PROBE_TIMEOUT_MS, 60_000);
    assert.equal(probeBudget(false, 0, 60_000), 'timeout');
    assert.equal(probeBudget(false, 0, 59_999), 'continue');
  });

  it('maps STM types to gitignored typed sample paths', () => {
    assert.equal(sampleKindForMessageType(32), null);
    assert.equal(sampleKindForMessageType(1), 'fixture');
    assert.equal(sampleKindForMessageType(2), 'livescore');
    assert.equal(sampleKindForMessageType(3), 'markets');
    assert.equal(
      samplePayloadPath('inplay', 'livescore', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-livescore-sample.json',
    );
    assert.equal(
      samplePayloadPath('inplay', 'markets', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-markets-sample.json',
    );
    assert.equal(
      samplePayloadPath('inplay', 'fixture', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-fixture-sample.json',
    );
    assert.equal(
      samplePayloadPath('prematch', 'markets', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/prematch-markets-sample.json',
    );
  });

  it('pretty-prints parsed JSON without transforming fields', () => {
    const payload = { Header: { Type: 2 }, Body: { Events: [] } };
    assert.equal(formatSampleJson(payload), `${JSON.stringify(payload, null, 2)}\n`);
  });

  it('bounds the inplay delta observe session', () => {
    assert.equal(LSPORTS_OBSERVE_TIMEOUT_MS, 120_000);
    assert.equal(LSPORTS_OBSERVE_MAX_MESSAGES, 100);
    const base = {
      received: 0,
      startedAt: 0,
      now: 1,
      hasFixture: false,
      hasMarketPair: false,
      hasSameFixtureLivescore: false,
    };
    assert.equal(observeBudget(base), 'continue');
    assert.equal(observeBudget({ ...base, hasFixture: true, hasMarketPair: true, hasSameFixtureLivescore: true }), 'samples-captured');
    assert.equal(observeBudget({ ...base, now: 120_000 }), 'timeout');
    assert.equal(observeBudget({ ...base, received: 100 }), 'max-messages');
    assert.equal(
      observationSamplePath('inplay-market-update-1.json', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-market-update-1.json',
    );
    assert.equal(
      type3MatchesTrackedMarket({
        Body: { Events: [{ FixtureId: 99, Markets: [{ Id: 59, Bets: [{ Id: 1 }] }] }] },
      }, 99, 59),
      true,
    );
    assert.equal(
      type3MatchesTrackedMarket({
        Body: { Events: [{ FixtureId: 99, Markets: [{ Id: 1, Bets: [{ Id: 1 }] }] }] },
      }, 99, 59),
      false,
    );
  });

  it('captures type 31 and 35 to gitignored sample paths', () => {
    assert.equal(LSPORTS_TYPE_CAPTURE_TIMEOUT_MS, 60_000);
    assert.equal(LSPORTS_TYPE_CAPTURE_MAX_MESSAGES, 100);
    assert.equal(typeSampleName(32), null);
    assert.equal(typeSampleName(31), 'inplay-type31-sample.json');
    assert.equal(typeSampleName(35), 'inplay-type35-sample.json');
    assert.equal(typeCaptureBudget({
      requiredCaptured: true,
      received: 1,
      startedAt: 0,
      now: 1,
    }), 'samples-captured');
    assert.equal(typeCaptureBudget({
      requiredCaptured: false,
      received: 0,
      startedAt: 0,
      now: 60_000,
    }), 'timeout');
    assert.equal(
      observationSamplePath('inplay-type31-sample.json', '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-type31-sample.json',
    );
  });

  it('summarizes JSON without dumping the payload', () => {
    const payload = {
      Header: { Type: 1, FixtureId: 99, PackageId: 4351 },
      Body: { Events: [{ FixtureId: 99 }] },
    };
    const { summary } = summarizeLsportsMessage('inplay', {
      content: Buffer.from(JSON.stringify(payload)),
      fields: { routingKey: 'odds' },
      properties: { contentType: 'application/json', headers: { source: 'lsports' } },
    } as never);
    assert.deepEqual(summary.topLevelKeys, ['Header', 'Body']);
    assert.deepEqual(summary.headerKeys, ['source']);
    assert.equal(summary.messageType, 1);
    assert.equal(summary.fixtureId, 99);
    assert.equal(summary.packageId, 4351);
    assert.equal(summary.routingKey, 'odds');
    assert.equal(JSON.stringify(summary).includes('Events'), false);
  });
});

describe('lsports error classification', () => {
  it('maps common RMQ failures without leaking secrets', () => {
    assert.equal(classifyRmqError({ code: 'ENOTFOUND', message: 'getaddrinfo' }), 'DNS_ERROR');
    assert.equal(classifyRmqError({ code: 'ECONNREFUSED' }), 'CONNECTION_REFUSED');
    assert.equal(classifyRmqError({ message: 'ACCESS-REFUSED login' }), 'AUTH_REFUSED');
    assert.equal(classifyRmqError({ message: 'vhost StmInPlay access' }), 'VHOST_REFUSED');
    assert.equal(classifyRmqError({ message: 'NOT_FOUND - no queue' }), 'QUEUE_NOT_FOUND');
    assert.equal(classifyRmqError({ code: 'ETIMEDOUT' }), 'TIMEOUT');
    assert.equal(classifyRmqError({ message: 'shared-secret' }), 'UNKNOWN');
  });
});

describe('lsports distribution status', () => {
  it('keeps status-only CLI off Distribution/Start', () => {
    assert.equal(
      LSPORTS_GET_DISTRIBUTION_STATUS_URL,
      'https://stm-api.lsports.eu/Package/GetDistributionStatus',
    );
    const statusScript = read('scripts/run-lsports-distribution-status.ts');
    assert.match(statusScript, /getDistributionStatus/);
    assert.equal(statusScript.includes('startDistribution'), false);
    assert.equal(statusScript.includes('Distribution/Start'), false);
  });

  it('builds PascalCase Start and redacts credentials', () => {
    assert.equal(LSPORTS_DISTRIBUTION_START_URL, 'https://stm-api.lsports.eu/Distribution/Start');
    const request = buildDistributionStartRequest(4351, 'shared-user', 'shared-secret');
    assert.equal(request.PackageId, 4351);
    assert.deepEqual(Object.keys(request).sort(), ['PackageId', 'Password', 'UserName'].sort());
    const json = serializeDiagnostic(request);
    assert.equal(json.includes('shared-secret'), false);
    assert.equal(json.includes('shared-user'), false);
    const startScript = read('scripts/run-lsports-distribution-start.ts');
    assert.match(startScript, /startDistribution/);
    assert.match(startScript, /getDistributionStatus/);
    assert.equal(startScript.includes('runLsportsProbe'), false);
  });

  it('builds a PackageId status request and redacts credentials', () => {
    const request = buildGetDistributionStatusRequest(4351, 'shared-user', 'shared-secret');
    assert.equal(request.packageId, 4351);
    assert.deepEqual(Object.keys(request).sort(), ['packageId', 'password', 'userName'].sort());
    const json = serializeDiagnostic(request);
    assert.equal(json.includes('shared-secret'), false);
    assert.equal(json.includes('shared-user'), false);
    assert.equal(containsSecret(json, ['shared-secret', 'shared-user']), false);
  });

  it('reads isDistributionOn and credential acceptance from the official envelope', () => {
    assert.equal(readIsDistributionOn({ body: { isDistributionOn: false } }), false);
    assert.equal(readIsDistributionOn({ Body: { IsDistributionOn: true } }), true);
    assert.deepEqual(readDistributionConsumers({ Body: { Consumers: null } }), null);
    assert.equal(readNumberMessagesInQueue({ Body: { NumberMessagesInQueue: 0 } }), 0);
    assert.equal(readMessagesPerSecond({ Body: { MessagesPerSecond: 0 } }), 0);
    assert.equal(readDistributionConsumerCount({ Body: { Consumers: 1 } }), 1);
    assert.equal(readDistributionStartMessage({ Body: 'Success' }), 'Success');
    assert.equal(isDistributionStartSuccess(200, { Body: 'Success' }), true);
    assert.equal(isDistributionAlreadyActiveMessage({ Body: 'Distribution is already Active' }), true);
    assert.equal(isDistributionStartSuccess(200, { Body: 'Distribution is already Active' }), true);
    assert.equal(isDistributionStartSuccess(403, { Body: 'Success' }), false);
    assert.equal(inferCredentialsAccepted(200, { header: { errors: [] } }), true);
    assert.equal(inferCredentialsAccepted(401, {}), false);
    assert.equal(
      inferCredentialsAccepted(200, { header: { errors: [{ message: 'Invalid username or password' }] } }),
      false,
    );
  });

  it('treats HTTP 200 Success and already Active as Start success', async () => {
    const urls: string[] = [];
    const already = await startDistributionAcceptingActive('inplay', SHARED, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ Body: 'Distribution is already Active' });
          },
        } as Response;
      },
      log: () => {},
    });
    assert.equal(already.alreadyActive, true);
    assert.equal(already.httpStatus, 200);
    assert.deepEqual(urls, [LSPORTS_DISTRIBUTION_START_URL]);

    const started = await startDistributionAcceptingActive('inplay', SHARED, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ Body: 'Success' });
        },
      }) as Response,
      log: () => {},
    });
    assert.equal(started.alreadyActive, false);
    assert.equal(started.httpStatus, 200);
  });
});

describe('lsports inplay snapshot', () => {
  it('builds a football GetFixtures request and redacts credentials', () => {
    assert.equal(LSPORTS_INPLAY_GET_FIXTURES_URL, 'https://stm-snapshot.lsports.eu/InPlay/GetFixtures');
    assert.equal(LSPORTS_FOOTBALL_SPORT_ID, 6046);
    const request = buildGetFixturesRequest(4351, 'shared-user', 'shared-secret', [LSPORTS_FOOTBALL_SPORT_ID]);
    assert.deepEqual(Object.keys(request).sort(), ['packageId', 'password', 'sports', 'userName'].sort());
    assert.equal(request.packageId, 4351);
    assert.deepEqual(request.sports, [6046]);
    const json = serializeDiagnostic(request);
    assert.equal(json.includes('shared-secret'), false);
    assert.equal(json.includes('shared-user'), false);
    assert.equal(
      snapshotSamplePath(LSPORTS_SNAPSHOT_FOOTBALL_SAMPLE, '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-snapshot-football.json',
    );
    assert.equal(readSnapshotFixtures({ Body: [{ FixtureId: 1 }, { FixtureId: 2 }] }).length, 2);
    const snapshotScript = read('scripts/run-lsports-snapshot.ts');
    assert.match(snapshotScript, /fetchInPlayFootballFixtures/);
    assert.equal(snapshotScript.includes('runLsportsProbe'), false);
    assert.equal(snapshotScript.includes('PreMatch'), false);
    assert.equal(read('server/lsports/snapshot.ts').includes('/InPlay/GetEvents'), false);
    assert.match(read('server/lsports/snapshot.ts'), /\/PreMatch\/GetEvents/);
    assert.match(read('server/lsports/snapshot.ts'), /\/PreMatch\/GetFixtures/);
    assert.match(read('server/lsports/snapshot.ts'), /\/PreMatch\/GetFixtureMarkets/);
  });

  it('builds timestamp-filtered scores and markets requests', () => {
    assert.equal(LSPORTS_INPLAY_GET_SCORES_URL, 'https://stm-snapshot.lsports.eu/InPlay/GetScores');
    assert.equal(
      LSPORTS_INPLAY_GET_FIXTURE_MARKETS_URL,
      'https://stm-snapshot.lsports.eu/InPlay/GetFixtureMarkets',
    );
    assert.equal(LSPORTS_SNAPSHOT_MIN_INTERVAL_MS, 1_100);
    const request = buildSnapshotFilteredRequest(4351, 'shared-user', 'shared-secret', [6046], 1788303130625);
    assert.equal(request.timestamp, 1788303130625);
    assert.deepEqual(request.sports, [6046]);
    const json = serializeDiagnostic(request);
    assert.equal(json.includes('shared-secret'), false);
    assert.equal(
      snapshotSamplePath(LSPORTS_SNAPSHOT_SCORES_SAMPLE, '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-snapshot-scores.json',
    );
    assert.equal(
      snapshotSamplePath(LSPORTS_SNAPSHOT_MARKETS_SAMPLE, '/repo').replaceAll('\\', '/'),
      '/repo/.tmp/lsports/inplay-snapshot-markets.json',
    );
    assert.equal(
      readHeaderServerTimestamp({ Header: { Type: 32, ServerTimestamp: 1788303130625 } }),
      1788303130625,
    );
    const script = read('scripts/run-lsports-snapshot-scores-markets.ts');
    assert.match(script, /fetchInPlayFootballScores/);
    assert.match(script, /fetchInPlayFootballFixtureMarkets/);
    assert.match(script, /captureInPlayHeartbeatTimestamp/);
    assert.equal(script.includes('PreMatch'), false);
  });
});

describe('betsapi hardcoded token removed', () => {
  it('has zero leftover BetsAPI fallback token prefixes in sports cache modules', () => {
    const catalog = read('api/sports/catalog-cache.js');
    const inplay = read('api/sports/inplay-cache.js');
    const tokenPrefix = ['264', '390-'].join('');
    assert.equal(catalog.includes(tokenPrefix), false);
    assert.equal(inplay.includes(tokenPrefix), false);
    assert.match(catalog, /getBetsApiGatewayToken\(\)/);
    assert.match(inplay, /getBetsApiGatewayToken\(\)/);
  });
});
