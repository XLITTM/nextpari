import { useState, useMemo } from 'react';
import { SportsScroll } from '../components/SportsScroll';
import { PromoScroll } from '../components/PromoScroll';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader } from '../components/SectionHeader';
import { CasinoGrid } from '../components/CasinoGrid';
import { CasinoCarousel } from '../components/CasinoCarousel';
import { ChampionshipsList } from '../components/ChampionshipsList';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EsportsDisciplinesScroll } from '../components/EsportsDisciplinesScroll';
import { useLiveMatches } from '../LiveMatchesContext';
import type { MainTab, MatchEvent, Screen, SportId } from '../types';

interface HomeScreenProps {
  mainTab: MainTab;
  onOpenMatch: (matchId: string) => void;
  onOpenGameList: (mode: 'live' | 'line') => void;
  onNavigate: (screen: Screen) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

export function HomeScreen({
  mainTab,
  onOpenMatch,
  onOpenGameList,
  onNavigate,
  favorites,
  onToggleFavorite,
}: HomeScreenProps) {
  const [selectedSport, setSelectedSport] = useState<SportId>('all');
  const { liveMatches, upcomingMatches, loading } = useLiveMatches();
  const sportFilter = mainTab === 'sport' && selectedSport === 'esports' ? 'all' : selectedSport;

  const filteredLive = useMemo(() => {
    const bySport = selectedSport === 'all' ? liveMatches : liveMatches.filter((match) => match.sport === selectedSport);
    return bySport.filter((match) => (selectedSport === 'all' ? match.sport !== 'esports' : true));
  }, [liveMatches, selectedSport]);
  const filteredUpcoming = useMemo(() => {
    const bySport = selectedSport === 'all' ? upcomingMatches : upcomingMatches.filter((match) => match.sport === selectedSport);
    return bySport.filter((match) => (selectedSport === 'all' ? match.sport !== 'esports' : true));
  }, [upcomingMatches, selectedSport]);
  const sportLiveMatches = useMemo(() => {
    const sportsOnly = liveMatches.filter((match) => match.sport !== 'esports');
    return sportFilter === 'all' ? sportsOnly : sportsOnly.filter((match) => match.sport === sportFilter);
  }, [liveMatches, sportFilter]);
  const sportUpcomingMatches = useMemo(() => {
    const sportsOnly = upcomingMatches.filter((match) => match.sport !== 'esports');
    return sportFilter === 'all' ? sportsOnly : sportsOnly.filter((match) => match.sport === sportFilter);
  }, [upcomingMatches, sportFilter]);
  const esportsLiveMatches = liveMatches.filter((match) => match.sport === 'esports');
  const esportsUpcomingMatches = upcomingMatches.filter((match) => match.sport === 'esports');

  const renderCards = (matches: MatchEvent[]) => (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          onOpenMatch={onOpenMatch}
          carousel
          isFavorite={favorites.includes(match.id)}
          onToggleFavorite={() => onToggleFavorite(match.id)}
        />
      ))}
    </div>
  );

  if (mainTab === 'casino') {
    return (
      <div>
        <CasinoGrid onNavigate={onNavigate} />
      </div>
    );
  }

  if (mainTab === 'esports') {
    return (
      <div>
        <EsportsDisciplinesScroll />
        <div className="flex flex-col gap-6 pt-2">
          <section>
            <SectionHeader
              title="Киберспорт LIVE"
              badge="Esports"
              badgeColor="bg-[#0c1a2e] text-accent-400"
              onSeeAll={() => onNavigate({ name: 'sports', mode: 'cybers' })}
            />
            {esportsLiveMatches.length > 0 ? (
              renderCards(esportsLiveMatches)
            ) : loading ? (
              <SkeletonLoader count={2} variant="carousel" />
            ) : (
              <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
            )}
          </section>
          <section>
            <SectionHeader
              title="Киберспорт Линия"
              badge="Esports"
              badgeColor="bg-[#0c1a2e] text-accent-400"
              onSeeAll={() => onNavigate({ name: 'sports', mode: 'cybers' })}
            />
            {esportsUpcomingMatches.length > 0 ? (
              renderCards(esportsUpcomingMatches)
            ) : loading ? (
              <SkeletonLoader count={2} variant="carousel" />
            ) : (
              <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (mainTab === 'sport') {
    return (
      <div>
        <SportsScroll selected={sportFilter} onSelect={setSelectedSport} excludeEsports />
        <div className="flex flex-col gap-6 pt-2">
          <section>
            <SectionHeader
              title="Популярное LIVE"
              filterLabel="Спорт"
              onFilterClick={() => onOpenGameList('live')}
              onSeeAll={() => onOpenGameList('live')}
            />
            {sportLiveMatches.length > 0 ? (
              renderCards(sportLiveMatches)
            ) : loading ? (
              <SkeletonLoader count={2} variant="carousel" />
            ) : (
              <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
            )}
          </section>
          <section>
            <SectionHeader
              title="Популярное Линия"
              filterLabel="Спорт"
              onFilterClick={() => onOpenGameList('line')}
              onSeeAll={() => onOpenGameList('line')}
            />
            {sportUpcomingMatches.length > 0 ? (
              renderCards(sportUpcomingMatches)
            ) : loading ? (
              <SkeletonLoader count={2} variant="carousel" />
            ) : (
              <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
            )}
          </section>
          <ChampionshipsList
            excludeEsports
            onOpenLeague={(leagueId) => onNavigate({ name: 'league', leagueId })}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SportsScroll selected={selectedSport} onSelect={setSelectedSport} />
      <PromoScroll onNavigate={onNavigate} />

      <div className="flex flex-col gap-6 pt-2">
        {(loading || filteredLive.length > 0) && (
          <section>
            <SectionHeader
              title="Популярное LIVE"
              filterLabel="Спорт"
              onFilterClick={() => onOpenGameList('live')}
              onSeeAll={() => onOpenGameList('live')}
            />
            {filteredLive.length > 0 ? (
              renderCards(filteredLive)
            ) : (
              <SkeletonLoader count={2} variant="carousel" />
            )}
          </section>
        )}

        <section>
          <SectionHeader
            title="Популярное Линия"
            filterLabel="Спорт"
            onFilterClick={() => onOpenGameList('line')}
            onSeeAll={() => onOpenGameList('line')}
          />
          {filteredUpcoming.length > 0 ? (
            renderCards(filteredUpcoming)
          ) : loading ? (
            <SkeletonLoader count={2} variant="carousel" />
          ) : (
            <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
          )}
        </section>

        <ChampionshipsList
          onOpenLeague={(leagueId) => onNavigate({ name: 'league', leagueId })}
        />

        <section>
          <CasinoCarousel onNavigate={onNavigate} />
        </section>

        <section>
          <EsportsDisciplinesScroll />
        </section>

        {esportsLiveMatches.length > 0 && (
          <section>
            <SectionHeader
              title="Киберспорт LIVE"
              badge="Esports"
              badgeColor="bg-[#0c1a2e] text-accent-400"
              onSeeAll={() => onOpenGameList('live')}
            />
            {renderCards(esportsLiveMatches)}
          </section>
        )}

        {esportsUpcomingMatches.length > 0 && (
          <section>
            <SectionHeader
              title="Киберспорт Линия"
              badge="Esports"
              badgeColor="bg-[#0c1a2e] text-accent-400"
              onSeeAll={() => onOpenGameList('line')}
            />
            {renderCards(esportsUpcomingMatches)}
          </section>
        )}
      </div>
    </div>
  );
}
