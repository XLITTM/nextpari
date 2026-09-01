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
  LSPORTS_PROBE_MAX_MESSAGES,
  LSPORTS_PROBE_TIMEOUT_MS,
  probeBudget,
  samplePayloadPath,
  summarizeLsportsMessage,
} from './probe.js';
import { containsSecret, serializeDiagnostic } from './redact.js';
import { classifyRmqError } from './rmq.js';

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
    for (const src of [config, probe, rmq, script]) {
      assert.equal(src.includes('VITE_'), false);
      assert.equal(src.includes(['264', '390-'].join('')), false);
    }
  });
});

describe('lsports probe budget', () => {
  it('caps the probe at 5 messages', () => {
    assert.equal(LSPORTS_PROBE_MAX_MESSAGES, 5);
    assert.equal(probeBudget(5, 0, 1), 'max-messages');
    assert.equal(probeBudget(4, 0, 1), 'continue');
  });

  it('bounds the probe timeout to 60 seconds', () => {
    assert.equal(LSPORTS_PROBE_TIMEOUT_MS, 60_000);
    assert.equal(probeBudget(0, 0, 60_000), 'timeout');
    assert.equal(probeBudget(0, 0, 59_999), 'continue');
  });

  it('writes local samples only under .tmp/lsports', () => {
    assert.equal(samplePayloadPath('inplay', '/repo').replaceAll('\\', '/'), '/repo/.tmp/lsports/inplay-sample.json');
    assert.equal(samplePayloadPath('prematch', '/repo').replaceAll('\\', '/'), '/repo/.tmp/lsports/prematch-sample.json');
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
