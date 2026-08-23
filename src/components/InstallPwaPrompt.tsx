import { Download, Share, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredPrompt,
  getDeferredPrompt,
  subscribePwaPrompt,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';

const STORAGE_KEY = 'nextpari-pwa-dismissed';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 800;

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isMobileUser() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return window.matchMedia('(max-width: 768px)').matches;
}

function isIosDevice() {
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPwaPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [installing, setInstalling] = useState(false);

  const ios = typeof navigator !== 'undefined' && isIosDevice();

  const hide = useCallback((animate = true) => {
    if (animate) {
      setVisible(false);
      window.setTimeout(() => setMounted(false), 400);
    } else {
      setVisible(false);
      setMounted(false);
    }
  }, []);

  useEffect(() => {
    if (isStandaloneMode() || !isMobileUser() || wasDismissedRecently()) return;

    let showTimer: number | undefined;
    const reveal = () => {
      if (isStandaloneMode()) return;
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    };

    const unsubscribe = subscribePwaPrompt((event) => {
      setPromptEvent(event);
      if (event) {
        window.clearTimeout(showTimer);
        reveal();
      }
    });

    if (isIosDevice()) {
      showTimer = window.setTimeout(reveal, SHOW_DELAY_MS);
    }

    return () => {
      unsubscribe();
      window.clearTimeout(showTimer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* storage may be unavailable */
    }
    hide();
  };

  const install = async () => {
    const event = promptEvent ?? getDeferredPrompt();
    if (!event) return;
    setInstalling(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      clearDeferredPrompt();
      setPromptEvent(null);
      if (outcome === 'accepted') {
        try {
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        hide();
      }
    } catch {
      /* user closed the native sheet */
    } finally {
      setInstalling(false);
    }
  };

  if (!mounted) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[90] mx-auto w-full max-w-lg px-3 transition-transform duration-500 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-[120%]'
      }`}
      style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        role="dialog"
        aria-label="Установить приложение NextPari на экран"
        className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-accent-500/25 bg-ink-900 p-3 text-white shadow-2xl shadow-black/40"
      >
        <img
          src="/icons/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            Установить приложение NextPari на экран
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {ios && !promptEvent
              ? 'Нажмите «Поделиться», затем «На экран „Домой“»'
              : 'Быстрый доступ без браузера'}
          </p>
        </div>
        {promptEvent ? (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-500 px-3 py-2 text-xs font-bold text-ink-900 transition-transform active:scale-95 disabled:opacity-70"
          >
            <Download className="h-4 w-4" strokeWidth={2.4} />
            {installing ? '…' : 'Установить'}
          </button>
        ) : ios ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
            <Share className="h-4 w-4" strokeWidth={2.4} />
          </span>
        ) : null}
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
