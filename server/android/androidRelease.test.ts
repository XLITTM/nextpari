import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AndroidReleaseService,
  MemoryAndroidReleaseRepository,
  MemoryArtifactStore,
  artifactKeyFor,
  sha256Hex,
  type AndroidReleasePorts,
  type ApkIdentity,
} from './androidRelease.js';
import { handleOwnerAndroidRelease, handlePublicAndroidDownload, handlePublicAndroidRelease } from './androidReleaseHttp.js';

const CERT = 'ab'.repeat(32);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(Buffer.concat([local, nameBuf, data]));
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += locals[locals.length - 1].length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

function officialApk(packageName = 'com.nextpari.app', note = ''): Buffer {
  return zip({
    'AndroidManifest.xml': `package=${packageName}${note}`,
    'META-INF/CERT.SF': 'signature',
    'META-INF/CERT.RSA': 'certificate',
  });
}

function draftFrom(bytes: Buffer, versionCode = 2, versionName = '0.3.0') {
  return {
    versionCode,
    versionName,
    releaseNotes: 'Первый официальный выпуск Android.',
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
    minSdk: 26,
    certificateSha256: CERT,
    effectiveOn: '2026-10-28',
  };
}

function identityFor(bytes: Buffer, versionCode = 2): ApkIdentity {
  const text = bytes.toString('latin1');
  return {
    packageName: text.includes('com.nextpari.app.debug') ? 'com.nextpari.app.debug' : 'com.nextpari.app',
    versionCode: text.includes(' build-2') ? 3 : versionCode,
    certificateSha256: CERT,
    sha256: sha256Hex(bytes),
    schemeV2: true,
    schemeV3: false,
  };
}

function service(bytes?: Buffer, ready = true, fingerprint: string | null = CERT, verifyApk?: AndroidReleasePorts['verifyApk']) {
  const repo = new MemoryAndroidReleaseRepository();
  const artifacts = new MemoryArtifactStore(ready);
  if (bytes) artifacts.put(artifactKeyFor(2, sha256Hex(bytes)), bytes);
  const ports: AndroidReleasePorts = {
    repo,
    artifacts,
    certificateSha256: fingerprint,
    storageHost: 'storage.nextpari.test',
    verifyApk: verifyApk ?? (async (body) => identityFor(body)),
    now: () => new Date('2026-10-28T12:00:00.000Z'),
  };
  return { service: new AndroidReleaseService(ports), repo, artifacts, ports };
}

function response() {
  const state = { status: 0, headers: {} as Record<string, string | string[]>, body: undefined as unknown };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    setHeader(name: string, value: string | string[]) {
      state.headers[name] = value;
      return res;
    },
    json(body: unknown) {
      state.body = body;
    },
    end(body?: string | Buffer) {
      state.body = body;
    },
  };
  return { res, state };
}

