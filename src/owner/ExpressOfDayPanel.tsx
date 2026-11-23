import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  archiveOwnerExpress,
  fetchOwnerExpresses,
  publishOwnerExpress,
  saveOwnerExpress,
  searchOwnerExpressEvents,
  unpublishOwnerExpress,
  type ExpressSelectionDraft,
} from './expressOfDayApi';

type ExpressRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  combinedOdds: number | null;
  expiresAt: string | null;
  selections: ExpressSelectionDraft[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseExpress(value: unknown): ExpressRow {
  const rec = asRecord(value);
  return {
    id: String(rec.id ?? ''),
    title: String(rec.title ?? ''),
    description: String(rec.description ?? ''),
    status: String(rec.status ?? 'draft'),
    combinedOdds: rec.combinedOdds == null ? null : Number(rec.combinedOdds),
    expiresAt: rec.expiresAt == null ? null : String(rec.expiresAt),
    selections: Array.isArray(rec.selections) ? rec.selections as ExpressSelectionDraft[] : [],
  };
}

export function ExpressOfDayPanel() {
  const [rows, setRows] = useState<ExpressRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<unknown[]>([]);
  const [selections, setSelections] = useState<ExpressSelectionDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const data = await fetchOwnerExpresses();
    setRows(data.map(parseExpress));
  };

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'));
  }, []);

  const addOutcome = (event: Record<string, unknown>, market: Record<string, unknown>, outcome: Record<string, unknown>) => {
    setSelections((current) => [
      ...current,
      {
        canonicalEventId: String(event.canonicalEventId ?? ''),
        provider: String(event.provider ?? ''),
        feedType: String(event.feedType ?? ''),
        fixtureId: String(event.fixtureId ?? ''),
        marketId: String(market.marketId ?? ''),
        marketKey: String(market.marketKey ?? ''),
        selectionId: String(outcome.selectionId ?? ''),
        outcomeId: String(outcome.outcomeId ?? ''),
        line: String(market.line ?? ''),
        oddsSnapshot: Number(outcome.odds ?? 0),
        matchLabel: String(event.matchLabel ?? ''),
        league: String(event.league ?? ''),
        outcomeName: String(outcome.name ?? ''),
      },
    ]);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = parseExpress(await saveOwnerExpress({
        id: editingId ?? undefined,
        title,
        description,
        expiresAt: expiresAt || null,
        selections,
      }));
      setEditingId(saved.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-5">Экспресс дня</h2>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-ink-900">{editingId ? 'Редактирование' : 'Новый экспресс'}</h3>
              <p className="text-xs text-gray-500">Черновик → предпросмотр → публикация. Коэффициент считает сервер.</p>
            </div>
          </div>
          {error && <p className="mb-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-3" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-3 min-h-24" />
          <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder="Истекает (ISO)" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-3" />
          <div className="flex gap-2 mb-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск события" className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none" />
            <button type="button" className="px-4 py-3 rounded-xl bg-ink-900 text-white text-sm font-bold" onClick={() => { void searchOwnerExpressEvents(query).then(setEvents).catch((err) => setError(err instanceof Error ? err.message : 'Ошибка')); }}>Найти</button>
          </div>
          <div className="space-y-2 max-h-48 overflow-auto mb-4">
            {events.map((raw) => {
              const event = asRecord(raw);
              const markets = Array.isArray(event.markets) ? event.markets : [];
              return (
                <div key={String(event.canonicalEventId)} className="border border-slate-100 rounded-xl p-3">
                  <p className="text-sm font-bold">{String(event.matchLabel)}</p>
                  <p className="text-xs text-gray-500">{String(event.league)}</p>
                  {markets.map((marketRaw) => {
                    const market = asRecord(marketRaw);
                    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
                    return outcomes.map((outcomeRaw) => {
                      const outcome = asRecord(outcomeRaw);
                      return (
                        <button
                          key={`${String(market.marketKey)}-${String(outcome.selectionId)}`}
                          type="button"
                          className="mt-2 mr-2 text-xs font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800"
                          onClick={() => addOutcome(event, market, outcome)}
                        >
                          {String(outcome.name)} {String(outcome.odds)}
                        </button>
                      );
                    });
                  })}
                </div>
              );
            })}
          </div>
          <ol className="space-y-2 mb-4">
            {selections.map((row, index) => (
              <li key={`${row.fixtureId}-${row.selectionId}`} className="flex items-center gap-2 text-sm">
                <span className="font-bold w-5">{index + 1}</span>
                <span className="flex-1">{row.matchLabel} · {row.outcomeName} @ {row.oddsSnapshot}</span>
                <button type="button" className="text-xs" onClick={() => setSelections((current) => current.filter((_, i) => i !== index))}>Удалить</button>
                <button type="button" className="text-xs" disabled={index === 0} onClick={() => setSelections((current) => {
                  const next = [...current];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  return next;
                })}>↑</button>
                <button type="button" className="text-xs" disabled={index === selections.length - 1} onClick={() => setSelections((current) => {
                  const next = [...current];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  return next;
                })}>↓</button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="px-4 py-3 rounded-xl bg-ink-900 text-white text-sm font-bold disabled:opacity-50">Сохранить черновик</button>
            {editingId && (
              <>
                <button type="button" disabled={busy} onClick={() => void publishOwnerExpress(editingId).then(reload).catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))} className="px-4 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold">Опубликовать</button>
                <button type="button" disabled={busy} onClick={() => void unpublishOwnerExpress(editingId).then(reload).catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))} className="px-4 py-3 rounded-xl bg-slate-200 text-sm font-bold">Снять</button>
                <button type="button" disabled={busy} onClick={() => void archiveOwnerExpress(editingId).then(reload).catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'))} className="px-4 py-3 rounded-xl bg-slate-200 text-sm font-bold">В архив</button>
              </>
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-lg font-extrabold text-ink-900 mb-3">Предпросмотр</h3>
          <p className="text-sm font-bold text-ink-900">{title || 'Без названия'}</p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
          <p className="text-xs text-gray-500 mt-2">{selections.length} исходов{expiresAt ? ` · до ${expiresAt}` : ''}</p>
          <ol className="mt-3 space-y-1">
            {selections.map((row, index) => (
              <li key={`${row.fixtureId}-${row.selectionId}-${index}`} className="text-xs">
                {index + 1}. {row.matchLabel} · {row.outcomeName}
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-500 mt-3">Итоговый коэффициент считает сервер при сохранении и публикации.</p>
          <h3 className="text-lg font-extrabold text-ink-900 mt-6 mb-3">Список</h3>
          <div className="space-y-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="w-full text-left border border-slate-100 rounded-xl p-3"
                onClick={() => {
                  setEditingId(row.id);
                  setTitle(row.title);
                  setDescription(row.description);
                  setExpiresAt(row.expiresAt ?? '');
                  setSelections(row.selections);
                }}
              >
                <p className="text-sm font-bold">{row.title}</p>
                <p className="text-xs text-gray-500">{row.status}{row.combinedOdds != null ? ` · ${row.combinedOdds}` : ''} · {row.selections.length} исх.</p>
              </button>
            ))}
            {rows.length === 0 && <p className="text-sm text-gray-500">Пока нет экспрессов. Сохраните черновик или примените миграцию 068.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
