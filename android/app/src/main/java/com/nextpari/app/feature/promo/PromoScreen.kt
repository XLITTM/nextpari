package com.nextpari.app.feature.promo

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Gamepad
import androidx.compose.material.icons.outlined.Paid
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun PromoScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Column(
        Modifier
            .fillMaxSize()
            .background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Назад", tint = colors.text, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Text("Promo", color = colors.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        Box(
            Modifier
                .padding(horizontal = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Brush.horizontalGradient(listOf(Color(0xFF059669), Color(0xFF0F766E))))
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.ShoppingCart, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(24.dp))
                }
                Column(Modifier.padding(start = 12.dp)) {
                    Text("Промо", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    Text(PromoCatalog.heroSummary, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }

        Column(Modifier.padding(start = 12.dp, end = 12.dp, top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PromoCatalog.menuItems.forEach { item ->
                PromoMenuRow(item, dark) {
                    item.route?.let(onNavigate)
                }
            }
        }
    }
}

@Composable
private fun PromoMenuRow(item: PromoMenuItem, dark: Boolean, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (dark) Color(0xFF1F2937) else Color.White)
            .then(if (item.soon) Modifier else Modifier.clickable(onClick = onClick))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(Color(item.iconBg)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(promoIcon(item.label), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(item.label, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(item.desc, color = colors.textSecondary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
        if (item.soon) {
            Text("Скоро", color = colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        } else {
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(20.dp))
        }
    }
}

private fun promoIcon(label: String): ImageVector = when (label) {
    "Бонусные игры" -> Icons.Outlined.Gamepad
    "Проверка промокода" -> Icons.Outlined.Visibility
    "Кешбэк" -> Icons.Outlined.Paid
    "VIP кешбэк" -> Icons.Outlined.WorkspacePremium
    "Участие в акциях" -> Icons.Outlined.EmojiEvents
    else -> Icons.Outlined.CardGiftcard
}
