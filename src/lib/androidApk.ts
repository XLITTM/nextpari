/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.8-debug',
  versionCode: 10,
  fileName: 'NextPari-0.2.8-debug-E6525720.apk',
  publicPath: '/downloads/NextPari-0.2.8-debug-E6525720.apk',
  bytes: 49_807_308,
  sha256: 'E652572020C3F74F56F359CA3B3B47E1DAF026E152989EA00DBAE4D0AD199694',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.7-debug',
  versionCode: 9,
  fileName: 'NextPari-0.2.7-debug-ECBB9001.apk',
  publicPath: '/downloads/NextPari-0.2.7-debug-ECBB9001.apk',
  bytes: 49_790_896,
  sha256: 'ECBB9001AAF041F6A5718CB917C7B7468A92C3461FFCDCF723628FFB2958AEDB',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
