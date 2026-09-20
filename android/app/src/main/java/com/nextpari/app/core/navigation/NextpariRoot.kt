package com.nextpari.app.core.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.components.NextpariBottomNav
import com.nextpari.app.core.ui.components.NextpariHeader
import com.nextpari.app.core.ui.components.NextpariMainTabs
import com.nextpari.app.core.ui.components.PlaceholderScreen
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.auth.AuthViewModel
import com.nextpari.app.feature.auth.ForgotPasswordScreen
import com.nextpari.app.feature.auth.LoginScreen
import com.nextpari.app.feature.auth.RegisterEmailScreen
import com.nextpari.app.feature.auth.RegisterMenuScreen
import com.nextpari.app.feature.auth.RegisterOneClickScreen
import com.nextpari.app.feature.auth.RegisterPhoneScreen
import com.nextpari.app.feature.history.HistoryScreen
import com.nextpari.app.feature.home.GamesHubScreen
import com.nextpari.app.feature.home.HomeScreen
import com.nextpari.app.feature.home.HomeViewModel
import com.nextpari.app.feature.menu.MenuScreen
import com.nextpari.app.feature.settings.SettingsScreen
import com.nextpari.app.feature.wallet.WalletScreen

@Composable
fun NextpariRoot(
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    authViewModel: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val session by authViewModel.session.collectAsStateWithLifecycle()
    if (!session.isAuthenticated) {
        UnauthenticatedNavHost(authViewModel)
    } else {
        AuthenticatedShell(
            authViewModel = authViewModel,
            darkTheme = darkTheme,
            onToggleTheme = onToggleTheme,
        )
    }
}

@Composable
private fun UnauthenticatedNavHost(authViewModel: AuthViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Destinations.LOGIN) {
        composable(Destinations.LOGIN) {
            LoginScreen(
                viewModel = authViewModel,
                onOpenRegister = { navController.navigate(Destinations.REGISTER) },
                onForgotPassword = { navController.navigate(Destinations.FORGOT_PASSWORD) },
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
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("email")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
            )
        }
        composable(Destinations.REGISTER_PHONE) {
            RegisterPhoneScreen(
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("phone")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
            )
        }
        composable(Destinations.REGISTER_ONE_CLICK) {
            RegisterOneClickScreen(
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("one-click")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
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
private fun AuthenticatedShell(
    authViewModel: AuthViewModel,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    val navController = rememberNavController()
    val session by authViewModel.session.collectAsStateWithLifecycle()
    val homeViewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory)
    val homeState by homeViewModel.uiState.collectAsStateWithLifecycle()
    val backStack by navController.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val arcade = current in setOf(
        Destinations.BLACKJACK, Destinations.AVIATOR, Destinations.APPLES,
        Destinations.CRYSTAL, Destinations.DICE, Destinations.PHARAOH,
    )
    val showBottomBar = current != Destinations.GAMES && !arcade
    val showHeader = Destinations.showsHeader(current)
    val showMainTabs = Destinations.showsMainTabs(current)
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    val balanceLabel = "${AppGraph.walletRepository.snapshot().displayBalance} ${AppGraph.walletRepository.snapshot().currency}"
    val colors = NextpariTheme.colors

    Scaffold(
        containerColor = colors.bg,
        topBar = {
            if (showHeader) {
                Column {
                    NextpariHeader(
                        balanceLabel = balanceLabel,
                        darkTheme = darkTheme,
                        onWallet = { navController.navigateTo(Destinations.WALLET) },
                        onHome = {
                            homeViewModel.selectTab("top")
                            navController.navigateTab(Destinations.HOME)
                        },
                        onToggleTheme = onToggleTheme,
                        onSettings = { navController.navigateTo(Destinations.SETTINGS) },
                        onSearch = { searchOpen = true },
                    )
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
                }
            }
        },
        bottomBar = {
            if (showBottomBar) {
                NextpariBottomNav(
                    activeRoute = Destinations.bottomNavActiveRoute(current),
                    betCount = 0,
                    onSelect = { item -> navController.navigateTab(item.route) },
                )
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Destinations.HOME,
            modifier = Modifier.padding(padding),
        ) {
            composable(Destinations.HOME) {
                HomeScreen(viewModel = homeViewModel, onNavigate = { navController.navigateTo(it) })
            }
            composable(Destinations.FAVORITES) {
                PlaceholderScreen("Избранное", message = "В избранном пока нет событий")
            }
            composable(Destinations.BETSLIP) {
                PlaceholderScreen("Купон", message = "Купон пуст")
            }
            composable(Destinations.HISTORY) { HistoryScreen() }
            composable(Destinations.MENU) {
                MenuScreen(
                    session = session,
                    balanceLabel = balanceLabel,
                    onNavigate = { navController.navigateTo(it) },
                    onLogout = { authViewModel.logout() },
                    onInbox = { navController.navigateTo("inbox-placeholder") },
                )
            }
            composable(Destinations.WALLET) { WalletScreen() }
            composable(Destinations.SETTINGS) {
                SettingsScreen(darkTheme = darkTheme, onToggleTheme = onToggleTheme, onBack = { navController.popBackStack() })
            }
            composable(Destinations.GAMES) {
                GamesHubScreen(
                    session = session,
                    balanceLabel = balanceLabel,
                    onBack = { navController.popBackStack() },
                    onNavigate = { navController.navigateTo(it) },
                )
            }
            placeholder(navController, Destinations.MATCH, "Матч")
            placeholder(navController, Destinations.BET_DETAILS, "Детали ставки")
            placeholder(navController, Destinations.PROMO, "Акции")
            placeholder(navController, Destinations.PERSONAL_DATA, "Личные данные")
            placeholder(navController, Destinations.WALLETS, "Кошелёк и валюты")
            placeholder(navController, Destinations.GAMELIST_LIVE, "Лента LIVE")
            placeholder(navController, Destinations.GAMELIST_LINE, "Лента Линия")
            placeholder(navController, Destinations.SPORTS_LIVE, "LIVE")
            placeholder(navController, Destinations.SPORTS_LINE, "Линия")
            placeholder(navController, Destinations.SPORTS_CYBERS, "Киберспорт")
            placeholder(navController, Destinations.CHAMPIONSHIPS, "Чемпионаты")
            placeholder(navController, Destinations.SLOTS, "Слоты")
            placeholder(navController, Destinations.LIVE_CASINO, "Лайв казино")
            placeholder(navController, Destinations.PROVIDER_SPORTSBOOK, "Спортбук провайдера")
            placeholder(navController, Destinations.PROMO_DETAILS, "Промо")
            placeholder(navController, Destinations.PROMO_MARATHON, "Марафон Экспрессов")
            placeholder(navController, Destinations.PROMO_WELCOME, "Приветственный пакет")
            placeholder(navController, Destinations.INFO, "Инфо")
            placeholder(navController, Destinations.PROMO_UNBEATABLE, "Непобедимый")
            placeholder(navController, Destinations.BLACKJACK, "21 / Очко")
            placeholder(navController, Destinations.AVIATOR, "Aviator")
            placeholder(navController, Destinations.APPLES, "Apple of Fortune")
            placeholder(navController, Destinations.CRYSTAL, "Crystal")
            placeholder(navController, Destinations.DICE, "Dice")
            placeholder(navController, Destinations.PHARAOH, "Сокровища Фараона")
            placeholder(navController, Destinations.VIP_CASHBACK, "VIP кешбэк")
            placeholder(navController, Destinations.LEAGUE, "Лига")
            composable("inbox-placeholder") {
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
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun NavHostController.navigateTo(route: String) {
    navigate(route) { launchSingleTop = true }
}
