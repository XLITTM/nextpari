import { useEffect, useState } from 'react';
import { ArrowLeft, Gamepad2, Search } from 'lucide-react';
import { casinoCategories, casinoDemoApi, casinoRealApi, type CasinoDemoCatalog as Catalog, type CasinoDemoGame } from '../lib/casinoDemo';
import { casinoRateLabel, casinoUsdLabel, type CasinoConversion } from '../lib/casinoConversion';
import type { Screen } from '../types';

const fieldClass = 'min-w-0 rounded-xl border border-[var(--np-border)] bg-[var(--np-surface)] px-3 py-2 text-sm text-[var(--np-text)]';

export function CasinoDemoCatalog({ onNavigate, standard = false, categoryFilter, hideUnavailable = false }: {
  onNavigate: (screen: Screen) => void;
  standard?: boolean;
  categoryFilter?: 'slots' | 'live';
  hideUnavailable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'disabled'>('loading');
  const [data, setData] = useState<(Catalog & { conversion?: CasinoConversion; launchEnabled?: boolean; catalogPreview?: boolean }) | null>(null);
  const [games, setGames] = useState<CasinoDemoGame[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, category: categoryFilter ?? category, provider, page: String(page) });
      fetch((standard ? casinoRealApi : casinoDemoApi) + '?' + params, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json() as Catalog & { error?: string; conversion?: CasinoConversion; launchEnabled?: boolean; catalogPreview?: boolean };
          if (controller.signal.aborted) return;
          if (result.error === 'CASINO_DEMO_DISABLED' || result.error === 'CASINO_STANDARD_DISABLED' ||
              (hideUnavailable && !response.ok)) {
            setStatus('disabled');
            return;
          }
          if (!response.ok || !Array.isArray(result.games)) throw new Error('CATALOG_UNAVAILABLE');
          setData(result);
          setGames((previous) => page === 1 ? result.games : [...new Map(
            [...previous, ...result.games].map((game) => [game.id, game]),
          ).values()]);
          setStatus('ready');
        })
        .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    }, query ? 240 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, categoryFilter, hideUnavailable, page, provider, query, retry, standard]);

  function change(update: () => void) {
    setGames([]);
    setPage(1);
    setStatus('loading');
    update();
  }

  if (hideUnavailable && (status === 'loading' || status === 'error')) return null;
  if (status === 'disabled') {
    return standard && !hideUnavailable ? <p className="px-4 py-2">Игры SoftAggregator временно недоступны.</p> : null;
  }
  return (
    <section className="space-y-3 px-4 pb-4 text-[var(--np-text)]" aria-labelledby={standard ? 'casino-standard-title' : 'casino-demo-title'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold" id={standard ? 'casino-standard-title' : 'casino-demo-title'}>{standard ? (categoryFilter === 'live' ? 'Лайв казино' : categoryFilter === 'slots' ? 'Слоты' : 'SoftAggregator') : 'Демо-игры'}</h2>
        <span className="text-xs font-medium text-[var(--np-text-secondary)]">{standard ? 'Игровая валюта USD' : 'Без списания средств'}</span>
      </div>
      {data?.catalogPreview && (
        <p role="status" className="text-sm text-[var(--np-text-secondary)]">Предпросмотр каталога. Запуск игр отключён.</p>
      )}
      {standard && data?.conversion && (
        <div role="status" className="rounded-xl border border-[var(--np-border)] p-3 text-sm">
          <p>Ваш баланс отображается в USD по курсу NextPari. Кошелёк ведётся в TMT.</p>
          <p>{casinoRateLabel(data.conversion)} · {casinoUsdLabel(data.conversion.balanceUsdMinor)}</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--np-text-secondary)]" aria-hidden />
          <input aria-label="Поиск игр" value={query} onChange={(event) => change(() => setQuery(event.target.value))}
            maxLength={120} placeholder="Поиск игр" className={fieldClass + ' w-full pl-9'} />
        </label>
        {!categoryFilter && <select aria-label="Категория" className={fieldClass} value={category}
          onChange={(event) => change(() => setCategory(event.target.value))}>
          <option value="">Все категории</option>
          {data?.categories.map((id) => <option key={id} value={id}>{casinoCategories[id]}</option>)}
        </select>}
        <select aria-label="Студия" className={fieldClass} value={provider}
          onChange={(event) => change(() => setProvider(event.target.value))}>
          <option value="">Все студии</option>
          {data?.providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </div>
      {games.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {games.map((game) => <CasinoDemoTile key={game.id} game={game} disabled={standard && data?.launchEnabled !== true} onOpen={() => onNavigate({ name: 'casino-demo-game', gameId: game.id, standard })} />)}
        </div>
      )}
      <div className="text-sm text-[var(--np-text-secondary)]" role="status">
        {status === 'loading' && 'Загружаем каталог…'}
        {status === 'ready' && !games.length && (standard ? 'Игры не найдены' : 'Демо-игры не найдены')}
        {status === 'error' && 'Каталог временно недоступен'}
      </div>
      {status === 'error' && (
        <button type="button" className={fieldClass} onClick={() => { setStatus('loading'); setRetry((value) => value + 1); }}>
          Повторить
        </button>
      )}
      {status === 'ready' && data?.nextPage && (
        <button type="button" className={fieldClass} onClick={() => { setStatus('loading'); setPage(data.nextPage!); }}>
          Показать ещё
        </button>
      )}
    </section>
  );
}

function CasinoDemoTile({ game, disabled, onOpen }: { game: CasinoDemoGame; disabled: boolean; onOpen: () => void }) {
  const [imageError, setImageError] = useState(false);
  return (
    <button type="button" disabled={disabled} onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-[var(--np-border)] bg-gradient-to-b from-[var(--np-surface-elevated)] to-[var(--np-surface-soft)] text-left shadow-[0_5px_14px_rgba(3,21,34,0.16)] transition-transform motion-safe:hover:-translate-y-0.5 active:scale-[0.98]">
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[var(--np-surface-muted)]">
        {game.image && !imageError ? (
          <img src={game.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-contain" onError={() => setImageError(true)} />
        ) : <Gamepad2 className="size-8 text-[var(--np-text-muted)]" aria-hidden />}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
        <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white">{game.demo ? 'Демо' : disabled ? 'Недоступно' : 'USD'}</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="line-clamp-2 text-sm font-bold">{game.title}</div>
        <div className="truncate text-xs text-[var(--np-text-secondary)]">{game.studio} · {casinoCategories[game.category]}</div>
      </div>
    </button>
  );
}

export function CasinoDemoBack({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold">
      <ArrowLeft className="size-4" aria-hidden /> Назад
    </button>
  );
}
