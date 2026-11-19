import { useEffect, useState } from 'react';
import { BetSlipProvider } from '../BetSlipContext';
import { MatchCard } from '../components/MatchCard';
import { SportIcon } from '../components/SportIcon';
import { QuickBetProvider } from '../QuickBetContext';
import { oddspapiDemoUrl } from '../lib/oddspapiDemo';
import type { MatchEvent, SportId } from '../types';

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
  startTime: string | null;
}

interface DemoQuote {
  canonicalMarketId: string;
  canonicalSelectionId: string;
  marketName: string;
  outcomeName: string;
  period: string;
  price: number;
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

function toCard(fixture: DemoFixture): MatchEvent {
  const start = Date.parse(fixture.startTime ?? '');
  return {
    id: fixture.canonicalEventId,
    sport: iconSport(fixture.sportKey),
    league: fixture.tournamentName || '1xBet',
    country: '',
    team1: fixture.participant1Name || 'Участник 1',
    team2: fixture.participant2Name || 'Участник 2',
    team1Color: '#14532d',
    team2Color: '#1e3a8a',
    startTime: Number.isFinite(start) ? start : Date.now(),
    isLive: fixture.live,
    markets: { '1': 0, x: 0, '2': 0 },
    extraMarkets: 0,
    marketsLocked: true,
  };
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
  const [counts, setCounts] = useState({ fixtureCount: 0, withOdds: 0 });
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
        fixtureCount: Number(result.body.fixtureCount ?? rows.length),
        withOdds: Number(result.body.withOdds ?? 0),
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
    const rows = markets.get(quote.canonicalMarketId) ?? [];
    rows.push(quote);
    markets.set(quote.canonicalMarketId, rows);
  }

  return (
    <BetSlipProvider>
      <QuickBetProvider>
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
              {counts.fixtureCount} событий · {counts.withOdds} с активной линией
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
                    <p className="text-sm font-extrabold text-gray-900">{rows[0]?.marketName}{rows[0]?.period ? ` · ${rows[0].period}` : ''}</p>
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
            ) : fixtures.map((fixture) => (
              <MatchCard
                key={fixture.canonicalEventId}
                match={toCard(fixture)}
                onOpenMatch={() => setSelected(fixture)}
              />
            ))}
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
      </QuickBetProvider>
    </BetSlipProvider>
  );
}
