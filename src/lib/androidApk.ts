/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.7-debug',
  versionCode: 9,
  fileName: 'NextPari-0.2.7-debug-ECBB9001.apk',
  publicPath: '/downloads/NextPari-0.2.7-debug-ECBB9001.apk',
  bytes: 49_790_896,
  sha256: 'ECBB9001AAF041F6A5718CB917C7B7468A92C3461FFCDCF723628FFB2958AEDB',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.6-debug',
  versionCode: 8,
  fileName: 'NextPari-0.2.6-debug-CC9C1926.apk',
  publicPath: '/downloads/NextPari-0.2.6-debug-CC9C1926.apk',
  bytes: 49_774_468,
  sha256: 'CC9C19260333B17B4FCD6EF66BE05BC3713BB67ADA7C29CEDE149CAD6A693AA6',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
