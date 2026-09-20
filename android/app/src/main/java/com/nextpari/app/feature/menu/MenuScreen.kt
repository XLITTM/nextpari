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
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.NpRadiusCard

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
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp),
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
                IconButton(onClick = onInbox) {
                    Icon(Icons.Outlined.MailOutline, contentDescription = "Входящие", tint = colors.textSecondary)
                }
                IconButton(onClick = { onNavigate(Destinations.SETTINGS) }) {
                    Icon(Icons.Outlined.Settings, contentDescription = "Настройки", tint = colors.textSecondary)
                }
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
                    Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, tint = colors.textSecondary)
                    Column(Modifier.padding(start = 8.dp)) {
                        Text("Баланс", color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(balanceLabel, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    }
                }
                Box(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF16A34A))
                        .clickable { onNavigate(Destinations.WALLET) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Text("Пополнить", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
        Row(Modifier.fillMaxWidth().background(colors.surface).padding(horizontal = 8.dp)) {
            MenuCatalog.subTabs.forEach { label ->
                val active = tab == label
                Column(
                    modifier = Modifier.weight(1f).clickable { tab = label }.padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
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
                .clip(RoundedCornerShape(NpRadiusCard))
                .background(colors.danger.copy(alpha = 0.08f))
                .clickable(onClick = onLogout)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, tint = colors.danger)
                Text("Выйти из аккаунта", color = colors.danger, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f))
                Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = colors.danger)
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
        .clip(RoundedCornerShape(NpRadiusCard))
        .then(
            if (specialBrush != null) Modifier.background(specialBrush) else Modifier.background(colors.surface),
        )
        .then(if (click != null) Modifier.clickable(onClick = click) else Modifier)
        .padding(16.dp)
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(item.label, color = if (specialBrush != null) Color.White else colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            Text(item.desc, color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textSecondary, fontSize = 12.sp)
        }
        if (item.soon) {
            Text("Скоро", color = if (specialBrush != null) Color.White.copy(alpha = 0.9f) else colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        } else {
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = if (specialBrush != null) Color.White else colors.textMuted)
        }
    }
}
