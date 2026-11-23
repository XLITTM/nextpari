/** Debug tester APK metadata. Not a public Play Store release. */
export const ANDROID_APK_PAGE_PATH = '/android';

export const ANDROID_APK = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.5-debug',
  versionCode: 7,
  fileName: 'NextPari-0.2.5-debug-810135C8.apk',
  publicPath: '/downloads/NextPari-0.2.5-debug-810135C8.apk',
  bytes: 49_758_056,
  sha256: '810135C850172A2E1D30C09272FE0415C7208243BA748076E9301111DCA9128C',
  channel: 'debug-test',
  testNotice: 'Тестовая версия — для тестирования.',
} as const;

export const ANDROID_APK_PREVIOUS = {
  packageName: 'com.nextpari.app.debug',
  versionName: '0.2.4-debug',
  versionCode: 6,
  fileName: 'NextPari-0.2.4-debug-A8967702.apk',
  publicPath: '/downloads/NextPari-0.2.4-debug-A8967702.apk',
  bytes: 49_758_056,
  sha256: 'A89677028211777887295A2CD63C9451988781995C6B338A0E99E508CF630D0F',
} as const;

export function formatAndroidApkSize(bytes = ANDROID_APK.bytes): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
