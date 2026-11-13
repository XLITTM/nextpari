import { useEffect, useRef, useState } from 'react';
import { CasinoDemoBack } from '../components/CasinoDemoCatalog';
import { casinoDemoApi } from '../lib/casinoDemo';

type Launch = { title: string; url: string };

export function CasinoDemoGameScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [status, setStatus] = useState<'ready' | 'launching' | 'error'>('ready');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function openDemo() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus('launching');
    try {
      const response = await fetch(casinoDemoApi, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId, device: window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop' }),
      });
      const result = await response.json() as Partial<Launch>;
      if (!response.ok || typeof result.title !== 'string' || typeof result.url !== 'string') throw new Error('LAUNCH_FAILED');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('LAUNCH_FAILED');
      if (!controller.signal.aborted) setLaunch({ title: result.title, url: url.href });
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    } finally {
      request.current = null;
    }
  }

  return (
    <div className="flex h-full min-h-[50dvh] flex-col bg-[var(--np-bg)] text-[var(--np-text)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--np-border)] bg-[var(--np-surface)] p-2">
        <CasinoDemoBack onBack={onBack} />
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold">{launch?.title ?? 'Демо-игра'}</h1>
        <span className="pr-2 text-xs text-[var(--np-text-secondary)]">Демо</span>
      </header>
      {launch ? (
        <iframe src={launch.url} title={launch.title} className="min-h-0 w-full flex-1 border-0 bg-black"
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock"
          allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" />
      ) : (
        <div className="grid flex-1 place-content-center justify-items-center gap-3 p-5 text-center">
          <p role="status" className="text-sm text-[var(--np-text-secondary)]">
            {status === 'error' ? 'Демо-игра не открылась' : 'Игровые кредиты действуют только в демо-режиме'}
          </p>
          <button type="button" onClick={() => void openDemo()} disabled={status === 'launching'}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-60">
            {status === 'launching' ? 'Открываем игру…' : status === 'error' ? 'Повторить' : 'Запустить демо'}
          </button>
        </div>
      )}
    </div>
  );
}
