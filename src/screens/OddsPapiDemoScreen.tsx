import { useEffect, useState } from 'react';
import { SportIcon } from '../components/SportIcon';
import { oddspapiDemoUrl } from '../lib/oddspapiDemo';
import type { SportId } from '../types';

interface DemoSport {
  sportId: number;
  sportKey: string;
  canonicalSportId: string;
}

interface DemoFixture {
  fixtureId: string;
  canonicalEventId: string;
  sportKey: string | null;
  live: boolean;
  hasOdds: boolean;
  staleOdds: boolean;
  suspended: boolean;
  participant1Name: string | null;
  participant2Name: string | null;
  tournamentName: string | null;
  startTimeMs: number | null;
}

interface DemoQuote {
  canonicalMarketId: string;
  canonicalSelectionId: string;
  marketName: string;
  marketType: string;
  outcomeName: string;
  period: string;
  handicap: number | null;
  line: string;
  price: number;
}

interface CardPrices {
  fixtureId: string;
  available: boolean;
  prices: { '1': number | null; x: number | null; '2': number | null };
}

const LABELS: Record<string, string> = {
  football: 'Футбол',
  basketball: 'Баскетбол',
  tennis: 'Теннис',
  'ice-hockey': 'Хоккей',
  'esports-dota': 'Dota 2',
  'esports-counter-strike': 'CS2',
  'esports-league-of-legends': 'LoL',
  volleyball: 'Волейбол',
  'table-tennis': 'Настольный теннис',
  'esports-valorant': 'Valorant',
};

function iconSport(sportKey: string | null): SportId {
  if (sportKey === 'ice-hockey') return 'hockey';
  if (sportKey?.startsWith('esports')) return 'esports';
  if (sportKey === 'football' || sportKey === 'basketball' || sportKey === 'tennis' || sportKey === 'volleyball' || sportKey === 'table-tennis') {
    return sportKey;
  }
  return 'all';
}

