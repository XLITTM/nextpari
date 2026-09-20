package com.nextpari.app.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.LiveBadge
import com.nextpari.app.core.ui.components.ProductSectionHeader
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariSportIcon
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun EsportsTournamentsSection(
    items: List<EsportsTournament>,
    onNavigate: (String) -> Unit,
) {
    if (items.isEmpty()) return
    Column(Modifier.padding(top = 16.dp)) {
        ProductSectionHeader(
            title = "Турниры LIVE",
            badge = "Esports",
            onSeeAll = { onNavigate(Destinations.SPORTS_CYBERS) },
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items, key = { it.tournamentId }) { item ->
                EsportsTournamentCard(item) { onNavigate(Destinations.SPORTS_CYBERS) }
            }
        }
    }
}

@Composable
fun EsportsTournamentCard(
    model: EsportsTournament,
    onOpen: () -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(
        Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF0F172A), Color(0xFF1E3A5F))))
            .clickable(onClick = onOpen)
            .padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            NextpariSportIcon(
                model.iconSport,
                modifier = Modifier.size(28.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f)).padding(4.dp),
            )
            Text(
                model.game,
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 8.dp).weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(
                if (model.isFavorite) NextpariIcons.FavoriteStar else NextpariIcons.FavoriteStarBorder,
                contentDescription = null,
                tint = if (model.isFavorite) NextpariIconPalette.Action.Star else NextpariIconPalette.Action.Star.copy(alpha = 0.55f),
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            model.title,
            color = Color.White,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            modifier = Modifier.padding(top = 12.dp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            LiveBadge()
            if (model.liveMatchCount > 0) {
                Text(
                    " ${model.liveMatchCount}",
                    color = colors.accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                )
            }
        }
        Box(Modifier.height(4.dp))
    }
}
