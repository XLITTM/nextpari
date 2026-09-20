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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.Casino
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Gamepad
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Paid
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun MenuScreen(
    session: AuthSession,
    balanceLabel: String,
    onNavigate: (String) -> Unit,
    onLogout: () -> Unit,
    onInbox: () -> Unit,
) {
    val colors = NextpariTheme.colors
    var tab by rememberSaveable { mutableStateOf(MenuCatalog.subTabs.first()) }
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
                    Icon(Icons.Outlined.Person, contentDescription = null, tint = colors.textSecondary)
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
                IconButtonBox("Входящие", Icons.Outlined.MailOutline, onInbox)
                IconButtonBox("Настройки", Icons.Outlined.Settings) { onNavigate(Destinations.SETTINGS) }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.surfaceMuted)
                        .clickable { onNavigate(Destinations.WALLET) }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(20.dp))
                    Column(Modifier.padding(start = 8.dp).weight(1f)) {
                        Text("Баланс", color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(balanceLabel, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    }
                    Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(16.dp))
                }
                Row(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF16A34A))
                        .clickable { onNavigate(Destinations.WALLET) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    Text("Пополнить", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        MenuQuickAccess(onNavigate)
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
                    Icon(menuTabIcon(label), contentDescription = label, tint = Color(0xFF4ADE80).copy(alpha = if (active) 1f else 0.7f), modifier = Modifier.size(24.dp))
                    Text(label, color = Color(0xFF4ADE80).copy(alpha = if (active) 1f else 0.7f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                    Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(20.dp))
                }
                Text("Выйти из аккаунта", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 12.dp).weight(1f))
                Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Color(0xFFF87171), modifier = Modifier.size(20.dp))
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
        Icon(
            menuRowIcon(item.label),
            contentDescription = null,
            tint = if (specialBrush != null) Color.White else Color(0xFF4ADE80),
            modifier = Modifier.size(24.dp).padding(end = 4.dp),
        )
        Column(Modifier.weight(1f).padding(start = 8.dp)) {
            Text(item.label, color = if (specialBrush != null) Color.White else colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            Text(item.desc, color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textSecondary, fontSize = 12.sp)
        }
        if (item.soon) {
            Text("Скоро", color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        } else {
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = if (specialBrush != null) Color.White else colors.textMuted, modifier = Modifier.size(20.dp))
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
        Icon(icon, contentDescription = description, tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF4B5563), modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun MenuQuickAccess(onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Column(Modifier.background(colors.surface).padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MenuCatalog.quickAccess.take(2).forEach { item ->
                QuickAccessCard(item, Modifier.weight(1f), onNavigate)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MenuCatalog.quickAccess.drop(2).forEach { item ->
                QuickAccessCard(item, Modifier.weight(1f), onNavigate)
            }
        }
    }
}

@Composable
private fun QuickAccessCard(item: MenuCatalog.QuickAccess, modifier: Modifier, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg
    Row(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (dark) Color(0xFF0F172A) else Color(0xFFF8FAFC))
            .clickable { onNavigate(item.route) }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(item.accent).copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(quickAccessIcon(item.label), contentDescription = item.label, tint = Color(item.accent), modifier = Modifier.size(18.dp))
        }
        Text(item.label, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, modifier = Modifier.padding(start = 10.dp))
    }
}

private fun quickAccessIcon(label: String): ImageVector = when (label) {
    "VIP CLUB" -> Icons.Outlined.WorkspacePremium
    "Кешбэк" -> Icons.Outlined.Paid
    "Акции" -> Icons.Outlined.CardGiftcard
    else -> Icons.Outlined.AutoAwesome
}

private fun menuTabIcon(label: String): ImageVector = when (label) {
    "Топ" -> Icons.Outlined.LocalFireDepartment
    "Спорт" -> Icons.Outlined.EmojiEvents
    "Казино" -> Icons.Outlined.Casino
    "Games" -> Icons.Outlined.Gamepad
    else -> Icons.Outlined.AutoAwesome
}

private fun menuRowIcon(label: String): ImageVector = when (label) {
    "LIVE" -> Icons.Outlined.LocalFireDepartment
    "Линия", "Непобедимый", "Турниры" -> Icons.Outlined.EmojiEvents
    "Киберспорт", "Games" -> Icons.Outlined.Gamepad
    "Слоты", "Лайв казино", "My casino", "Категории", "Провайдеры" -> Icons.Outlined.Casino
    "Промокоды", "Промо", "Promo", "Акции" -> Icons.Outlined.AutoAwesome
    "Поддержка", "Инфо" -> Icons.Outlined.Person
    "Управление счетом" -> Icons.Outlined.AccountBalanceWallet
    "Aviator" -> Icons.Outlined.LocalFireDepartment
    else -> Icons.Outlined.Settings
}
