import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ANDROID_APK, ANDROID_APK_PAGE_PATH, formatAndroidApkSize } from './androidApk.js';

test('debug APK listing is a versioned tester artifact, not a production release', () => {
  assert.equal(ANDROID_APK.packageName, 'com.nextpari.app.debug');
  assert.equal(ANDROID_APK.versionName, '0.2.1-debug');
  assert.equal(ANDROID_APK.versionCode, 3);
  assert.equal(ANDROID_APK.channel, 'debug-test');
  assert.equal(ANDROID_APK.testNotice, 'Тестовая версия — для тестирования.');
  assert.equal(ANDROID_APK_PAGE_PATH, '/android');
  assert.match(ANDROID_APK.publicPath, /^\/downloads\/NextPari-0\.2\.1-debug-[0-9A-Fa-f]{8}\.apk$/);
  assert.equal(ANDROID_APK.fileName, 'NextPari-0.2.1-debug-6B449AC9.apk');
  assert.equal(ANDROID_APK.bytes, 49_578_864);
  assert.equal(ANDROID_APK.sha256, '6B449AC98620B0369B7E4714FC6411485EB554A2B3E55A888B8F03A638645275');
  assert.equal(ANDROID_APK.sha256.length, 64);
  assert.equal(formatAndroidApkSize(), '47.3 МБ');
});

test('local APK matches published metadata when the artifact is present', () => {
  const apkPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'public',
    'downloads',
    ANDROID_APK.fileName,
  );
  if (!existsSync(apkPath)) return;
  const bytes = readFileSync(apkPath);
  assert.equal(bytes.byteLength, ANDROID_APK.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), ANDROID_APK.sha256);
});

test('Vercel SPA fallback does not swallow the APK path', () => {
  const vercelPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vercel.json');
  const vercel = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
    headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
  };
  const spa = vercel.rewrites?.find((row) => row.destination === '/index.html');
  assert.ok(spa?.source?.includes('downloads/'), spa?.source);
  const apkHeaders = vercel.headers?.find((row) => row.source?.includes('downloads/') && row.source.includes('apk'));
  const contentType = apkHeaders?.headers?.find((row) => row.key === 'Content-Type')?.value;
  assert.equal(contentType, 'application/vnd.android.package-archive');
  const disposition = apkHeaders?.headers?.find((row) => row.key === 'Content-Disposition')?.value;
  assert.equal(disposition, 'attachment; filename="NextPari-0.2.1-debug-6B449AC9.apk"');
});
