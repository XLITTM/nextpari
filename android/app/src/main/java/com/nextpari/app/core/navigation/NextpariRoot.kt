package com.nextpari.app.core.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.nextpari.app.BuildConfig
import com.nextpari.app.MainActivity
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.components.NextpariBottomNav
import com.nextpari.app.core.ui.components.NextpariHeader
import com.nextpari.app.core.ui.components.NextpariMainTabs
import com.nextpari.app.core.ui.components.PlaceholderScreen
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.SessionRestorePhase
import com.nextpari.app.feature.auth.AuthViewModel
import com.nextpari.app.feature.launch.LaunchPresentation
import com.nextpari.app.feature.launch.SessionRestoreScreen
import com.nextpari.app.feature.launch.SplashBrandScreen
import com.nextpari.app.feature.launch.WelcomePreferences
import com.nextpari.app.feature.launch.WelcomeScreen
import com.nextpari.app.feature.auth.ForgotPasswordScreen
import com.nextpari.app.feature.auth.LoginScreen
import com.nextpari.app.feature.auth.RegisterEmailScreen
import com.nextpari.app.feature.auth.RegisterMenuScreen
import com.nextpari.app.feature.auth.RegisterOneClickResultScreen
import com.nextpari.app.feature.auth.RegisterOneClickScreen
import com.nextpari.app.feature.auth.RegisterPhoneScreen
import com.nextpari.app.feature.games.NativeGameScreen
import com.nextpari.app.feature.history.HistoryScreen
import com.nextpari.app.feature.home.GamesHubScreen
import com.nextpari.app.feature.home.HomeScreen
import com.nextpari.app.feature.home.HomeViewModel
import com.nextpari.app.feature.info.InfoScreen
import com.nextpari.app.feature.menu.MenuScreen
import com.nextpari.app.feature.profile.PersonalDataScreen
import com.nextpari.app.feature.promo.PromoDetailsScreen
import com.nextpari.app.feature.promo.PromoMarathonScreen
import com.nextpari.app.feature.promo.PromoScreen
import com.nextpari.app.feature.promo.PromoUnbeatableScreen
import com.nextpari.app.feature.promo.PromoWelcomeScreen
import com.nextpari.app.feature.promo.VipCashbackScreen
import com.nextpari.app.feature.settings.SettingsScreen
import com.nextpari.app.feature.sportsbook.ChampionshipsScreen
import com.nextpari.app.feature.sportsbook.GameListScreen
import com.nextpari.app.feature.sportsbook.MatchDetailsScreen
import com.nextpari.app.feature.sportsbook.SportsListScreen
import com.nextpari.app.feature.sportsbook.SportsbookPreviewData
import com.nextpari.app.feature.sportsbook.SportsbookViewModel
import com.nextpari.app.feature.sportsbook.LeagueScreen
import com.nextpari.app.feature.wallet.WalletScreen
import com.nextpari.app.feature.wallets.WalletsCatalog
import com.nextpari.app.feature.wallets.WalletsScreen
import com.nextpari.app.feature.wallets.WalletsViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun NextpariRoot(
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    authViewModel: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val session by authViewModel.session.collectAsStateWithLifecycle()
    val sessionReady by authViewModel.sessionReady.collectAsStateWithLifecycle()
    val restorePhase by AppGraph.sessionRestorePhase.collectAsStateWithLifecycle()
    val restoreDetail by AppGraph.sessionRestoreDetail.collectAsStateWithLifecycle()
    var welcomeCompleted by remember { mutableStateOf<Boolean?>(null) }
    var revisitWelcome by rememberSaveable { mutableStateOf(false) }
    var holdSplash by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val sessionNow = rememberUpdatedState(session)
    val activity = LocalContext.current as? MainActivity
    val resumeBrand = activity?.resumeBrand?.value == true
    LaunchedEffect(Unit) {
        welcomeCompleted = WelcomePreferences(AppGraph.preferencesStorage).isCompleted()
    }
    LaunchedEffect(holdSplash) {
        if (holdSplash) {
            delay(LaunchPresentation.BRAND_MS)
            holdSplash = false
        }
    }
    LaunchedEffect(resumeBrand) {
        if (resumeBrand && LaunchPresentation.holdSplashOnResume(sessionNow.value.isAuthenticated)) {
            holdSplash = true
        }
        activity?.resumeBrand?.value = false
    }
    val checking = !sessionReady || restorePhase == SessionRestorePhase.Checking ||
        (!session.isAuthenticated && welcomeCompleted == null && restorePhase != SessionRestorePhase.Failed)
    val showSplash = holdSplash || (checking && restorePhase != SessionRestorePhase.Failed)
    val openLogin: () -> Unit = {
        scope.launch {
            WelcomePreferences(AppGraph.preferencesStorage).markCompleted()
            welcomeCompleted = true
            revisitWelcome = false
        }
    }
    Box(Modifier.fillMaxSize()) {
        if (!checking || restorePhase == SessionRestorePhase.Failed) {
            when {
                restorePhase == SessionRestorePhase.Failed && !session.isAuthenticated -> {
                    SessionRestoreScreen(
                        message = restoreDetail ?: "Нет соединения с сетью",
                        onRetry = AppGraph::retrySessionRestore,
                    )
                }
                !session.isAuthenticated && (welcomeCompleted == false || revisitWelcome) -> {
                    if (revisitWelcome) {
                        BackHandler { revisitWelcome = false }
                    }
                    WelcomeScreen(
                        onContinue = openLogin,
                        onExistingAccount = openLogin,
                    )
                }
                !session.isAuthenticated -> {
                    UnauthenticatedNavHost(
                        authViewModel = authViewModel,
                        onOpenWelcome = { revisitWelcome = true },
                        onToggleTheme = onToggleTheme,
                    )
                }
                else -> {
                    AuthenticatedShell(
                        authViewModel = authViewModel,
                        darkTheme = darkTheme,
                        onToggleTheme = onToggleTheme,
                    )
                }
            }
        }
        if (showSplash) {
            SplashBrandScreen()
        }
    }
}

