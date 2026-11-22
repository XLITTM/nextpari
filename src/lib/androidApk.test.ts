import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ANDROID_APK, ANDROID_APK_PAGE_PATH, formatAndroidApkSize } from './androidApk.js';

test('debug APK listing is a versioned tester artifact, not a production release', () => {
  assert.equal(ANDROID_APK.packageName, 'com.nextpari.app.debug');
  assert.equal(ANDROID_APK.versionName, '0.2.0-debug');
  assert.equal(ANDROID_APK.channel, 'debug-test');
  assert.equal(ANDROID_APK.testNotice, 'Тестовая версия — для тестирования.');
  assert.equal(ANDROID_APK_PAGE_PATH, '/android');
  assert.match(ANDROID_APK.publicPath, /^\/downloads\/NextPari-0\.2\.0-debug-[0-9a-f]{8}\.apk$/);
  assert.equal(ANDROID_APK.sha256.length, 64);
  assert.equal(formatAndroidApkSize(), '47.4 МБ');
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
});
