/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.3-debug',
  versionCode: 5,
  fileName: 'NextPari-0.2.3-debug-D7240321.apk',
  publicPath: '/downloads/NextPari-0.2.3-debug-D7240321.apk',
  bytes: 49_741_640,
  sha256: 'D72403215327AD4441B76BD0A596552DCCC85A7929672E75E6E208BC329D2536',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.2-debug',
  versionCode: 4,
  fileName: 'NextPari-0.2.2-debug-7E3A99BC.apk',
  publicPath: '/downloads/NextPari-0.2.2-debug-7E3A99BC.apk',
  bytes: 49_741_636,
  sha256: '7E3A99BCEDFE2D94D0BDE9873F6DEB17191D91E88BA55C3ADA64EF5AFB68747D',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
