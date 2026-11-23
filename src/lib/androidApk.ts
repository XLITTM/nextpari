/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.6-debug',
  versionCode: 8,
  fileName: 'NextPari-0.2.6-debug-CC9C1926.apk',
  publicPath: '/downloads/NextPari-0.2.6-debug-CC9C1926.apk',
  bytes: 49_774_468,
  sha256: 'CC9C19260333B17B4FCD6EF66BE05BC3713BB67ADA7C29CEDE149CAD6A693AA6',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.5-debug',
  versionCode: 7,
  fileName: 'NextPari-0.2.5-debug-810135C8.apk',
  publicPath: '/downloads/NextPari-0.2.5-debug-810135C8.apk',
  bytes: 49_758_056,
  sha256: '810135C850172A2E1D30C09272FE0415C7208243BA748076E9301111DCA9128C',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
