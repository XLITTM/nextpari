import { useState, useMemo } from 'react';
import { MainTabs } from '../components/MainTabs';
import { SportsScroll } from '../components/SportsScroll';
import { PromoScroll } from '../components/PromoScroll';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader } from '../components/SectionHeader';
import { CasinoGrid } from '../components/CasinoGrid';
import { CasinoCarousel } from '../components/CasinoCarousel';
import { ChampionshipsList } from '../components/ChampionshipsList';
import { CasinoCategoriesScroll } from '../components/CasinoCategoriesScroll';
import { EsportsDisciplinesScroll } from '../components/EsportsDisciplinesScroll';
import { useLiveMatches } from '../LiveMatchesContext';
import type { MainTab, Screen, SportId } from '../types';

interface HomeScreenProps {
  onOpenMatch: (matchId: string) => void;
  onOpenGameList: (mode: 'live' | 'line') => void;
  onNavigate: (screen: Screen) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

export function HomeScreen({ onOpenMatch, onOpenGameList, onNavigate, favorites, onToggleFavorite }: HomeScreenProps) {
  const [mainTab, setMainTab] = useState<MainTab>('top');
  const [selectedSport, setSelectedSport] = useState<SportId>('all');
  const { liveMatches, upcomingMatches } = useLiveMatches();

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

  const handleMainTab = (tab: MainTab) => {
    if (tab === 'games') {
      onNavigate({ name: 'games' });
      return;
    }
    setMainTab(tab);
  };

  if (mainTab === 'casino') {
    return (
      <div>
        <MainTabs active={mainTab} onChange={handleMainTab} />
        <CasinoGrid onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div>
      <MainTabs active={mainTab} onChange={handleMainTab} />
      <SportsScroll selected={selectedSport} onSelect={setSelectedSport} />
      <PromoScroll onNavigate={onNavigate} />

      <div className="space-y-1 pt-2">
        {filteredLive.length > 0 && (
          <section>
            <SectionHeader
              title="Популярное LIVE"
              filterLabel="Спорт"
              onFilterClick={() => onOpenGameList('live')}
              onSeeAll={() => onOpenGameList('live')}
            />
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
          </section>
        )}

        {filteredUpcoming.length > 0 && (
          <section className="mt-4">
            <SectionHeader
              title="Популярное Линия"
              filterLabel="Спорт"
              onFilterClick={() => onOpenGameList('line')}
              onSeeAll={() => onOpenGameList('line')}
            />
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
          </section>
        )}

        {filteredUpcoming.length > 0 && (
          <section className="mt-4">
            <CasinoCarousel onNavigate={onNavigate} />
          </section>
        )}

        {/* Casino Categories */}
        <section className="mt-4">
          <CasinoCategoriesScroll />
        </section>

        {/* Championships LIVE */}
        <section className="mt-4">
          <ChampionshipsList />
        </section>

        {/* Esports Disciplines */}
        <section className="mt-4">
          <EsportsDisciplinesScroll />
        </section>

        {/* Esports LIVE */}
        {esportsLiveMatches.length > 0 && (
          <section className="mt-4">
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

        {/* Esports Line */}
        {esportsUpcomingMatches.length > 0 && (
          <section className="mt-4">
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

        {filteredLive.length === 0 && filteredUpcoming.length === 0 && (
          <div className="text-center py-20 text-gray-600 dark:text-gray-200 text-sm font-bold">
            Нет матчей в этом виде спорта
          </div>
        )}
      </div>
    </div>
  );
}
