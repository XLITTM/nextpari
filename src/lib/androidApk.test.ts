import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_APK,
  ANDROID_APK_PAGE_PATH,
  ANDROID_APK_PREVIOUS,
  formatAndroidApkSize,
} from './androidApk.js';

function downloadsFile(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'downloads', name);
}

test('debug APK listing is a versioned tester artifact, not a production release', () => {
  assert.equal(ANDROID_APK.packageName, 'com.nextpari.app.debug');
  assert.equal(ANDROID_APK.versionName, '0.2.3-debug');
  assert.equal(ANDROID_APK.versionCode, 5);
  assert.equal(ANDROID_APK.channel, 'debug-test');
  assert.equal(ANDROID_APK.testNotice, 'Тестовая версия — для тестирования.');
  assert.equal(ANDROID_APK_PAGE_PATH, '/android');
  assert.match(ANDROID_APK.publicPath, /^\/downloads\/NextPari-0\.2\.3-debug-[0-9A-Fa-f]{8}\.apk$/);
  assert.equal(ANDROID_APK.fileName, 'NextPari-0.2.3-debug-D7240321.apk');
  assert.equal(ANDROID_APK.bytes, 49_741_640);
  assert.equal(ANDROID_APK.sha256, 'D72403215327AD4441B76BD0A596552DCCC85A7929672E75E6E208BC329D2536');
  assert.equal(ANDROID_APK.sha256.length, 64);
  assert.equal(formatAndroidApkSize(), '47.4 МБ');
  assert.notEqual(ANDROID_APK.fileName, ANDROID_APK_PREVIOUS.fileName);
  assert.equal(ANDROID_APK_PREVIOUS.versionName, '0.2.2-debug');
  assert.equal(ANDROID_APK_PREVIOUS.versionCode, 4);
  assert.equal(ANDROID_APK_PREVIOUS.fileName, 'NextPari-0.2.2-debug-7E3A99BC.apk');
});

test('local APK matches published metadata when the artifact is present', () => {
  const apkPath = downloadsFile(ANDROID_APK.fileName);
  if (!existsSync(apkPath)) return;
  const bytes = readFileSync(apkPath);
  assert.equal(bytes.byteLength, ANDROID_APK.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), ANDROID_APK.sha256);
});

test('previous 0.2.2 APK remains available as a rollback artifact', () => {
  const apkPath = downloadsFile(ANDROID_APK_PREVIOUS.fileName);
  if (!existsSync(apkPath)) return;
  const bytes = readFileSync(apkPath);
  assert.equal(bytes.byteLength, ANDROID_APK_PREVIOUS.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), ANDROID_APK_PREVIOUS.sha256);
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
  const primary = vercel.headers?.find((row) => row.source?.includes(ANDROID_APK.fileName));
  const disposition = primary?.headers?.find((row) => row.key === 'Content-Disposition')?.value;
  assert.equal(disposition, `attachment; filename="${ANDROID_APK.fileName}"`);
  const previous = vercel.headers?.find((row) => row.source?.includes(ANDROID_APK_PREVIOUS.fileName));
  const previousDisposition = previous?.headers?.find((row) => row.key === 'Content-Disposition')?.value;
  assert.equal(previousDisposition, `attachment; filename="${ANDROID_APK_PREVIOUS.fileName}"`);
});
