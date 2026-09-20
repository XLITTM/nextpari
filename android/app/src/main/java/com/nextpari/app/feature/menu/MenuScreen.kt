package com.nextpari.app.feature.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.components.WalletDropdownMenu
import com.nextpari.app.core.ui.components.WalletSwitcherEffects
import com.nextpari.app.core.ui.components.nextWalletDropdownOpen
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariPremiumIcon
import com.nextpari.app.core.ui.icons.isPremiumIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.wallets.WalletsUiState

@Composable
fun MenuScreen(
    session: AuthSession,
    balanceLabel: String,
    onNavigate: (String) -> Unit,
    onLogout: () -> Unit,
    onInbox: () -> Unit,
    walletsState: WalletsUiState,
    onRefreshWallets: () -> Unit,
    onSelectWallet: (String) -> Boolean,
    onAddWallet: (String) -> Boolean,
    onConsumeWalletNotice: () -> Unit,
    closeKey: String? = Destinations.MENU,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    var tab by rememberSaveable { mutableStateOf(MenuCatalog.subTabs.first()) }
    var walletsOpen by remember { mutableStateOf(false) }
    val chevronRotation by animateFloatAsState(targetValue = if (walletsOpen) 180f else 0f, label = "menuWalletChevron")
    WalletSwitcherEffects(
        closeKey = closeKey,
        notice = walletsState.notice,
        onClose = { walletsOpen = false },
        onConsumeNotice = onConsumeWalletNotice,
    )
    Column(
        Modifier
            .fillMaxSize()
            .background(if (colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg) Color(0xFF111827) else Color(0xFFF3F4F6))
            .verticalScroll(rememberScrollState())
            .padding(bottom = 112.dp),
    ) {
        Column(Modifier.background(colors.surface).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(56.dp).clip(CircleShape).background(colors.surfaceMuted),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(NextpariIcons.Profile, contentDescription = null, tint = if (isPremiumIcons()) NextpariIconPalette.Menu.Profile else colors.textSecondary)
                }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(session.displayName.ifBlank { "Игрок" }, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text("ID: ${session.playerPublicId.ifBlank { "—" }}", color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Row {
                        Text("Заполнить профиль →", color = colors.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onNavigate(Destinations.PERSONAL_DATA) })
                        Spacer(Modifier.size(8.dp))
                        Text("Кошелёк и валюты →", color = colors.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onNavigate(Destinations.WALLETS) })
                    }
                }
                IconButtonBox("Входящие", NextpariIcons.Mail, onInbox)
                IconButtonBox("Настройки", NextpariIcons.Settings) { onNavigate(Destinations.SETTINGS) }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.weight(1f)) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(colors.surfaceMuted)
                            .clickable { walletsOpen = nextWalletDropdownOpen(walletsOpen, onRefreshWallets) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(NextpariIcons.Wallet, contentDescription = null, tint = if (isPremiumIcons()) NextpariIconPalette.Menu.Wallet else colors.textSecondary, modifier = Modifier.size(20.dp))
                        Column(Modifier.padding(start = 8.dp).weight(1f)) {
                            Text("Баланс", color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text(balanceLabel, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                        }
                        Icon(
                            NextpariIcons.ChevronDown,
                            contentDescription = "Кошелёк и валюты",
                            tint = if (isPremiumIcons()) NextpariIconPalette.Header.WalletChevron else colors.textMuted,
                            modifier = Modifier.size(16.dp).graphicsLayer { rotationZ = chevronRotation },
                        )
                    }
                    WalletDropdownMenu(
                        expanded = walletsOpen,
                        state = walletsState,
                        darkTheme = dark,
                        onDismiss = { walletsOpen = false },
                        onSelect = onSelectWallet,
                        onAdd = onAddWallet,
                    )
                }
                Row(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF16A34A))
                        .clickable { onNavigate(Destinations.WALLET) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(NextpariIcons.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    Text("Пополнить", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        Row(Modifier.fillMaxWidth().background(colors.surface).padding(horizontal = 8.dp)) {
            MenuCatalog.subTabs.forEach { label ->
                val active = tab == label
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { tab = label }
                        .padding(top = 8.dp, bottom = 4.dp)
                        .drawBehind {
                            if (active) {
                                val stroke = 2.dp.toPx()
                                drawLine(Color(0xFF4ADE80), Offset(0f, size.height), Offset(size.width, size.height), stroke)
                            }
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(menuTabIcon(label), contentDescription = label, tint = NextpariIconPalette.Menu.of(label).copy(alpha = if (active) 1f else 0.65f), modifier = Modifier.size(24.dp))
                    Text(label, color = NextpariIconPalette.Menu.of(label).copy(alpha = if (active) 1f else 0.65f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MenuCatalog.itemsFor(tab).forEach { item ->
                MenuRow(item, onNavigate)
            }
        }
        Box(
            Modifier
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFFFEF2F2))
                .clickable(onClick = onLogout)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFFEE2E2)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(NextpariIcons.Logout, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(20.dp))
                }
                Text("Выйти из аккаунта", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 12.dp).weight(1f))
                Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = Color(0xFFF87171), modifier = Modifier.size(20.dp))
            }
        }
        Text("nextpari v2.0.1 · © 2026", color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun MenuRow(item: MenuItem, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    val specialBrush = when (item.special) {
        "teal" -> Brush.horizontalGradient(listOf(Color(0xFF2DD4BF), Color(0xFF14B8A6)))
        "security" -> Brush.horizontalGradient(listOf(Color(0xFFFB923C), Color(0xFFF59E0B)))
        "orange" -> Brush.horizontalGradient(listOf(Color(0xFFF97316), Color(0xFFF97316)))
        else -> null
    }
    val click = if (item.soon) null else item.route?.let { { onNavigate(it) } }
    val modifier = Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(16.dp))
        .then(
            if (specialBrush != null) Modifier.background(specialBrush) else Modifier.background(colors.surface),
        )
        .then(if (click != null) Modifier.clickable(onClick = click) else Modifier)
        .padding(16.dp)
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        val rowTint = NextpariIconPalette.Menu.of(item.label)
        if (specialBrush != null) {
            Icon(
                menuRowIcon(item.label),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp).padding(end = 4.dp),
            )
        } else if (isPremiumIcons()) {
            NextpariPremiumIcon(
                imageVector = menuRowIcon(item.label),
                semantic = rowTint,
                containerSize = 36.dp,
                iconSize = 20.dp,
                showContainer = true,
            )
        } else {
            Icon(
                menuRowIcon(item.label),
                contentDescription = null,
                tint = Color(0xFF4ADE80),
                modifier = Modifier.size(24.dp).padding(end = 4.dp),
            )
        }
        Column(Modifier.weight(1f).padding(start = 8.dp)) {
            Text(item.label, color = if (specialBrush != null) Color.White else colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            Text(item.desc, color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textSecondary, fontSize = 12.sp)
        }
        if (item.soon) {
            Text("Скоро", color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        } else {
            Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = if (specialBrush != null) Color.White else colors.textMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun IconButtonBox(description: String, icon: ImageVector, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg
    Box(
        Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = description,
            tint = if (isPremiumIcons()) {
                if (description == "Входящие") NextpariIconPalette.Menu.Mail else NextpariIconPalette.Menu.Settings
            } else if (dark) Color(0xFFE5E7EB) else Color(0xFF4B5563),
            modifier = Modifier.size(20.dp),
        )
    }
}

private fun menuTabIcon(label: String): ImageVector = NextpariIcons.menuTab(label)

private fun menuRowIcon(label: String): ImageVector = NextpariIcons.menuRow(label)
