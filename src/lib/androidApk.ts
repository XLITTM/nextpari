/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.0-debug',
  versionCode: 2,
  fileName: 'NextPari-0.2.0-debug-571dfe95.apk',
  publicPath: '/downloads/NextPari-0.2.0-debug-571dfe95.apk',
  bytes: 49_722_935,
  sha256: '571DFE9576AF079132AA79A2EEEC31AAE01349D5C7554441569C14A8DF694108',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
