import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredPrompt,
  getDeferredPrompt,
  subscribePwaPrompt,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';

const IOS_HINT = 'Нажмите "Поделиться" -> "На экран домой"';
const RESHOW_AFTER_DISMISS_MS = 8_000;

function isStandaloneTab() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIosBrowser() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  );
}

export function InstallPwaPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    () => getDeferredPrompt(),
  );
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && !isStandaloneTab(),
  );
  const [installing, setInstalling] = useState(false);
  const [hint, setHint] = useState(false);

  const reveal = useCallback(() => {
    if (isStandaloneTab()) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) setVisible(true);

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = () => {
      if (media.matches) setVisible(false);
      else setVisible(true);
    };
    media.addEventListener('change', onDisplayMode);

    const unsubscribe = subscribePwaPrompt((event) => {
      setPromptEvent(event);
      if (!isStandaloneTab()) setVisible(true);
    });

    const onVisibleAgain = () => {
      if (document.visibilityState === 'visible') reveal();
    };
    const onInstalled = () => setVisible(false);
    document.addEventListener('visibilitychange', onVisibleAgain);
    window.addEventListener('pageshow', reveal);
    window.addEventListener('focus', reveal);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      unsubscribe();
      media.removeEventListener('change', onDisplayMode);
      document.removeEventListener('visibilitychange', onVisibleAgain);
      window.removeEventListener('pageshow', reveal);
      window.removeEventListener('focus', reveal);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [reveal]);

  const dismissTemporarily = () => {
    setHint(false);
    setVisible(false);
    window.setTimeout(reveal, RESHOW_AFTER_DISMISS_MS);
  };

  const install = async () => {
    const event = promptEvent ?? getDeferredPrompt();
    if (!event) {
      setHint(true);
      return;
    }
    setHint(false);
    setInstalling(true);
    try {
      await event.prompt();
      await event.userChoice;
      clearDeferredPrompt();
      setPromptEvent(null);
    } catch {
      setHint(true);
    } finally {
      setInstalling(false);
    }
  };

  if (typeof window !== 'undefined' && isStandaloneTab()) return null;
  if (!visible) return null;

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
          <p className="mt-0.5 text-xs text-slate-400">
            {isIosBrowser() ? IOS_HINT : 'Быстрый доступ без браузера'}
          </p>
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
          onClick={dismissTemporarily}
          aria-label="Закрыть"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        {hint ? (
          <div
            role="status"
            className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] rounded-xl border border-accent-500/30 bg-ink-800 px-3 py-2 text-xs leading-snug text-white shadow-lg"
          >
            {IOS_HINT}
          </div>
        ) : null}
      </div>
    </div>
  );
}
