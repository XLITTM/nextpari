import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import { MarketsGrid } from '@/components/MarketsGrid';
import { MatchTracker, type HeaderTab, type VenueSport } from '@/components/match/MatchTracker';
import { useBetSlip } from '../BetSlipContext';
import { useLiveMatches } from '../LiveMatchesContext';
import { useLiveOdds } from '../hooks/useLiveOdds';
import { matchEventFromStore } from '../lib/liveMatches';
import { useSportsStore } from '../stores/sportsStore';
import type { Screen } from '../types';

interface MatchDetailsScreenProps {
  matchId: string;
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

function venueSport(sport?: string, sportId?: string): VenueSport {
  const id = String(sportId ?? '');
  const value = String(sport ?? '').toLowerCase();
  if (id === '18' || value === 'basketball') return 'basketball';
  if (id === '13' || value === 'tennis') return 'tennis';
  if (id === '17' || value === 'hockey') return 'hockey';
  if (id === '151' || id === '91' || value === 'esports') return 'esports';
  if (id === '1' || value === 'football') return 'football';
  return 'default';
}

function venueBgClass(kind: VenueSport): string {
  if (kind === 'football') return 'match-bg-football';
  if (kind === 'basketball') return 'match-bg-basketball';
  if (kind === 'tennis') return 'match-bg-tennis';
  if (kind === 'hockey') return 'match-bg-hockey';
  if (kind === 'esports') return 'match-bg-esports';
  return 'match-bg-default';
}

export function MatchDetailsScreen({ matchId, onBack, onNavigate }: MatchDetailsScreenProps) {
  const { findMatch } = useLiveMatches();
  const catalogMatch = findMatch(matchId);
  const storeState = useSportsStore((s) => s.events[matchId]);
  const upsertEvent = useSportsStore((s) => s.upsertEvent);
  const isLive = storeState?.event.time_status === '1' || Boolean(catalogMatch?.isLive);
  const [headerTab, setHeaderTab] = useState<HeaderTab>('info');

  useEffect(() => {
    if (!matchId || storeState || !catalogMatch) return;
    upsertEvent({
      id: matchId,
      sport_id:
        catalogMatch.sport === 'basketball'
          ? '18'
          : catalogMatch.sport === 'tennis'
            ? '13'
            : catalogMatch.sport === 'hockey'
              ? '17'
              : catalogMatch.sport === 'esports'
                ? '151'
                : '1',
      league: { name: catalogMatch.league, cc: catalogMatch.country },
      home: { name: catalogMatch.team1 },
      away: { name: catalogMatch.team2 },
      time_status: catalogMatch.isLive ? '1' : '0',
      start_time: String(Math.floor(catalogMatch.startTime / 1000)),
      ss: catalogMatch.liveScore
        ? `${catalogMatch.liveScore.team1}-${catalogMatch.liveScore.team2}`
        : undefined,
      time: catalogMatch.liveStatus,
    });
  }, [matchId, catalogMatch, storeState, upsertEvent]);

  useLiveOdds(matchId, isLive);

  const match = useMemo(() => {
    const fromStore = storeState ? matchEventFromStore(storeState) : undefined;
    return fromStore ?? catalogMatch;
  }, [catalogMatch, storeState]);
  const { count: betCount } = useBetSlip();

  if (!match) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#F5F5F5]">
        <p className="text-[#1A1A1A]">Матч не найден</p>
      </div>
    );
  }

  const sportKind = venueSport(match.sport, storeState?.event.sport_id);
  const sportLabel =
    sportKind === 'football' ? 'Футбол' :
    sportKind === 'basketball' ? 'Баскетбол' :
    sportKind === 'tennis' ? 'Теннис' :
    sportKind === 'hockey' ? 'Хоккей' :
    sportKind === 'esports' ? 'Киберспорт' : 'Спорт';

  return (
    <div className="flex min-h-full flex-col bg-[#F5F5F5]">
      <MatchTracker
        match={match}
        sportLabel={sportLabel}
        sportKind={sportKind}
        minute={storeState?.matchTime}
        timeStr={storeState?.event.time_str}
        scoreText={storeState?.score}
        clockRunning={storeState?.event.period !== 'HT' && storeState?.event.clock_running !== false}
        period={storeState?.event.period}
        kickoffUnix={Number(storeState?.event.start_time || storeState?.event.time || 0)}
        headerTab={headerTab}
        onHeaderTabChange={setHeaderTab}
        onBack={onBack}
        onLiveClick={() => onNavigate({ name: 'betslip' })}
        venueClassName={venueBgClass(sportKind)}
      />

      <div className="flex-1 overscroll-contain">
        {headerTab === 'info' ? (
          <MarketsGrid eventId={matchId} match={match} />
        ) : (
          <StreamPanel hasStream={Boolean(match.hasStream)} />
        )}
      </div>

      {betCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate({ name: 'betslip' })}
          className="absolute bottom-16 left-3 right-3 z-40 flex items-center justify-between rounded-xl bg-[#22C55E] px-4 py-3 text-white shadow-lg active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold">
              {betCount}
            </div>
            <span className="text-sm font-bold">Купон</span>
          </div>
          <ChevronDown className="h-5 w-5 -rotate-90" />
        </button>
      )}
    </div>
  );
}

function StreamPanel({ hasStream }: { hasStream: boolean }) {
  return (
    <div className="relative z-10 -mt-4 rounded-t-3xl bg-white px-4 pb-24 pt-4 shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl bg-white px-6 text-center shadow-sm">
        <Radio className="mb-3 h-10 w-10 text-[#22C55E]" />
        <p className="text-base font-bold text-[#1A1A1A]">
          {hasStream ? 'Трансляция скоро начнётся' : 'Трансляция недоступна'}
        </p>
        <p className="mt-1 text-sm font-medium text-[#666666]">
          {hasStream ? 'Видео появится в этом блоке после старта эфира.' : 'Для этого матча видеопоток не подключен.'}
        </p>
      </div>
    </div>
  );
}
