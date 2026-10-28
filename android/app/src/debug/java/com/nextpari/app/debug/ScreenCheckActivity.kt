package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.AuthenticatedShell
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.components.NextpariBottomNav
import com.nextpari.app.core.ui.components.NextpariHeader
import com.nextpari.app.core.ui.components.NextpariMainTabs
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.auth.AuthViewModel
import com.nextpari.app.feature.auth.LoginScreen
import com.nextpari.app.feature.games.GameSpecs
import com.nextpari.app.feature.games.GameStage
import com.nextpari.app.feature.games.GameUiState
import com.nextpari.app.feature.games.web.GameWebViewScreen
import com.nextpari.app.feature.games.PlayerGameRound
import com.nextpari.app.feature.history.HistoryScreen
import com.nextpari.app.feature.home.HomeScreen
import com.nextpari.app.feature.home.HomeViewModel
import com.nextpari.app.feature.launch.SessionRestoreScreen
import com.nextpari.app.feature.launch.SplashBrandScreen
import com.nextpari.app.feature.launch.WelcomeScreen
import com.nextpari.app.feature.menu.MenuScreen
import com.nextpari.app.feature.settings.SettingsScreen
import com.nextpari.app.feature.wallets.WalletsScreen
import com.nextpari.app.feature.wallets.WalletsUiState

/**
 * Debug-only host for layout checks. It is not a launcher and it does not place wagers.
 */
class ScreenCheckActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = intent.getStringExtra("screen").orEmpty()
        val dark = intent.getBooleanExtra("dark", true)
        enableEdgeToEdge()
        setContent {
            var page by mutableStateOf(screen)
            NextpariTheme(darkTheme = dark) {
                when (page) {
                    "splash" -> SplashBrandScreen()
                    "welcome" -> WelcomeScreen(onContinue = {}, onExistingAccount = {})
                    "loading" -> SessionRestoreScreen()
                    "login" -> LoginScreen(
                        viewModel = viewModel(factory = AuthViewModel.Factory),
                        onOpenRegister = {},
                        onForgotPassword = {},
                        onBack = { finish() },
                        onToggleTheme = {},
                    )
                    "shell" -> AuthenticatedShell(
                        authViewModel = viewModel(factory = AuthViewModel.Factory),
                        darkTheme = dark,
                        onToggleTheme = {},
                    )
                    "home" -> AuthenticatedFixture(dark)
                    "history" -> HistoryScreen()
                    "menu" -> MenuScreen(
                        session = AuthSession.Anonymous,
                        balanceLabel = "—",
                        onNavigate = { page = it },
                        onLogout = {},
                        onInbox = {},
                        walletsState = WalletsUiState(),
                        onRefreshWallets = {},
                        onSelectWallet = { _ -> false },
                        onAddWallet = { _ -> false },
                        onConsumeWalletNotice = {},
                    )
                    "settings" -> SettingsScreen(
                        onBack = { finish() },
                        onNavigate = { page = it },
                        onLogout = {},
                    )
                    "wallets" -> WalletsScreen(onBack = { page = "settings" })
                    else -> {
                        val fixture = intent.getStringExtra("fixture")
                        if (fixture.isNullOrBlank()) {
                            GameWebViewScreen(gameCode = page, onBack = { finish() })
                        } else {
                            GameStage(
                                title = screenTitle(page),
                                spec = GameSpecs.forCode(page),
                                state = previewState(page, fixture),
                                onBack = { finish() },
                                onStake = {},
                                onPlay = { _ -> },
                                onAct = { _, _ -> },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuthenticatedFixture(dark: Boolean) {
    val homeViewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory)
    val colors = NextpariTheme.colors
    Scaffold(
        containerColor = colors.bg,
        topBar = {
            NextpariHeader(
                balanceLabel = "10.38 TMT",
                darkTheme = dark,
                onDeposit = {},
                onHome = {},
                onToggleTheme = {},
                onSettings = {},
                onSearch = {},
                walletsState = WalletsUiState(),
                closeKey = "home",
                onRefreshWallets = {},
                onSelectWallet = { _ -> false },
                onAddWallet = { _ -> false },
                onConsumeWalletNotice = {},
                bottomContent = { NextpariMainTabs(activeId = "top") { _ -> } },
            )
        },
        bottomBar = {
            NextpariBottomNav(activeRoute = Destinations.HOME, betCount = 0, onSelect = { _ -> })
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            HomeScreen(viewModel = homeViewModel, onNavigate = {})
        }
    }
}

private fun screenTitle(code: String): String = when (code) {
    "blackjack" -> "21 / Очко"
    "aviator" -> "Aviator"
    "apples" -> "Apple of Fortune"
    "crystal" -> "Crystal"
    "dice" -> "Dice"
    "pharaoh" -> "Сокровища Фараона"
    Destinations.WALLETS -> "Кошелёк и валюты"
    else -> code
}