@Composable
private fun UnauthenticatedNavHost(
    authViewModel: AuthViewModel,
    onOpenWelcome: () -> Unit,
    onToggleTheme: () -> Unit,
) {
    val navController = rememberNavController()
    val authState by authViewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(authState.pendingNavigation) {
        when (authViewModel.consumeNavigation()) {
            "email_confirmation", "one_click_login" ->
                navController.popBackStack(Destinations.LOGIN, inclusive = false)
            "one_click" -> navController.navigate(Destinations.REGISTER_ONE_CLICK_RESULT) {
                launchSingleTop = true
            }
        }
    }
    NavHost(
        navController = navController,
        startDestination = Destinations.LOGIN,
        enterTransition = { EnterTransition.None },
        exitTransition = { ExitTransition.None },
        popEnterTransition = { EnterTransition.None },
        popExitTransition = { ExitTransition.None },
    ) {
        composable(Destinations.LOGIN) {
            LoginScreen(
                viewModel = authViewModel,
                onOpenRegister = { navController.navigate(Destinations.REGISTER) },
                onForgotPassword = { navController.navigate(Destinations.FORGOT_PASSWORD) },
                onBack = onOpenWelcome,
                onToggleTheme = onToggleTheme,
            )
        }
        composable(Destinations.REGISTER) {
            RegisterMenuScreen(
                onBack = { navController.popBackStack() },
                onEmail = { navController.navigate(Destinations.REGISTER_EMAIL) },
                onPhone = { navController.navigate(Destinations.REGISTER_PHONE) },
                onOneClick = { navController.navigate(Destinations.REGISTER_ONE_CLICK) },
            )
        }
        composable(Destinations.REGISTER_EMAIL) {
            RegisterEmailScreen(
                viewModel = authViewModel,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Destinations.REGISTER_PHONE) {
            RegisterPhoneScreen(
                viewModel = authViewModel,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Destinations.REGISTER_ONE_CLICK) {
            RegisterOneClickScreen(
                viewModel = authViewModel,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Destinations.REGISTER_ONE_CLICK_RESULT) {
            RegisterOneClickResultScreen(
                viewModel = authViewModel,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Destinations.FORGOT_PASSWORD) {
            ForgotPasswordScreen(
                onBack = { navController.popBackStack() },
                onPlaceholder = {
                    authViewModel.markRecoveryPlaceholder()
                    navController.popBackStack()
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuthenticatedShell(
    authViewModel: AuthViewModel,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    val navController = rememberNavController()
    val session by authViewModel.session.collectAsStateWithLifecycle()
    val homeViewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory)
    val sportsbookViewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory)
    val walletsViewModel: WalletsViewModel = viewModel(factory = WalletsViewModel.Factory)
    val homeState by homeViewModel.uiState.collectAsStateWithLifecycle()
    val walletsState by walletsViewModel.uiState.collectAsStateWithLifecycle()
    val backStack by navController.currentBackStackEntryAsState()
    val backStackRoutes by navController.currentBackStack.collectAsStateWithLifecycle()
    val current = backStack?.destination?.route
    val ancestorRoutes = backStackRoutes.map { it.destination.route.orEmpty() }
    val arcade = current in setOf(
        Destinations.BLACKJACK, Destinations.AVIATOR, Destinations.APPLES,
        Destinations.CRYSTAL, Destinations.DICE, Destinations.PHARAOH,
    )
    val showBottomBar = current != Destinations.GAMES && !arcade
    val showHeader = Destinations.showsHeader(current)
    val showMainTabs = Destinations.showsMainTabs(current)
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    val fallbackBalance = "${AppGraph.walletRepository.snapshot().displayBalance} ${AppGraph.walletRepository.snapshot().currency}"
    val balanceLabel = WalletsCatalog.headerBalanceLabel(fallbackBalance, walletsState)
    val colors = NextpariTheme.colors

    Scaffold(
        containerColor = colors.bg,
        topBar = {
            if (showHeader) {
                NextpariHeader(
                    balanceLabel = balanceLabel,
                    darkTheme = darkTheme,
                    onDeposit = { navController.navigateTo(Destinations.WALLET) },
                    onHome = {
                        homeViewModel.selectTab("top")
                        navController.navigateTab(Destinations.HOME)
                    },
                    onToggleTheme = onToggleTheme,
                    onSettings = { navController.navigateTo(Destinations.SETTINGS) },
                    onSearch = { searchOpen = true },
                    walletsState = walletsState,
                    closeKey = current,
                    onRefreshWallets = walletsViewModel::refresh,
                    onSelectWallet = walletsViewModel::activate,
                    onAddWallet = walletsViewModel::addCurrency,
                    onConsumeWalletNotice = walletsViewModel::consumeNotice,
                    bottomContent = {
                        if (showMainTabs) {
                            NextpariMainTabs(activeId = homeState.mainTabId) { tab ->
                                if (tab.id == "games") {
                                    navController.navigateTo(Destinations.GAMES)
                                } else {
                                    if (current != Destinations.HOME) navController.navigateTab(Destinations.HOME)
                                    homeViewModel.selectTab(tab.id)
                                }
                            }
                        }
                    },
                )
            }
        },
        bottomBar = {
            if (showBottomBar) {
                NextpariBottomNav(
                    activeRoute = Destinations.bottomNavActiveRoute(current, ancestorRoutes),
                    betCount = 0,
                    onSelect = { item -> navController.navigateTab(item.route) },
                )
            }
        },
    ) { padding ->
        val gamesOwnsInsets = current == Destinations.GAMES
        val layoutDirection = LocalLayoutDirection.current
        val couponClearance = if (showBottomBar) 20.dp else 0.dp
        NavHost(
            navController = navController,
            startDestination = Destinations.HOME,
            modifier = Modifier
                .then(
                    if (gamesOwnsInsets) {
                        Modifier
                    } else {
                        Modifier.padding(
                            start = padding.calculateStartPadding(layoutDirection),
                            top = padding.calculateTopPadding(),
                            end = padding.calculateEndPadding(layoutDirection),
                            bottom = padding.calculateBottomPadding() + couponClearance,
                        )
                    },
                )
                .background(colors.bg),
            enterTransition = { slideInHorizontally(tween(160)) { width -> width } },
            exitTransition = { ExitTransition.None },
            popEnterTransition = { EnterTransition.None },
            popExitTransition = { slideOutHorizontally(tween(160)) { width -> width } },
        ) {
            composable(
                Destinations.HOME,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) {
                HomeScreen(viewModel = homeViewModel, onNavigate = { navController.navigateTo(it) })
            }
            composable(
                Destinations.FAVORITES,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) {
                PlaceholderScreen("Избранное", message = "В избранном пока нет событий")
            }
            composable(
                Destinations.BETSLIP,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) {
                PlaceholderScreen("Купон", message = "Купон пуст")
            }
            composable(
                Destinations.HISTORY,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) { HistoryScreen() }
            composable(
                Destinations.MENU,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) {
                MenuScreen(
                    session = session,
                    balanceLabel = balanceLabel,
                    onNavigate = { navController.navigateTo(it) },
                    onLogout = { authViewModel.logout() },
                    onInbox = { navController.navigateTo(Destinations.INBOX_PLACEHOLDER) },
                    walletsState = walletsState,
                    onRefreshWallets = walletsViewModel::refresh,
                    onSelectWallet = walletsViewModel::activate,
                    onAddWallet = walletsViewModel::addCurrency,
                    onConsumeWalletNotice = walletsViewModel::consumeNotice,
                    closeKey = current,
                )
            }
            composable(Destinations.WALLET) {
                WalletScreen(
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                )
            }
            composable(Destinations.SETTINGS) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    onLogout = { authViewModel.logout() },
                )
            }
            composable(
                Destinations.GAMES,
                enterTransition = { EnterTransition.None },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { EnterTransition.None },
                popExitTransition = { ExitTransition.None },
            ) {
            GamesHubScreen(
                session = session,
                balanceLabel = balanceLabel,
                darkTheme = darkTheme,
                walletsState = walletsState,
                onBack = { navController.popBackStack() },
                onNavigate = { navController.navigateTo(it) },
                onRefreshWallets = walletsViewModel::refresh,
                onSelectWallet = walletsViewModel::activate,
                onAddWallet = walletsViewModel::addCurrency,
                onConsumeWalletNotice = walletsViewModel::consumeNotice,
            )
            }
            placeholder(navController, Destinations.BET_DETAILS, "Детали ставки")
            composable(Destinations.PROMO) {
                PromoScreen(onBack = { navController.popBackStack() }, onNavigate = { navController.navigateTo(it) })
            }
            composable(Destinations.PERSONAL_DATA) {
                PersonalDataScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.WALLETS) {
                WalletsScreen(
                    onBack = { navController.popBackStack() },
                    viewModel = walletsViewModel,
                )
            }
            composable(Destinations.MATCH) { entry ->
                MatchDetailsScreen(
                    matchId = entry.arguments?.getString("matchId").orEmpty(),
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.GAMELIST_LIVE) {
                GameListScreen(
                    initialMode = "live",
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.GAMELIST_LINE) {
                GameListScreen(
                    initialMode = "line",
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.SPORTS_LIVE) {
                SportsListScreen(
                    initialMode = "live",
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.SPORTS_LINE) {
                SportsListScreen(
                    initialMode = "line",
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.SPORTS_CYBERS) {
                SportsListScreen(
                    initialMode = "cybers",
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.CHAMPIONSHIPS) { entry ->
                ChampionshipsScreen(
                    sport = entry.arguments?.getString("sport").orEmpty(),
                    initialMode = entry.arguments?.getString("mode").orEmpty(),
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            composable(Destinations.LEAGUE) { entry ->
                LeagueScreen(
                    leagueId = entry.arguments?.getString("leagueId").orEmpty(),
                    mode = sportsbookViewModel.selectedMode,
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                    viewModel = sportsbookViewModel,
                )
            }
            if (BuildConfig.DEBUG) {
                composable(Destinations.DEBUG_SPORTSBOOK_PREVIEW) {
                    MatchDetailsScreen(
                        matchId = SportsbookPreviewData.MATCH_ID,
                        onBack = { navController.popBackStack() },
                        onNavigate = { navController.navigateTo(it) },
                        viewModel = sportsbookViewModel,
                        preview = true,
                    )
                }
            }
            placeholder(navController, Destinations.SLOTS, "Слоты")
            placeholder(navController, Destinations.LIVE_CASINO, "Лайв казино")
            placeholder(navController, Destinations.PROVIDER_SPORTSBOOK, "Спортбук провайдера")
            composable(Destinations.PROMO_DETAILS) {
                PromoDetailsScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.PROMO_MARATHON) {
                PromoMarathonScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.PROMO_WELCOME) {
                PromoWelcomeScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.INFO) {
                InfoScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.PROMO_UNBEATABLE) {
                PromoUnbeatableScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.BLACKJACK) {
                NativeGameScreen("blackjack", "21 / Очко") { navController.popBackStack() }
            }
            composable(Destinations.AVIATOR) {
                NativeGameScreen("aviator", "Aviator") { navController.popBackStack() }
            }
            composable(Destinations.APPLES) {
                NativeGameScreen("apples", "Apple of Fortune") { navController.popBackStack() }
            }
            composable(Destinations.CRYSTAL) {
                NativeGameScreen("crystal", "Crystal") { navController.popBackStack() }
            }
            composable(Destinations.DICE) {
                NativeGameScreen("dice", "Dice") { navController.popBackStack() }
            }
            composable(Destinations.PHARAOH) {
                NativeGameScreen("pharaoh", "Сокровища Фараона") { navController.popBackStack() }
            }
            composable(Destinations.VIP_CASHBACK) {
                VipCashbackScreen(onBack = { navController.popBackStack() })
            }
            composable(Destinations.INBOX_PLACEHOLDER) {
                PlaceholderScreen("Входящие", onBack = { navController.popBackStack() }, message = "Нет новых сообщений")
            }
        }
    }

    if (searchOpen) {
        ModalBottomSheet(
            onDismissRequest = { searchOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = colors.surface,
        ) {
            Column(Modifier.padding(24.dp).fillMaxSize()) {
                Text("Поиск", color = colors.text, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                Text("Введите название события или чемпионата", color = colors.textMuted, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

private fun NavGraphBuilder.placeholder(
    navController: NavHostController,
    route: String,
    title: String,
) {
    composable(route) {
        PlaceholderScreen(title, onBack = { navController.popBackStack() })
    }
}

private fun NavHostController.navigateTab(route: String) {
    if (!Destinations.isConcreteNavigationTarget(route)) return
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun NavHostController.navigateTo(route: String) {
    if (!Destinations.isConcreteNavigationTarget(route)) return
    if (currentDestination?.route == route) return
    navigate(route) {
        launchSingleTop = true
        restoreState = true
    }
}
