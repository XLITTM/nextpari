import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ANDROID_BANNER_DISMISS_KEY,
  ANDROID_DOWNLOAD_PAGE,
  loadAndroidRelease,
  shouldShowAndroidBanner,
  type AndroidReleaseView,
} from '../lib/androidRelease';

type BannerRelease = Extract<AndroidReleaseView, { published: true }>;

export function AndroidDownloadBanner({ preview }: { preview?: BannerRelease | null }) {
  const [release, setRelease] = useState<AndroidReleaseView | null>(preview ?? null);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ANDROID_BANNER_DISMISS_KEY));

  useEffect(() => {
    if (preview) return undefined;
    let alive = true;
    void loadAndroidRelease().then((next) => {
      if (alive) setRelease(next);
    });
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => {
      alive = false;
      window.removeEventListener('popstate', sync);
    };
  }, [preview]);

  const visible = preview
    ? true
    : shouldShowAndroidBanner({ release, pathname, dismissedVersion: dismissed });
  if (!visible || !release?.published) return null;

  const dismiss = () => {
    localStorage.setItem(ANDROID_BANNER_DISMISS_KEY, String(release.versionCode));
    setDismissed(String(release.versionCode));
  };

  return (
    <div
      className={preview
        ? 'pointer-events-none absolute inset-x-0 top-4 z-[80] mx-auto w-full max-w-[720px] px-3'
        : 'pointer-events-none fixed inset-x-0 z-[80] mx-auto w-full max-w-[720px] px-3'}
      style={preview ? undefined : { top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      <div
        role="region"
        aria-label="Скачать официальное приложение Nextpari для Android"
        className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/95 p-3 text-white shadow-2xl shadow-black/30"
      >
        <img src="/25534.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{release.banner.title}</p>
          <p className="truncate text-xs text-slate-300">{release.banner.body}</p>
        </div>
        <a
          href={ANDROID_DOWNLOAD_PAGE}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-500 px-3 py-2 text-xs font-bold text-ink-950"
        >
          <Download className="h-4 w-4" strokeWidth={2.4} />
          Скачать
        </a>
        {preview ? null : (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