function clockLabel(startTimeMs: number | null): string {
  if (startTimeMs === null) return 'Время недоступно';
  return new Date(startTimeMs).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function PriceCell({ label, price }: { label: string; price: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-2.5 py-1.5 dark:border-gray-600 dark:bg-[#0f172a]">
      <span className="text-xs font-bold text-gray-900 dark:text-white">{label}</span>
      <span className="text-sm font-extrabold text-gray-900 dark:text-white">{price ?? '—'}</span>
    </div>
  );
}

async function readDemo(query: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(oddspapiDemoUrl(query), { headers: { accept: 'application/json' } });
  const body = await response.json() as Record<string, unknown>;
  return { status: response.status, body };
}

export function OddsPapiDemoScreen() {
  const [closed, setClosed] = useState(false);
  const [sports, setSports] = useState<DemoSport[]>([]);
  const [sportId, setSportId] = useState(10);
  const [phase, setPhase] = useState<'live' | 'today'>('live');
  const [fixtures, setFixtures] = useState<DemoFixture[]>([]);
  const [counts, setCounts] = useState({ upstream: 0, shown: 0, withOdds: 0, limit: 40 });
  const [prices, setPrices] = useState<Record<string, CardPrices>>({});
  const [selected, setSelected] = useState<DemoFixture | null>(null);
  const [quotes, setQuotes] = useState<DemoQuote[]>([]);
  const [rejected, setRejected] = useState(0);
  const [message, setMessage] = useState('Загрузка демо…');

  useEffect(() => {
    let cancelled = false;
    readDemo({ view: 'sports' }).then((result) => {
      if (cancelled) return;
      if (result.status !== 200 || result.body.betsAccepted !== false) {
        setClosed(true);
        return;
      }
      const rows = Array.isArray(result.body.sports) ? result.body.sports as DemoSport[] : [];
      setSports(rows);
      setMessage('');
    }).catch(() => {
      if (!cancelled) setClosed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (closed || sports.length === 0) return;
    let cancelled = false;
    setSelected(null);
    setQuotes([]);
    setMessage('Загрузка событий…');
    readDemo({ view: phase, sportId: String(sportId) }).then((result) => {
      if (cancelled) return;
      const rows = Array.isArray(result.body.fixtures) ? result.body.fixtures as DemoFixture[] : [];
      setFixtures(rows);
      setCounts({
        upstream: Number(result.body.upstreamFixtureCount ?? result.body.fixtureCount ?? rows.length),
        shown: Number(result.body.shownFixtureCount ?? rows.length),
        withOdds: Number(result.body.upstreamWithOdds ?? result.body.withOdds ?? 0),
        limit: Number(result.body.displayLimit ?? 40),
      });
      setMessage(result.status === 200 ? '' : 'События сейчас недоступны.');
    }).catch(() => {
      if (!cancelled) setMessage('События сейчас недоступны.');
    });
    return () => {
      cancelled = true;
    };
  }, [closed, phase, sportId, sports.length]);

  useEffect(() => {
    const ids = fixtures
      .filter((fixture) => fixture.hasOdds && !fixture.staleOdds && !fixture.suspended)
      .slice(0, 12)
      .map((fixture) => fixture.fixtureId);
    if (ids.length === 0) {
      setPrices({});
      return;
    }
    let cancelled = false;
    readDemo({ view: 'cards', fixtureIds: ids.join(',') }).then((result) => {
      if (cancelled) return;
      const next: Record<string, CardPrices> = {};
      const cards = Array.isArray(result.body.cards) ? result.body.cards as CardPrices[] : [];
      for (const card of cards) next[card.fixtureId] = card;
      setPrices(next);
    }).catch(() => {
      if (!cancelled) setPrices({});
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures]);

  useEffect(() => {
    if (!selected || selected.staleOdds || selected.suspended || !selected.hasOdds) {
      setQuotes([]);
      return;
    }
    let cancelled = false;
    readDemo({ view: 'odds', fixtureId: selected.fixtureId }).then((result) => {
      if (cancelled) return;
      setQuotes(Array.isArray(result.body.quotes) ? result.body.quotes as DemoQuote[] : []);
      setRejected(Number(result.body.rejected ?? 0));
    }).catch(() => {
      if (!cancelled) setQuotes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!closed) return;
    window.location.hash = '';
    window.location.reload();
  }, [closed]);

  const markets = new Map<string, DemoQuote[]>();
  for (const quote of quotes) {
    const key = `${quote.period}|${quote.marketType}|${quote.canonicalMarketId}|${quote.handicap ?? ''}|${quote.line}`;
    const rows = markets.get(key) ?? [];
    rows.push(quote);
    markets.set(key, rows);
  }

  return (
        <div className="relative mx-auto flex h-screen max-w-[720px] flex-col overflow-hidden bg-[#f0f2f5] dark:bg-gray-900">
          <div className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950">
            <p className="text-sm font-extrabold">ДЕМО / ТОЛЬКО ПРОСМОТР</p>
            <p className="text-xs font-semibold">OddsPapi V5 · 1xBet. Ставки, депозиты, выводы и расчёт отключены.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 py-3">
            {sports.map((sport) => (
              <button
                key={sport.canonicalSportId}
                type="button"
                onClick={() => setSportId(sport.sportId)}
                className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold ${
                  sport.sportId === sportId ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-900'
                }`}
              >
                <SportIcon sport={iconSport(sport.sportKey)} className="h-6 w-6" />
                {LABELS[sport.sportKey] ?? sport.sportKey}
              </button>
            ))}
          </div>
          <div className="flex gap-2 px-3">
            {(['live', 'today'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPhase(item)}
                className={`rounded-xl px-3 py-1.5 text-sm font-bold ${phase === item ? 'bg-gray-900 text-white' : 'bg-white text-gray-800'}`}
              >
                {item === 'live' ? 'LIVE' : 'Прематч'}
              </button>
            ))}
            <p className="self-center text-xs font-semibold text-gray-600">
              показано {counts.shown} из {counts.upstream} · с линией {counts.withOdds}
              {counts.upstream > counts.limit ? ` · лимит экрана ${counts.limit}` : ''}
            </p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-16">
            {message ? <p className="text-sm font-semibold text-gray-600">{message}</p> : null}
            {selected ? (
              <section className="rounded-2xl bg-white p-3">
                <button type="button" className="text-sm font-bold text-brand-600" onClick={() => setSelected(null)}>К списку</button>
                <h2 className="mt-2 text-base font-extrabold text-gray-900">{selected.participant1Name} — {selected.participant2Name}</h2>
                <p className="text-xs font-semibold text-gray-500">{selected.canonicalEventId}</p>
                {selected.staleOdds || selected.suspended || !selected.hasOdds ? (
                  <p className="mt-3 text-sm font-bold text-red-600">Линия закрыта: нет актуальных, нестарых и незаблокированных котировок.</p>
                ) : null}
                {[...markets.entries()].map(([marketId, rows]) => (
                  <div key={marketId} className="mt-3">
                    <p className="text-sm font-extrabold text-gray-900">
              {rows[0]?.marketName}
              {rows[0]?.period ? ` · ${rows[0].period}` : ''}
              {rows[0]?.marketType ? ` · ${rows[0].marketType}` : ''}
              {rows[0]?.line ? ` · линия ${rows[0].line}` : ''}
              {rows[0]?.handicap !== null && rows[0]?.handicap !== undefined ? ` · ${rows[0].handicap}` : ''}
            </p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {rows.map((row) => (
                        <div key={row.canonicalSelectionId} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                          <span className="text-sm font-bold text-gray-800">{row.outcomeName}</span>
                          <span className="text-sm font-extrabold text-gray-950">{row.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {quotes.length === 0 && rejected > 0 ? (
                  <p className="mt-3 text-sm font-semibold text-gray-600">Отклонено котировок: {rejected}. Неоднозначные, старые и приостановленные рынки скрыты.</p>
                ) : null}
              </section>
            ) : fixtures.map((fixture) => {
              const card = prices[fixture.fixtureId];
              const priced = card?.available ? card.prices : null;
              return (
                <div
                  key={fixture.canonicalEventId}
                  className="flex h-[144px] w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm dark:border-gray-700 dark:bg-[#1e293b]"
                  onClick={() => setSelected(fixture)}
                >
                  <div className="flex items-center gap-1.5 border-b border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700">
                    <SportIcon sport={iconSport(fixture.sportKey)} className="h-6 w-6 shrink-0 text-[#4ade80]" />
                    <span className="truncate font-bold text-gray-900 dark:text-white">{fixture.tournamentName ?? 'Турнир недоступен'}</span>
                  </div>
                  <div className="flex flex-1 items-center gap-3 px-3">
                    <span className="flex-1 truncate text-right text-sm font-extrabold text-gray-900 dark:text-white">{fixture.participant1Name ?? 'Название недоступно'}</span>
                    <span className="shrink-0 text-center text-xs font-bold text-gray-700 dark:text-gray-200">
                      {fixture.live ? 'LIVE' : clockLabel(fixture.startTimeMs)}
                    </span>
                    <span className="flex-1 truncate text-sm font-extrabold text-gray-900 dark:text-white">{fixture.participant2Name ?? 'Название недоступно'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 px-3 pb-2">
                    <PriceCell label="П1" price={priced?.['1'] ?? null} />
                    <PriceCell label="X" price={priced?.x ?? null} />
                    <PriceCell label="П2" price={priced?.['2'] ?? null} />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="absolute bottom-4 right-4 rounded-xl bg-gray-900 px-3 py-2 text-xs font-bold text-white"
            onClick={() => {
              window.location.hash = '';
              window.location.reload();
            }}
          >
            Обычный вход
          </button>
        </div>
  );
}
