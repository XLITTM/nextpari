import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  clearDeferredPrompt,
  getDeferredPrompt,
  subscribePwaPrompt,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';

const DISMISS_KEY = 'pwa-banner-dismissed';

function isStandaloneTab() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isBannerDismissed() {
  return localStorage.getItem(DISMISS_KEY) === 'true';
}

export function InstallPwaPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    () => getDeferredPrompt(),
  );
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isBannerDismissed() || isStandaloneTab()) {
      setVisible(false);
      return;
    }

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = () => {
      if (media.matches) setVisible(false);
    };
    media.addEventListener('change', onDisplayMode);

    const unsubscribe = subscribePwaPrompt((event) => {
      setPromptEvent(event);
      if (event && !isBannerDismissed() && !isStandaloneTab()) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    });

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      unsubscribe();
      media.removeEventListener('change', onDisplayMode);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setVisible(false);
  };

  const install = async () => {
    const event = promptEvent ?? getDeferredPrompt();
    if (!event) return;
    setInstalling(true);
    try {
      await event.prompt();
      await event.userChoice;
      clearDeferredPrompt();
      setPromptEvent(null);
      setVisible(false);
    } catch {
      // Keep the banner if the native prompt fails.
    } finally {
      setInstalling(false);
    }
  };

  if (typeof window !== 'undefined' && (isStandaloneTab() || isBannerDismissed())) {
    return null;
  }
  if (!visible || !promptEvent) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] mx-auto w-full max-w-lg px-3"
      style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        role="dialog"
        aria-label="Скачать приложение"
        className="pointer-events-auto relative flex items-center gap-3 rounded-2xl border border-accent-500/25 bg-ink-900 p-3 text-white shadow-2xl shadow-black/40"
      >
        <img
          src="/25534.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">Скачать приложение</p>
          <p className="mt-0.5 text-xs text-slate-400">Быстрый доступ без браузера</p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          disabled={installing}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-500 px-3 py-2 text-xs font-bold text-ink-900 transition-transform active:scale-95 disabled:opacity-70"
        >
          <Download className="h-4 w-4" strokeWidth={2.4} />
          {installing ? '…' : 'Скачать'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
