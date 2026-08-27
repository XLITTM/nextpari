import { useState, useMemo } from 'react';
import { SportsScroll } from '../components/SportsScroll';
import { PromoScroll } from '../components/PromoScroll';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader } from '../components/SectionHeader';
import { CasinoGrid } from '../components/CasinoGrid';
import { CasinoCarousel } from '../components/CasinoCarousel';
import { ChampionshipsList } from '../components/ChampionshipsList';
import { CasinoCategoriesScroll } from '../components/CasinoCategoriesScroll';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EsportsDisciplinesScroll } from '../components/EsportsDisciplinesScroll';
import { useLiveMatches } from '../LiveMatchesContext';
import type { MainTab, Screen, SportId } from '../types';

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

  const filteredLive = useMemo(() => {
    const bySport = selectedSport === 'all' ? liveMatches : liveMatches.filter((match) => match.sport === selectedSport);
    return bySport.filter((match) => (selectedSport === 'all' ? match.sport !== 'esports' : true));
  }, [liveMatches, selectedSport]);
  const filteredUpcoming = useMemo(() => {
    const bySport = selectedSport === 'all' ? upcomingMatches : upcomingMatches.filter((match) => match.sport === selectedSport);
    return bySport.filter((match) => (selectedSport === 'all' ? match.sport !== 'esports' : true));
  }, [upcomingMatches, selectedSport]);
  const esportsLiveMatches = liveMatches.filter((match) => match.sport === 'esports');
  const esportsUpcomingMatches = upcomingMatches.filter((match) => match.sport === 'esports');

  if (mainTab === 'casino') {
    return (
      <div>
        <CasinoGrid onNavigate={onNavigate} />
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
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
                {filteredLive.map((match) => (
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
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
              {filteredUpcoming.map((match) => (
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
          ) : loading ? (
            <SkeletonLoader count={2} variant="carousel" />
          ) : (
            <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">Матчи появятся скоро</p>
          )}
        </section>

        <ChampionshipsList />

        <section>
          <CasinoCarousel onNavigate={onNavigate} />
        </section>

        <section>
          <CasinoCategoriesScroll />
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
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
              {esportsLiveMatches.map((match) => (
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
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
              {esportsUpcomingMatches.map((match) => (
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
          </section>
        )}
      </div>
    </div>
  );
}
