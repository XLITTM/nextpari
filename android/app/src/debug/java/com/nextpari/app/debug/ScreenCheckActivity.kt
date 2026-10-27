package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.games.NativeGameScreen
import com.nextpari.app.feature.history.HistoryScreen
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
        setContent {
            var page by mutableStateOf(screen)
            NextpariTheme(darkTheme = dark) {
                when (page) {
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
                    else -> NativeGameScreen(
                        gameCode = page,
                        title = screenTitle(page),
                        onBack = { finish() },
                    )
                }
            }
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
