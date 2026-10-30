import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { ANDROID_DOWNLOAD_URL_TTL_SECONDS, assertSignedDownloadUrl } from './androidRelease.js';
import { parseAaptBadging, parseApksignerVerify, verifyPreparedApk } from './apkVerify.js';

const CERT = 'cd'.repeat(32);
const SIGNED = `
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Signer #1 certificate SHA-256 digest: ${CERT}
`;
const JAR_ONLY = `
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): false
Verified using v3 scheme (APK Signature Scheme v3): false
Signer #1 certificate SHA-256 digest: ${CERT}
`;

describe('apksigner release preparation', () => {
  it('rejects a JAR META-INF signature when apksigner does not verify v2 or v3', () => {
    assert.throws(() => parseApksignerVerify(JAR_ONLY, 0), /APK_SIGNATURE_INVALID/);
    assert.throws(() => parseApksignerVerify(SIGNED, 1), /APK_SIGNATURE_INVALID/);
  });

  it('reads the certificate, package id, and versionCode from the tool output', () => {
    const signature = parseApksignerVerify(SIGNED, 0);
    assert.equal(signature.schemeV2, true);
    assert.equal(signature.certificateSha256, CERT);
    const manifest = parseAaptBadging("package: name='com.nextpari.app' versionCode='2' versionName='0.3.0'", 0);
    assert.deepEqual(manifest, { packageName: 'com.nextpari.app', versionCode: 2 });
    const debug = parseAaptBadging("package: name='com.nextpari.app.debug' versionCode='2' versionName='0.3.0-debug'", 0);
    assert.equal(debug.packageName, 'com.nextpari.app.debug');
  });

  it('does not treat a zip that merely contains META-INF as a signed release', async () => {
    const bytes = Buffer.from('PK\u0003\u0004META-INF/CERT.SF META-INF/CERT.RSA AndroidManifest.xml com.nextpari.app');
    await assert.rejects(
      () => verifyPreparedApk(bytes, {
        async apksigner() {
          return { code: 1, stdout: JAR_ONLY, stderr: 'DOES NOT VERIFY' };
        },
        async aapt() {
          return { code: 0, stdout: "package: name='com.nextpari.app' versionCode='2' versionName='0.3.0'", stderr: '' };
        },
      }),
      /APK_SIGNATURE_INVALID/,
    );
  });

  it('checks package id, versionCode, and SHA-256 from the prepared file', async () => {
    const bytes = Buffer.from('official-bytes');
    const identity = await verifyPreparedApk(bytes, {
      async apksigner() {
        return { code: 0, stdout: SIGNED, stderr: '' };
      },
      async aapt() {
        return { code: 0, stdout: "package: name='com.other.app' versionCode='9' versionName='9.0.0'", stderr: '' };
      },
    });
    assert.equal(identity.packageName, 'com.other.app');
    assert.equal(identity.versionCode, 9);
    assert.equal(identity.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.notEqual(identity.versionCode, 2);
    assert.notEqual(identity.packageName, 'com.nextpari.app');
  });

  it('allows only a short https redirect on the configured storage host', () => {
    const key = 'com.nextpari.app/2/' + 'ab'.repeat(32) + '.apk';
    const trusted = `https://storage.nextpari.test/storage/v1/object/sign/android-releases/${key}?token=temp`;
    assert.equal(assertSignedDownloadUrl(trusted, key, 'storage.nextpari.test'), trusted);
    assert.throws(() => assertSignedDownloadUrl('https://evil.example/app.apk', key, 'storage.nextpari.test'), /APK_REDIRECT_UNTRUSTED/);
    assert.throws(() => assertSignedDownloadUrl('http://storage.nextpari.test/storage/v1/object/sign/android-releases/' + key, key, 'storage.nextpari.test'), /APK_REDIRECT_UNTRUSTED/);
    assert.ok(ANDROID_DOWNLOAD_URL_TTL_SECONDS <= 120);
    assert.equal(ANDROID_DOWNLOAD_URL_TTL_SECONDS < 31536000, true);
  });
});
