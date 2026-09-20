package com.nextpari.app.core.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.nextpari.app.R
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariReferenceIcon
import com.nextpari.app.core.ui.icons.isPremiumIcons
import com.nextpari.app.feature.wallets.WalletsUiState

@Composable
fun NextpariHeader(
    balanceLabel: String,
    darkTheme: Boolean,
    onDeposit: () -> Unit,
    onHome: () -> Unit,
    onToggleTheme: () -> Unit,
    onSettings: () -> Unit,
    onSearch: () -> Unit,
    walletsState: WalletsUiState,
    closeKey: String?,
    onRefreshWallets: () -> Unit,
    onSelectWallet: (String) -> Boolean,
    onAddWallet: (String) -> Boolean,
    onConsumeWalletNotice: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
            .clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
            .background(if (darkTheme) Color(0xFF18181B) else Color.White)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF16A34A))
                        .clickable(onClick = onDeposit),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(NextpariIcons.Add, contentDescription = "Пополнить", tint = Color.White, modifier = Modifier.size(16.dp))
                }
                HeaderWalletSwitcher(
                    balanceLabel = balanceLabel,
                    darkTheme = darkTheme,
                    state = walletsState,
                    closeKey = closeKey,
                    onRefresh = onRefreshWallets,
                    onSelect = onSelectWallet,
                    onAdd = onAddWallet,
                    onConsumeNotice = onConsumeWalletNotice,
                )
            }
            Box(
                modifier = Modifier.clickable(onClick = onHome),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(if (darkTheme) R.drawable.logo_white else R.drawable.logo_black),
                    contentDescription = "NextPari — на главную",
                    modifier = Modifier.height(28.dp),
                    contentScale = ContentScale.Fit,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                HeaderIcon("service_light_theme".takeIf { darkTheme } ?: "service_dark_theme", "Переключить тему", if (darkTheme) NextpariIcons.ThemeLight else NextpariIcons.ThemeDark, NextpariIconPalette.Header.Theme, onToggleTheme)
                HeaderIcon("menu_settings", "Настройки", NextpariIcons.Settings, NextpariIconPalette.Header.Settings, onSettings)
                HeaderIcon("service_search", "Поиск", NextpariIcons.Search, NextpariIconPalette.Header.Search, onSearch)
            }
        }
    }
}

@Composable
private fun HeaderIcon(
    referenceKey: String,
    description: String,
    fallback: ImageVector,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (isPremiumIcons()) {
            NextpariReferenceIcon(
                key = referenceKey,
                contentDescription = description,
                size = 24.dp,
            )
        } else {
            Icon(fallback, contentDescription = description, tint = tint, modifier = Modifier.size(20.dp))
        }
    }
}
