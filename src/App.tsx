import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SearchModal } from './components/SearchModal';
import { BetSlipProvider, useBetSlip } from './BetSlipContext';
import { ToastProvider } from './ToastContext';
import { QuickBetProvider } from './QuickBetContext';
import { QuickBetSheet } from './components/QuickBetSheet';
import { ThemeProvider } from './ThemeContext';
import { ProfileProvider } from './ProfileContext';
import { WalletProvider, useWallet } from './WalletContext';
import { LiveMatchesProvider } from './LiveMatchesContext';
import { HomeScreen } from './screens/HomeScreen';
import { MatchDetailsScreen } from './screens/MatchDetailsScreen';
import { BetSlipScreen } from './screens/BetSlipScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { BetDetailsScreen } from './screens/BetDetailsScreen';
import { MenuScreen } from './screens/MenuScreen';
import { WalletScreen } from './screens/WalletScreen';
import { PromoScreen } from './screens/PromoScreen';
import { PersonalDataScreen } from './screens/PersonalDataScreen';
import { GameListScreen } from './screens/GameListScreen';
import { SportsListScreen } from './screens/SportsListScreen';
import type { Screen, SportId } from './types';
import { ChampionshipsScreen } from './screens/ChampionshipsScreen';
import { SlotsScreen } from './screens/SlotsScreen';
import { LiveCasinoScreen } from './screens/LiveCasinoScreen';
import { GamesScreen } from './screens/GamesScreen';
import { CrystalGame } from './games/crystal/CrystalGame';
import { PromoDetailsScreen } from './screens/PromoDetailsScreen';
import { PromoMarathonScreen } from './screens/PromoMarathonScreen';
import { PromoWelcomeScreen } from './screens/PromoWelcomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InfoScreen } from './screens/InfoScreen';
import { PromoUnbeatableScreen } from './screens/PromoUnbeatableScreen';
import { BlackjackGame } from './games/blackjack/BlackjackGame';
import { AviatorGame } from './games/aviator/AviatorGame';
import { ApplesGame } from './games/apples/ApplesGame';
import { BetHistoryProvider } from './BetHistoryContext';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';
import { bootstrapGuestSession, signInSession, signOutSession } from './hooks/useAuth';

const GAMES_PATH = '/games';
const BLACKJACK_PATH = '/games/blackjack';
const AVIATOR_PATH = '/games/aviator';
const APPLES_PATH = '/games/apples';
const CRYSTAL_PATH = '/games/crystal';
function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function screenFromPath(): Screen {
  const path = currentPath();
  if (path === BLACKJACK_PATH || path === '/games/21') return { name: 'blackjack' };
  if (path === AVIATOR_PATH) return { name: 'aviator' };
  if (path === APPLES_PATH) return { name: 'apples' };
  if (path === CRYSTAL_PATH) return { name: 'crystal' };
  if (path === GAMES_PATH) return { name: 'games' };
  return { name: 'home' };
}

function pathForScreen(screen: Screen): string {
  if (screen.name === 'blackjack') return BLACKJACK_PATH;
  if (screen.name === 'aviator') return AVIATOR_PATH;
  if (screen.name === 'apples') return APPLES_PATH;
  if (screen.name === 'crystal') return CRYSTAL_PATH;
  if (screen.name === 'games') return GAMES_PATH;
  return '/';
}

function syncPath(screen: Screen) {
  const target = pathForScreen(screen);
  if (currentPath() === target) return;
  window.history.pushState({ name: screen.name }, '', target);
}

