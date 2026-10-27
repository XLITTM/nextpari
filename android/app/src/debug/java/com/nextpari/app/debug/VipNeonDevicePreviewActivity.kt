package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.BottomNavSpec
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.navigation.MainTabsSpec
import com.nextpari.app.core.ui.components.NextpariBottomNav
import com.nextpari.app.core.ui.components.NextpariHeader
import com.nextpari.app.core.ui.components.NextpariMainTabs
import com.nextpari.app.core.ui.neon.VipNeonButton
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.ThemeViewModel
import com.nextpari.app.feature.wallets.WalletsUiState

/**
 * Debug-only layout check for the shared neon chrome.
 * It is not in the release manifest, it is not a launcher, and it does not call wallet or auth APIs.
 */
class VipNeonDevicePreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val themeViewModel: ThemeViewModel = viewModel(factory = ThemeViewModel.Factory)
            val darkTheme by themeViewModel.darkTheme.collectAsStateWithLifecycle()
            NextpariTheme(darkTheme = darkTheme) {
                VipNeonDevicePreview(darkTheme = darkTheme, onToggleTheme = themeViewModel::toggle)
            }
        }
    }
}

@Composable
private fun VipNeonDevicePreview(
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    var tabId by rememberSaveable { mutableStateOf(MainTabsSpec.tabs.first().id) }
    var route by rememberSaveable { mutableStateOf(Destinations.HOME) }
    val colors = NextpariTheme.colors
    val tabLabel = MainTabsSpec.tabs.first { it.id == tabId }.label
    val sectionLabel = BottomNavSpec.items.first { it.route == route }.label
    Scaffold(
        containerColor = colors.bg,
        topBar = {
            NextpariHeader(
                balanceLabel = "—",
                darkTheme = darkTheme,
                onDeposit = {},
                onHome = {
                    tabId = "top"
                    route = Destinations.HOME
                },
                onToggleTheme = onToggleTheme,
                onSettings = {},
                onSearch = {},
                walletsState = WalletsUiState(owned = emptyList(), addable = emptyList()),
                closeKey = route,
                onRefreshWallets = {},
                onSelectWallet = { false },
                onAddWallet = { false },
                onConsumeWalletNotice = {},
                bottomContent = {
                    if (route == Destinations.HOME) {
                        NextpariMainTabs(activeId = tabId) { tab -> tabId = tab.id }
                    }
                },
            )
        },
        bottomBar = {
            NextpariBottomNav(activeRoute = route, betCount = 0) { item ->
                route = item.route
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
        ) {
            Text(
                "Проверка оформления",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
            )
            Text(
                "Вход и кошелёк не используются.",
                color = colors.textSecondary,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
            )
            Text(sectionLabel, color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            if (route == Destinations.HOME) {
                Text(tabLabel, color = colors.premiumGold, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Spacer(Modifier.height(16.dp))
            VipNeonButton(text = "Нажать", onClick = {})
            Spacer(Modifier.height(8.dp))
            VipNeonButton(text = "Выбрано", onClick = {}, selected = true, gold = true)
            Spacer(Modifier.height(8.dp))
            VipNeonButton(text = "Недоступно", onClick = {}, enabled = false)
        }
    }
}
