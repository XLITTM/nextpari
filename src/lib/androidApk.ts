/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.2-debug',
  versionCode: 4,
  fileName: 'NextPari-0.2.2-debug-7E3A99BC.apk',
  publicPath: '/downloads/NextPari-0.2.2-debug-7E3A99BC.apk',
  bytes: 49_741_636,
  sha256: '7E3A99BCEDFE2D94D0BDE9873F6DEB17191D91E88BA55C3ADA64EF5AFB68747D',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.1-debug',
  versionCode: 3,
  fileName: 'NextPari-0.2.1-debug-6B449AC9.apk',
  publicPath: '/downloads/NextPari-0.2.1-debug-6B449AC9.apk',
  bytes: 49_578_864,
  sha256: '6B449AC98620B0369B7E4714FC6411485EB554A2B3E55A888B8F03A638645275',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
