import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { Header } from './components/Header';
import { MainTabs } from './components/MainTabs';
import { BottomNav } from './components/BottomNav';
import { SearchModal } from './components/SearchModal';
import { BetSlipProvider, useBetSlip } from './BetSlipContext';
import { ToastProvider } from './ToastContext';
import { QuickBetProvider } from './QuickBetContext';
import { QuickBetSheet } from './components/QuickBetSheet';
import { ThemeProvider } from './ThemeContext';
import { ProfileProvider, useProfile } from './ProfileContext';
import { WalletProvider, useWallet, formatPlayerMoney } from './WalletContext';
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
import type { Screen, SportId, MainTab } from './types';
import { setArcadeSportsPaused } from './lib/sportsPollGate';
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
import { DiceGame } from './games/dice/DiceGame';
import { PharaohTreasure } from './games/pharaoh/PharaohTreasure';
import { VipCashbackScreen } from './screens/VipCashbackScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { BetHistoryProvider } from './BetHistoryContext';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';
import { clearDemoPlayerState, fetchPlayerMe, signOutPlayer } from './lib/playerAuth';
import { useUserStore } from './stores/userStore';
import { useFavoritesStore } from './stores/favoritesStore';
import { subscribeMatchSoundToast } from './services/matchSoundService';
import { useToast } from './ToastContext';
import { AppRoutes, currentStaffPortal } from './routes';
import { leaguePath } from './lib/leagueRoute';

const GAMES_PATH = '/games';
const BLACKJACK_PATH = '/games/blackjack';
const AVIATOR_PATH = '/games/aviator';
const APPLES_PATH = '/games/apples';
const CRYSTAL_PATH = '/games/crystal';
const DICE_PATH = '/games/dice';
const PHARAOH_PATH = '/games/pharaoh';
const VIP_CASHBACK_PATH = '/casino/vip-cashback';
function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function screenFromPath(): Screen {
  const path = currentPath();
  if (path === BLACKJACK_PATH || path === '/games/21') return { name: 'blackjack' };
  if (path === AVIATOR_PATH) return { name: 'aviator' };
  if (path === APPLES_PATH) return { name: 'apples' };
  if (path === CRYSTAL_PATH) return { name: 'crystal' };
  if (path === DICE_PATH) return { name: 'dice' };
  if (path === PHARAOH_PATH) return { name: 'pharaoh' };
  if (path === VIP_CASHBACK_PATH) return { name: 'vip-cashback' };
  if (path === GAMES_PATH) return { name: 'games' };
  if (path.startsWith('/league/')) {
    const leagueId = decodeURIComponent(path.slice('/league/'.length));
    if (leagueId) return { name: 'league', leagueId };
  }
  return { name: 'home' };
}

function pathForScreen(screen: Screen): string {
  if (screen.name === 'blackjack') return BLACKJACK_PATH;
  if (screen.name === 'aviator') return AVIATOR_PATH;
  if (screen.name === 'apples') return APPLES_PATH;
  if (screen.name === 'crystal') return CRYSTAL_PATH;
  if (screen.name === 'dice') return DICE_PATH;
  if (screen.name === 'pharaoh') return PHARAOH_PATH;
  if (screen.name === 'vip-cashback') return VIP_CASHBACK_PATH;
  if (screen.name === 'games') return GAMES_PATH;
  if (screen.name === 'league') return leaguePath(screen.leagueId);
  return '/';
}

type PlayerHistoryState = {
  nextpari: true;
  screen: Screen;
  depth: number;
  overlay?: 'search';
};

function screensEqual(a: Screen, b: Screen): boolean {
  if (a.name !== b.name) return false;
  switch (a.name) {
    case 'match':
      return a.matchId === (b as { matchId: string }).matchId;
    case 'bet-details':
      return a.betId === (b as { betId: string }).betId;
    case 'gamelist':
      return a.mode === (b as { mode: 'live' | 'line' }).mode;
    case 'sports':
      return a.mode === (b as { mode: 'live' | 'line' | 'cybers' }).mode;
    case 'championships':
      return a.sport === (b as { sport: string }).sport && a.mode === (b as { mode: 'live' | 'line' }).mode;
    case 'league':
      return a.leagueId === (b as { leagueId: string }).leagueId;
    default:
      return true;
  }
}

