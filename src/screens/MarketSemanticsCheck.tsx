import { useEffect, useState } from 'react';
import { MatchCard } from '@/components/MatchCard';
import { OddsPapiMarketBoard } from '@/components/OddsPapiMarketBoard';
import { footballCardToMatch, type FootballFeedCard } from '@/lib/footballFeed';
import type { MatchEvent } from '@/types';

export function MarketSemanticsCheck() {
  const [live, setLive] = useState<MatchEvent | null>(null);
  const [prematch, setPrematch] = useState<MatchEvent | null>(null);
  const [cards, setCards] = useState<MatchEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const listed = await fetch('/api/player/sports/football-feed?includeSports=1').then((response) => response.json()) as {
        events?: FootballFeedCard[];
      };
      const football = (listed.events ?? []).filter((event) => event.sport === 'football');
      const liveCard = football.find((event) => event.live);
      const lineCard = football.find((event) => !event.live);
      const wanted = ['ssc napoli', 'lille osc', 'olympique lyon', 'strasbourg alsace', 'stade brest 29', 'rc celta de vigo', 'real madrid', 'torino fc', 'racing club de lens', 'toulouse fc', 'as monaco', 'aj auxerre', 'juventus turin', 'venezia fc', 'angers sco', 'lazio rome'];
      const seen = new Set<string>();
      const named = football.filter((event) => {
        const names = `${event.home} ${event.away}`.toLowerCase();
        const hit = wanted.find((name) => names.includes(name));
        if (!hit || seen.has(hit)) return false;
        seen.add(hit);
        return true;
      });
      const ligue = named.length > 0
        ? named
        : football.filter((event) => event.league === 'Ligue 1' && /france/i.test(event.country)).slice(0, 3);
      const [liveDetail, lineDetail] = await Promise.all([
        liveCard ? detail(liveCard.id) : Promise.resolve(null),
        lineCard ? detail(lineCard.id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setLive(liveDetail ? footballCardToMatch(liveDetail) : null);
      setPrematch(lineDetail ? footballCardToMatch(lineDetail) : null);
      setCards(ligue.map((card) => footballCardToMatch(card)));
    }
    load().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить матчи');
    });
    return () => { cancelled = true; };
  }, []);

  const fallback = {
    ...cards[0],
    id: 'logo-fallback',
    team1: 'Unlisted Village FC',
    team2: 'Reserve Town Women',
    team1Logo: undefined,
    team2Logo: undefined,
    league: 'Ligue 1',
  } as MatchEvent;

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-900">
      <section className="mx-auto max-w-3xl space-y-2 px-3 py-4">
        <h1 className="text-base font-bold text-[#1A1A1A]">Проверка рынков и значков</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="px-1 text-xs font-semibold text-gray-600">Значки команд</p>
        {cards.map((match) => (
          <MatchCard key={match.id} match={match} onOpenMatch={() => undefined} />
        ))}
        <p className="px-1 pt-3 text-xs font-semibold text-gray-600">Карточка без значка</p>
        {cards[0] ? <MatchCard match={fallback} onOpenMatch={() => undefined} showLeague /> : null}
      </section>
      {live ? <Board title="LIVE" match={live} /> : <p className="px-4 text-sm">LIVE загружается…</p>}
      {prematch ? <Board title="Линия" match={prematch} /> : <p className="px-4 text-sm">Линия загружается…</p>}
    </div>
  );
}

function Board({ title, match }: { title: string; match: MatchEvent }) {
  return (
    <section className="mx-auto max-w-[430px] border-t border-gray-200 bg-white">
      <header className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500">{title} · {match.league}</p>
        <h2 className="text-lg font-bold text-[#1A1A1A]">{match.team1} — {match.team2}</h2>
      </header>
      <OddsPapiMarketBoard match={match} />
    </section>
  );
}

async function detail(id: string): Promise<FootballFeedCard | null> {
  const body = await fetch('/api/player/sports/football-feed?eventId=' + encodeURIComponent(id)).then((response) => response.json()) as {
    events?: FootballFeedCard[];
  };
  return body.events?.[0] ?? null;
}
