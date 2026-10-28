export const ANDROID_RELEASE_URL = '/api/android/release';
export const ANDROID_DOWNLOAD_PAGE = '/download';
export const ANDROID_BANNER_DISMISS_KEY = 'nextpari-android-apk-dismissed';

export type AndroidReleaseView =
  | { published: false }
  | {
      published: true;
      versionCode: number;
      versionName: string;
      releaseNotes: string;
      sizeBytes: number;
      releasedAt: string;
      effectiveOn: string;
      sha256: string;
      minSdk: number;
      downloadPath: string;
      banner: { enabled: boolean; title: string; body: string };
      update: { mode: 'none' | 'recommended'; minimumVersionCode: number };
    };

const GAME_PATH = /^\/games\/(blackjack|21|aviator|apples|crystal|dice|pharaoh)$/;

export function isFullScreenGamePath(pathname: string): boolean {
  return GAME_PATH.test(pathname.replace(/\/+$/, '') || '/');
}

export function shouldShowAndroidBanner(input: {
  release: AndroidReleaseView | null;
  pathname: string;
  dismissedVersion: string | null;
}): boolean {
  if (!input.release?.published || !input.release.banner.enabled) return false;
  if (isFullScreenGamePath(input.pathname) || input.pathname.replace(/\/+$/, '') === ANDROID_DOWNLOAD_PAGE) return false;
  return input.dismissedVersion !== String(input.release.versionCode);
}

export function readAndroidRelease(body: unknown): AndroidReleaseView {
  if (!body || typeof body !== 'object') return { published: false };
  const row = body as { published?: unknown };
  if (row.published !== true) return { published: false };
  const release = body as Exclude<AndroidReleaseView, { published: false }>;
  if (release.downloadPath !== '/api/android/release/download') return { published: false };
  if (!Number.isInteger(release.versionCode) || release.versionCode < 2) return { published: false };
  if (!/^[a-f0-9]{64}$/.test(release.sha256 ?? '')) return { published: false };
  return release;
}

let cached: Promise<AndroidReleaseView> | null = null;

export function loadAndroidRelease(): Promise<AndroidReleaseView> {
  if (!cached) {
    cached = fetch(ANDROID_RELEASE_URL, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => readAndroidRelease(response.ok ? await response.json() : null))
      .catch(() => ({ published: false as const }));
  }
  return cached;
}

export function formatApkSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} МБ`;
}