function readPlayerHistory(state: unknown): PlayerHistoryState | null {
  if (!state || typeof state !== 'object') return null;
  const raw = state as { nextpari?: unknown; screen?: Screen; depth?: unknown; overlay?: unknown };
  if (raw.nextpari !== true || !raw.screen || typeof raw.screen !== 'object' || typeof raw.screen.name !== 'string') {
    return null;
  }
  const depth = typeof raw.depth === 'number' && Number.isInteger(raw.depth) && raw.depth >= 0 ? raw.depth : 0;
  const parsed: PlayerHistoryState = { nextpari: true, screen: raw.screen, depth };
  if (raw.overlay === 'search') parsed.overlay = 'search';
  return parsed;
}

function fallbackScreen(screen: Screen): Screen {
  switch (screen.name) {
    case 'bet-details':
      return { name: 'history' };
    case 'wallet':
    case 'promo':
    case 'personal-data':
    case 'info':
    case 'sports':
    case 'slots':
    case 'live-casino':
      return { name: 'menu' };
    case 'championships':
      return { name: 'sports', mode: screen.mode };
    case 'blackjack':
    case 'aviator':
    case 'apples':
    case 'crystal':
    case 'dice':
    case 'pharaoh':
      return { name: 'games' };
    case 'vip-cashback':
      return { name: 'promo' };
    default:
      return { name: 'home' };
  }
}

function writeHistory(screen: Screen, depth: number, mode: 'push' | 'replace', overlay?: 'search') {
  const state: PlayerHistoryState = overlay
    ? { nextpari: true, screen, depth, overlay }
    : { nextpari: true, screen, depth };
  const url = pathForScreen(screen);
  if (mode === 'replace') window.history.replaceState(state, '', url);
  else window.history.pushState(state, '', url);
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
    name === 'dice' ||
    name === 'pharaoh' ||
    name === 'vip-cashback' ||
    name === 'promo-details' ||
    name === 'promo-marathon' ||
    name === 'promo-welcome' ||
    name === 'promo-unbeatable' ||
    name === 'league'
  ) {
    return 'home';
  }
  return 'menu';
}

