package com.nextpari.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.components.LiveIndicator
import com.nextpari.app.core.ui.components.ProductSectionHeader
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun ChampionshipsLiveSection(
    items: List<ChampionshipRow>,
    onNavigate: (String) -> Unit,
    onFilter: () -> Unit = {},
) {
    if (items.isEmpty()) return
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Column(Modifier.padding(top = 16.dp)) {
        ProductSectionHeader(
            title = "Чемпионаты LIVE",
            filterLabel = "Спорт",
            onFilter = onFilter,
            onSeeAll = { onNavigate(Destinations.GAMELIST_LIVE) },
        )
        items.forEach { row ->
            ChampionshipCard(row, dark) { onNavigate(Destinations.league(row.id)) }
        }
    }
}

@Composable
private fun ChampionshipCard(row: ChampionshipRow, dark: Boolean, onOpen: () -> Unit) {
    val colors = NextpariTheme.colors
    val emblem = Color(row.color)
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .background(if (dark) Color(0xFF1E293B) else Color(0xFFF9FAFB))
            .clickable(onClick = onOpen)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(emblem.copy(alpha = 0.19f)),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(20.dp).clip(CircleShape).background(emblem))
            }
            LiveIndicator(
                modifier = Modifier.align(Alignment.TopEnd),
                size = 10.dp,
                bordered = true,
                borderColor = if (dark) Color(0xFF1E293B) else Color.White,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(row.name, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(row.country, color = colors.textSecondary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("${row.count}", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Icon(
            if (row.isFavorite) NextpariWebIcons.Star else NextpariWebIcons.Star,
            contentDescription = "Добавить чемпионат в избранное",
            tint = if (row.isFavorite) Color(0xFF16A34A) else colors.textSecondary,
            modifier = Modifier.padding(start = 8.dp).size(16.dp),
        )
    }
}