function navActive(name: Screen['name']): Screen['name'] {
  if (name === 'home' || name === 'favorites' || name === 'history' || name === 'menu' || name === 'betslip') {
    return name;
  }
  if (name === 'bet-details') return 'history';
  if (
    name === 'match' ||
    name === 'gamelist' ||
    name === 'games' ||
    name === 'blackjack' ||
    name === 'aviator' ||
    name === 'apples' ||
    name === 'crystal' ||
    name === 'promo-details' ||
    name === 'promo-marathon' ||
    name === 'promo-welcome' ||
    name === 'promo-unbeatable'
  ) {
    return 'home';
  }
  return 'menu';
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => bootstrapGuestSession());
  const [screen, setScreenState] = useState<Screen>(screenFromPath);
  const [searchOpen, setSearchOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const { count } = useBetSlip();

  const setScreen = useCallback((next: Screen) => {
    setScreenState(next);
    syncPath(next);
  }, []);

  useEffect(() => {
    const onPop = () => setScreenState(screenFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleAuthSuccess = () => {
    signInSession();
    setIsAuthenticated(true);
    setScreen(screenFromPath());
  };

  const handleLogout = () => {
    signOutSession();
    setIsAuthenticated(false);
  };

  const { balance } = useWallet();

  const toggleFavorite = (matchId: string) => {
    setFavorites((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );
  };

  const openMatch = (matchId: string) => setScreen({ name: 'match', matchId });
  const goHome = () => setScreen({ name: 'home' });
  const openGameList = (mode: 'live' | 'line') => setScreen({ name: 'gamelist', mode });

  const showHeader = screen.name === 'home' || screen.name === 'favorites';
  const isArcade =
    screen.name === 'blackjack' ||
    screen.name === 'aviator' ||
    screen.name === 'apples' ||
    screen.name === 'crystal';
  const isGamesHub = screen.name === 'games';

  const renderScreen = () => {
    switch (screen.name) {
      case 'home':
        return (
          <HomeScreen
            onOpenMatch={openMatch}
            onOpenGameList={openGameList}
            onNavigate={setScreen}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        );
      case 'favorites':
        return (
          <FavoritesScreen
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onOpenMatch={openMatch}
          />
        );
      case 'history':
        return <HistoryScreen onNavigate={setScreen} balance={balance} />;
      case 'bet-details':
        return (
          <BetDetailsScreen
            betId={screen.betId}
            onBack={() => setScreen({ name: 'history' })}
          />
        );
      case 'menu':
        return <MenuScreen balance={balance} onNavigate={setScreen} onLogout={handleLogout} />;
      case 'wallet':
        return <WalletScreen balance={balance} onBack={() => setScreen({ name: 'menu' })} onNavigate={setScreen} />;
      case 'promo':
        return <PromoScreen onBack={() => setScreen({ name: 'menu' })} onNavigate={setScreen} />;
      case 'personal-data':
        return <PersonalDataScreen onBack={() => setScreen({ name: 'menu' })} />;
      case 'settings':
        return (
          <SettingsScreen
            onBack={() => setScreen({ name: 'home' })}
            onNavigate={setScreen}
            onLogout={handleLogout}
          />
        );
      case 'info':
        return <InfoScreen onBack={() => setScreen({ name: 'menu' })} />;
      case 'gamelist':
        return (
          <GameListScreen
            mode={screen.mode}
            onBack={goHome}
            onSearchClick={() => setSearchOpen(true)}
            onOpenMatch={openMatch}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        );
      case 'sports':
        return (
          <SportsListScreen
            initialMode={screen.mode}
            onBack={() => setScreen({ name: 'menu' })}
            onNavigate={setScreen}
          />
        );
      case 'championships':
        return (
          <ChampionshipsScreen
            sport={screen.sport as SportId}
            initialMode={screen.mode as 'live' | 'line'}
            onBack={() => setScreen({ name: 'sports', mode: screen.mode as 'live' | 'line' | 'cybers' })}
            onNavigate={setScreen}
          />
        );
      case 'slots':
        return <SlotsScreen onBack={() => setScreen({ name: 'menu' })} onNavigate={setScreen} />;
      case 'live-casino':
        return <LiveCasinoScreen onBack={() => setScreen({ name: 'menu' })} onNavigate={setScreen} />;
      case 'games':
        return <GamesScreen onBack={goHome} onNavigate={setScreen} />;
      case 'crystal':
        return <CrystalGame onBack={() => setScreen({ name: 'games' })} />;
      case 'promo-details':
        return <PromoDetailsScreen onBack={() => setScreen({ name: 'home' })} onNavigate={setScreen} />;
      case 'promo-marathon':
        return <PromoMarathonScreen onBack={() => setScreen({ name: 'home' })} onNavigate={setScreen} />;
      case 'promo-welcome':
        return <PromoWelcomeScreen onBack={() => setScreen({ name: 'home' })} onNavigate={setScreen} />;
      case 'promo-unbeatable':
        return <PromoUnbeatableScreen onBack={() => setScreen({ name: 'home' })} onNavigate={setScreen} />;
      case 'match':
        return (
          <MatchDetailsScreen
            matchId={screen.matchId}
            onBack={goHome}
            onNavigate={setScreen}
          />
        );
      case 'betslip':
        return (
          <BetSlipScreen
            balance={balance}
            onClose={() => setScreen({ name: 'home' })}
            onNavigateHome={goHome}
            onNavigate={setScreen}
          />
        );
      case 'blackjack':
        return <BlackjackGame onBack={() => setScreen({ name: 'games' })} />;
      case 'aviator':
        return <AviatorGame onBack={() => setScreen({ name: 'games' })} />;
      case 'apples':
        return <ApplesGame onBack={() => setScreen({ name: 'games' })} />;
      default:
        return null;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto">
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className={isArcade
      ? `relative h-[100dvh] overflow-hidden ${
          screen.name === 'aviator'
            ? 'bg-[#14021f]'
            : screen.name === 'apples' || screen.name === 'crystal'
              ? 'bg-[#07140c]'
              : 'bg-[#031c1a]'
        }`
      : 'flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 max-w-lg mx-auto relative'
    }>
      {showHeader && (
        <Header balance={balance} onSearchClick={() => setSearchOpen(true)} onNavigate={setScreen} />
      )}

      <div className={isArcade ? 'h-[100dvh] overflow-hidden' : isGamesHub ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto pb-24'}>
        <ErrorBoundary resetKey={screen.name}>
          {renderScreen()}
        </ErrorBoundary>
      </div>

      {!isArcade && !isGamesHub && (
        <BottomNav
          active={navActive(screen.name)}
          onChange={setScreen}
          betCount={count}
        />
      )}

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BetSlipProvider>
        <ToastProvider>
          <QuickBetProvider>
            <ProfileProvider>
              <WalletProvider>
                <LiveMatchesProvider>
                  <BetHistoryProvider>
                    <ErrorBoundary>
                      <AppContent />
                      <QuickBetSheet />
                      <InstallPwaPrompt />
                    </ErrorBoundary>
                  </BetHistoryProvider>
                </LiveMatchesProvider>
              </WalletProvider>
            </ProfileProvider>
          </QuickBetProvider>
        </ToastProvider>
      </BetSlipProvider>
    </ThemeProvider>
  );
}