function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [screen, setScreenState] = useState<Screen>(screenFromPath);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('top');
  const screenRef = useRef(screen);
  const depthRef = useRef(0);
  screenRef.current = screen;
  const favoriteMatchIds = useFavoritesStore((s) => s.favoriteMatchIds);
  const toggleMatchFavorite = useFavoritesStore((s) => s.toggleMatchFavorite);
  const { showToast } = useToast();
  const { count } = useBetSlip();

  const replaceScreen = useCallback((next: Screen) => {
    setSearchOpen(false);
    writeHistory(next, 0, 'replace');
    depthRef.current = 0;
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const setScreen = useCallback((next: Screen) => {
    const hist = readPlayerHistory(window.history.state);
    if (hist?.overlay === 'search') {
      if (screensEqual(screenRef.current, next)) {
        window.history.back();
        return;
      }
      writeHistory(next, hist.depth, 'replace');
      depthRef.current = hist.depth;
      screenRef.current = next;
      setSearchOpen(false);
      setScreenState(next);
      return;
    }
    if (screensEqual(screenRef.current, next)) return;
    const depth = depthRef.current + 1;
    writeHistory(next, depth, 'push');
    depthRef.current = depth;
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const openSearch = useCallback(() => {
    const hist = readPlayerHistory(window.history.state);
    if (hist?.overlay === 'search') {
      setSearchOpen(true);
      return;
    }
    const depth = depthRef.current + 1;
    writeHistory(screenRef.current, depth, 'push', 'search');
    depthRef.current = depth;
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    const hist = readPlayerHistory(window.history.state);
    if (hist?.overlay === 'search') {
      window.history.back();
      return;
    }
    setSearchOpen(false);
  }, []);

  const goBack = useCallback(() => {
    const hist = readPlayerHistory(window.history.state);
    if (hist?.overlay === 'search') {
      window.history.back();
      return;
    }
    setSearchOpen(false);
    if (depthRef.current > 0) {
      window.history.back();
      return;
    }
    const fallback = fallbackScreen(screenRef.current);
    if (screensEqual(fallback, screenRef.current)) return;
    replaceScreen(fallback);
  }, [replaceScreen]);

  useEffect(() => {
    const existing = readPlayerHistory(window.history.state);
    const initial = screenFromPath();
    const pathLocked = pathForScreen(initial) !== '/' || initial.name !== 'home';
    if (pathLocked) {
      if (!existing || !screensEqual(existing.screen, initial)) {
        writeHistory(initial, 0, 'replace');
        depthRef.current = 0;
        screenRef.current = initial;
        setScreenState(initial);
        setSearchOpen(false);
      } else {
        depthRef.current = existing.depth;
        setSearchOpen(existing.overlay === 'search');
      }
      return;
    }
    if (existing) {
      depthRef.current = existing.depth;
      screenRef.current = existing.screen;
      setScreenState(existing.screen);
      setSearchOpen(existing.overlay === 'search');
      return;
    }
    writeHistory(initial, 0, 'replace');
    depthRef.current = 0;
  }, []);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const parsed = readPlayerHistory(event.state);
      if (parsed) {
        depthRef.current = parsed.depth;
        screenRef.current = parsed.screen;
        setScreenState(parsed.screen);
        setSearchOpen(parsed.overlay === 'search');
        return;
      }
      setSearchOpen(false);
      const fromPath = screenFromPath();
      writeHistory(fromPath, 0, 'replace');
      depthRef.current = 0;
      screenRef.current = fromPath;
      setScreenState(fromPath);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    clearDemoPlayerState();
    let cancelled = false;
    void fetchPlayerMe().then((snapshot) => {
      if (cancelled) return;
      setIsAuthenticated(Boolean(snapshot?.authenticated));
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { balance, available, loading: walletLoading, refresh: refreshWallet } = useWallet();
  const { refresh: refreshProfile, reset: resetProfile } = useProfile();

  const handleAuthSuccess = async () => {
    await Promise.all([refreshWallet(), refreshProfile()]);
    setIsAuthenticated(true);
    replaceScreen(screenFromPath());
  };

  const handleLogout = () => {
    useUserStore.getState().reset();
    resetProfile();
    void signOutPlayer().finally(() => {
      setIsAuthenticated(false);
    });
  };
  const moneyLabel = formatPlayerMoney(balance, available, walletLoading);

  useEffect(() => {
    return subscribeMatchSoundToast(({ title, body }) => {
      showToast(`${title} ${body}`);
    });
  }, [showToast]);

  const toggleFavorite = (matchId: string) => {
    toggleMatchFavorite(matchId);
  };

  const openMatch = (matchId: string) => setScreen({ name: 'match', matchId });
  const goHome = () => setScreen({ name: 'home' });
  const openGameList = (mode: 'live' | 'line') => setScreen({ name: 'gamelist', mode });

  const handleMainTab = (tab: MainTab) => {
    if (tab === 'games') {
      setScreen({ name: 'games' });
      return;
    }
    setMainTab(tab);
    if (screen.name !== 'home') setScreen({ name: 'home' });
  };

  const showHeader = screen.name === 'home' || screen.name === 'favorites';
  const isArcade =
    screen.name === 'blackjack' ||
    screen.name === 'aviator' ||
    screen.name === 'apples' ||
    screen.name === 'crystal' ||
    screen.name === 'dice' ||
    screen.name === 'pharaoh';

  useEffect(() => {
    setArcadeSportsPaused(isArcade);
    return () => setArcadeSportsPaused(false);
  }, [isArcade]);
  const isGamesHub = screen.name === 'games';
  const isVipCashback = screen.name === 'vip-cashback';

  const renderScreen = () => {
    switch (screen.name) {
      case 'home':
        return (
          <HomeScreen
            mainTab={mainTab}
            onOpenMatch={openMatch}
            onOpenGameList={openGameList}
            onNavigate={setScreen}
            favorites={favoriteMatchIds}
            onToggleFavorite={toggleFavorite}
          />
        );
      case 'favorites':
        return (
          <FavoritesScreen
            favorites={favoriteMatchIds}
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
            onBack={goBack}
          />
        );
      case 'menu':
        return <MenuScreen balance={balance} balanceLabel={moneyLabel} onNavigate={setScreen} onLogout={handleLogout} />;
      case 'wallet':
        return (
          <WalletScreen
            balance={balance}
            onBack={goBack}
            onNavigate={setScreen}
          />
        );
      case 'promo':
        return <PromoScreen onBack={goBack} onNavigate={setScreen} />;
      case 'personal-data':
        return <PersonalDataScreen onBack={goBack} />;
      case 'settings':
        return (
          <SettingsScreen
            onBack={goBack}
            onNavigate={setScreen}
            onLogout={handleLogout}
          />
        );
      case 'info':
        return <InfoScreen onBack={goBack} />;
      case 'gamelist':
        return (
          <GameListScreen
            mode={screen.mode}
            onBack={goBack}
            onSearchClick={openSearch}
            onOpenMatch={openMatch}
            favorites={favoriteMatchIds}
            onToggleFavorite={toggleFavorite}
          />
        );
      case 'sports':
        return (
          <SportsListScreen
            initialMode={screen.mode}
            onBack={goBack}
            onNavigate={setScreen}
            onSearchClick={openSearch}
          />
        );
      case 'championships':
        return (
          <ChampionshipsScreen
            sport={screen.sport as SportId}
            initialMode={screen.mode as 'live' | 'line'}
            onBack={goBack}
            onNavigate={setScreen}
          />
        );
      case 'slots':
        return <SlotsScreen onBack={goBack} onNavigate={setScreen} />;
      case 'live-casino':
        return <LiveCasinoScreen onBack={goBack} onNavigate={setScreen} />;
      case 'games':
        return <GamesScreen onBack={goBack} onNavigate={setScreen} />;
      case 'crystal':
        return <CrystalGame onBack={goBack} />;
      case 'dice':
        return <DiceGame onBack={goBack} />;
      case 'pharaoh':
        return <PharaohTreasure onBack={goBack} />;
      case 'vip-cashback':
        return (
          <VipCashbackScreen
            onBack={goBack}
            onNavigate={setScreen}
          />
        );
      case 'promo-details':
        return <PromoDetailsScreen onBack={goBack} onNavigate={setScreen} />;
      case 'promo-marathon':
        return <PromoMarathonScreen onBack={goBack} onNavigate={setScreen} />;
      case 'promo-welcome':
        return <PromoWelcomeScreen onBack={goBack} onNavigate={setScreen} />;
      case 'promo-unbeatable':
        return <PromoUnbeatableScreen onBack={goBack} onNavigate={setScreen} />;
      case 'match':
        return (
          <MatchDetailsScreen
            matchId={screen.matchId}
            onBack={goBack}
            onNavigate={setScreen}
          />
        );
      case 'betslip':
        return (
          <BetSlipScreen
            balance={balance}
            onClose={goBack}
            onNavigateHome={goHome}
            onNavigate={setScreen}
          />
        );
      case 'blackjack':
        return <BlackjackGame onBack={goBack} />;
      case 'aviator':
        return <AviatorGame onBack={goBack} />;
      case 'apples':
        return <ApplesGame onBack={goBack} />;
      case 'league':
        return (
          <LeagueScreen
            leagueId={screen.leagueId}
            onBack={goBack}
            onOpenMatch={openMatch}
            favorites={favoriteMatchIds}
            onToggleFavorite={toggleFavorite}
          />
        );
      default:
        return null;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-ink-900 via-ink-850 to-ink-950">
        <p className="text-sm font-semibold text-ink-300">Загрузка…</p>
      </div>
    );
  }

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
            : screen.name === 'apples' || screen.name === 'crystal' || screen.name === 'dice'
              ? 'bg-[#07140c]'
              : 'bg-[#031c1a]'
        }`
      : 'relative mx-auto flex h-screen max-w-lg flex-col overflow-hidden bg-[#f0f2f5] dark:bg-gray-900'
    }>
      {showHeader && (
        <Header balanceLabel={moneyLabel} onSearchClick={openSearch} onNavigate={setScreen}>
          {screen.name === 'home' && <MainTabs active={mainTab} onChange={handleMainTab} />}
        </Header>
      )}

      <div className={isArcade ? 'h-[100dvh] overflow-hidden' : isGamesHub || isVipCashback ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto pb-24'}>
        <ErrorBoundary resetKey={screen.name}>
          {renderScreen()}
        </ErrorBoundary>
      </div>

      {!isArcade && !isGamesHub && !isVipCashback && (
        <BottomNav
          active={navActive(screen.name)}
          onChange={setScreen}
          betCount={count}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={closeSearch}
          onSelectMatch={(match) => openMatch(match.id)}
        />
      )}
    </div>
  );
}

export default function App() {
  const [portal, setPortal] = useState(() => currentStaffPortal());

  useEffect(() => {
    const sync = () => setPortal(currentStaffPortal());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // Isolated staff portals — no shared session, no cross-redirects:
  // /#/agent      → кассир
  // /#/manager    → менеджер (логин), /#/manager/dashboard → кабинет
  // /#/backoffice → владелец / Superadmin
  if (portal) {
    return (
      <ErrorBoundary>
        <AppRoutes portal={portal} />
      </ErrorBoundary>
    );
  }

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