describe('android release catalog', () => {
  it('stays unpublished and does not offer a file before publication', async () => {
    const { ports } = service();
    const { res, state } = response();
    await handlePublicAndroidRelease({ method: 'GET', headers: {} }, res, { ports });
    assert.deepEqual(state.body, { ok: true, published: false });
    const download = response();
    await handlePublicAndroidDownload({ method: 'GET', headers: {} }, download.res, { ports });
    assert.equal(download.state.status, 404);
    assert.equal((download.state.body as { error: string }).error, 'ANDROID_RELEASE_UNPUBLISHED');
  });

  it('rejects a remote APK URL, a debug package, a bad checksum, and a missing signature', async () => {
    const { service: releases } = service();
    await assert.rejects(
      () => releases.createDraft('owner-1', { ...draftFrom(officialApk()), artifactUrl: 'https://evil.example/app.apk' }),
      /ARTIFACT_URL_FORBIDDEN/,
    );
    const debug = officialApk('com.nextpari.app.debug');
    const { service: debugRelease } = service(debug, true, CERT, async (body) => identityFor(body));
    await debugRelease.createDraft('owner-1', draftFrom(debug));
    await assert.rejects(() => debugRelease.publish('owner-1', 2), /APK_DEBUG_PACKAGE/);
    const bytes = officialApk();
    const { service: ready, artifacts } = service(bytes);
    await ready.createDraft('owner-1', draftFrom(bytes));
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 8] ^= 0xff;
    artifacts.put(artifactKeyFor(2, sha256Hex(bytes)), tampered);
    await assert.rejects(() => ready.publish('owner-1', 2), /APK_SHA256_MISMATCH/);
    const jarOnly = officialApk();
    const { service: unsigned } = service(jarOnly, true, CERT, async () => ({
      packageName: 'com.nextpari.app',
      versionCode: 2,
      certificateSha256: CERT,
      sha256: sha256Hex(jarOnly),
      schemeV2: false,
      schemeV3: false,
    }));
    await unsigned.createDraft('owner-1', draftFrom(jarOnly));
    await assert.rejects(() => unsigned.publish('owner-1', 2), /APK_SIGNATURE_INVALID/);
    const { service: wrongVersion } = service(jarOnly, true, CERT, async (body) => ({
      ...identityFor(body),
      versionCode: 9,
    }));
    await wrongVersion.createDraft('owner-1', draftFrom(jarOnly));
    await assert.rejects(() => wrongVersion.publish('owner-1', 2), /APK_VERSION_CODE_MISMATCH/);
  });

  it('redirects the latest download and does not cache or return the APK bytes', async () => {
    const bytes = officialApk();
    const { service: ready, ports, repo, artifacts } = service(bytes);
    let readCalled = false;
    const original = artifacts.read.bind(artifacts);
    artifacts.read = async (key) => {
      readCalled = true;
      return original(key);
    };
    await ready.createDraft('owner-1', draftFrom(bytes));
    const published = await ready.publish('owner-1', 2);
    assert.equal(published.status, 'published');
    const again = await ready.publish('owner-1', 2);
    assert.equal(again.publishedAt, published.publishedAt);
    assert.equal(published.artifactKey, `com.nextpari.app/2/${sha256Hex(bytes)}.apk`);
    readCalled = false;
    const redirect = await ready.downloadRedirect();
    assert.equal(readCalled, false);
    assert.equal(redirect.location.startsWith('https://storage.nextpari.test/'), true);
    assert.equal(redirect.location.includes(published.artifactKey), true);
    const download = response();
    await handlePublicAndroidDownload({ method: 'GET', headers: {} }, download.res, { ports });
    assert.equal(download.state.status, 302);
    assert.equal(download.state.headers.Location, redirect.location);
    assert.equal(download.state.headers['Cache-Control'], 'no-store');
    assert.equal(String(download.state.headers['Cache-Control']).includes('immutable'), false);
    assert.equal(download.state.body, undefined);
    const { res, state } = response();
    await handlePublicAndroidRelease({ method: 'GET', headers: {} }, res, { ports });
    const body = state.body as { published: boolean; downloadPath: string; sha256: string };
    assert.equal(body.published, true);
    assert.equal(body.downloadPath, '/api/android/release/download');
    assert.equal(body.sha256, sha256Hex(bytes));
    assert.equal(repo.audits.some((row) => row.action === 'publish' && row.actorId === 'owner-1'), true);
  });

  it('keeps version order and rolls the published pointer back without deleting the artifact', async () => {
    const first = officialApk();
    const second = officialApk('com.nextpari.app', ' build-2');
    const { service: ready, artifacts } = service(first);
    await ready.createDraft('owner-1', draftFrom(first, 2, '0.3.0'));
    artifacts.put(artifactKeyFor(2, sha256Hex(first)), first);
    await ready.publish('owner-1', 2);
    await ready.createDraft('owner-1', draftFrom(second, 3, '0.4.0'));
    artifacts.put(artifactKeyFor(3, sha256Hex(second)), second);
    await ready.publish('owner-1', 3);
    await assert.rejects(() => ready.createDraft('owner-1', draftFrom(first, 2, '0.3.1')), /VERSION_EXISTS|VERSION_NOT_NEWER/);
    const restored = await ready.rollback('owner-1');
    assert.equal(restored.versionCode, 2);
    assert.equal(restored.status, 'published');
    const rows = await ready.ownerView();
    assert.equal(rows.releases.find((row) => row.versionCode === 3)?.status, 'retired');
    assert.equal(await artifacts.read(artifactKeyFor(3, sha256Hex(second))) !== null, true);
  });

  it('refuses the banner, a forced update, and publication without signing or storage', async () => {
    const bytes = officialApk();
    const { service: ready } = service(bytes);
    await assert.rejects(
      () => ready.updateBanner('owner-1', { enabled: true, title: 'Nextpari для Android', body: 'Скачайте официальное приложение' }),
      /BANNER_REQUIRES_PUBLISHED_RELEASE/,
    );
    await assert.rejects(() => ready.updatePolicy('owner-1', { mode: 'forced', minimumVersionCode: 1 }), /FORCED_UPDATE_FORBIDDEN/);
    const unsigned = service(bytes, true, null);
    await assert.rejects(() => unsigned.service.createDraft('owner-1', draftFrom(bytes)), /ANDROID_RELEASE_SIGNING_UNCONFIGURED/);
    const unstored = service(undefined, false);
    await unstored.service.createDraft('owner-1', draftFrom(bytes));
    await assert.rejects(() => unstored.service.publish('owner-1', 2), /ANDROID_RELEASE_STORAGE_UNAVAILABLE/);
  });

  it('allows only an owner session to administer releases', async () => {
    const { ports } = service();
    const denied = response();
    await handleOwnerAndroidRelease(
      { method: 'GET', headers: {} },
      denied.res,
      '/api/owner/android-releases',
      { ports, authorize: async () => { throw new Error('OWNER_REQUIRED'); } },
    );
    assert.equal(denied.state.status, 403);
    assert.equal((denied.state.body as { error: string }).error, 'OWNER_REQUIRED');
    const allowed = response();
    await handleOwnerAndroidRelease(
      { method: 'GET', headers: { cookie: 'nextpari_owner_access=present' } },
      allowed.res,
      '/api/owner/android-releases',
      { ports, authorize: async () => ({ actorId: 'owner-1' }) },
    );
    assert.equal(allowed.state.status, 200);
    assert.equal((allowed.state.body as { signingReady: boolean }).signingReady, true);
  });

  it('does not import player money code or trust a caller-supplied download URL', () => {
    const source = [
      'server/android/androidRelease.ts',
      'server/android/androidReleaseHttp.ts',
      'server/android/androidReleaseStore.ts',
    ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
    assert.equal(source.includes('player_wallets'), false);
    assert.equal(source.includes('wallet_ledger'), false);
    assert.equal(source.includes('artifactUrl'), true);
    assert.equal(source.includes('downloadPath: ANDROID_DOWNLOAD_PATH'), true);
    assert.equal(source.includes('res.end(file.bytes)'), false);
    assert.equal(source.includes('immutable'), false);
    assert.equal(source.includes('META-INF'), false);
    assert.equal(source.includes('createSignedUrl(key, ANDROID_DOWNLOAD_URL_TTL_SECONDS)'), true);
    const hash = createHash('sha256').update(officialApk()).digest('hex');
    assert.equal(hash.length, 64);
  });
});
