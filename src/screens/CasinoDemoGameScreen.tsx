import { useEffect, useRef, useState } from 'react';
import { CasinoDemoBack } from '../components/CasinoDemoCatalog';
import { casinoRateLabel, casinoUsdLabel, type CasinoConversion } from '../lib/casinoConversion';
import { casinoDemoApi, casinoRealApi } from '../lib/casinoDemo';

type Launch = { title: string; url: string };

export function CasinoDemoGameScreen({ gameId, onBack, standard = false }: { gameId: string; onBack: () => void; standard?: boolean }) {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [status, setStatus] = useState<'ready' | 'launching' | 'error'>('ready');
  const [conversion, setConversion] = useState<CasinoConversion | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  useEffect(() => {
    if (!standard) return;
    const controller = new AbortController();
    setQuoteError(false);
    setConversion(null);
    fetch(casinoRealApi + '?quote=1', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { conversion?: CasinoConversion; launchEnabled?: boolean };
        if (!response.ok || !data.conversion || !data.launchEnabled) throw new Error('CASINO_UNAVAILABLE');
        if (!controller.signal.aborted) setConversion(data.conversion);
      })
      .catch(() => { if (!controller.signal.aborted) setQuoteError(true); });
    return () => controller.abort();
  }, [quoteAttempt, standard]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function openDemo() {
    if (request.current || (standard && !conversion)) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus('launching');
    try {
      const response = await fetch(standard ? casinoRealApi : casinoDemoApi, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId, rateVersion: conversion?.rateVersion, device: window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop' }),
      });
      const result = await response.json() as Partial<Launch>;
      if (response.status === 409) {
        setQuoteAttempt((attempt) => attempt + 1);
        setStatus('ready');
        return;
      }
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
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold">{launch?.title ?? (standard ? 'Казино' : 'Демо-игра')}</h1>
        <span className="pr-2 text-xs text-[var(--np-text-secondary)]">{standard ? 'USD' : 'Демо'}</span>
      </header>
      {launch ? (
        <iframe src={launch.url} title={launch.title} className="min-h-0 w-full flex-1 border-0 bg-black"
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock"
          allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" />
      ) : (
        <div className="grid flex-1 place-content-center justify-items-center gap-3 p-5 text-center">
          <p role="status" className="text-sm text-[var(--np-text-secondary)]">
            {standard
              ? quoteError ? 'Казино временно недоступно' : status === 'error' ? 'Игра не открылась' :
                'Баланс отображается в USD по курсу NextPari. Кошелёк ведётся в TMT.'
              : status === 'error' ? 'Демо-игра не открылась' : 'Игровые кредиты действуют только в демо-режиме'}
          </p>
          {conversion && <p className="text-sm">{casinoRateLabel(conversion)} · {casinoUsdLabel(conversion.balanceUsdMinor)}</p>}
          <button type="button" onClick={() => quoteError ? setQuoteAttempt((attempt) => attempt + 1) : void openDemo()}
            disabled={status === 'launching' || (standard && !conversion && !quoteError)}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-60">
            {status === 'launching' ? 'Открываем игру…' : status === 'error' || quoteError ? 'Повторить' : standard ? 'Принять курс и открыть игру' : 'Запустить демо'}
          </button>
        </div>
      )}
    </div>
  );
}
