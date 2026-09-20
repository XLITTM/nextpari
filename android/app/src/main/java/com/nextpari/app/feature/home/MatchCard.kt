package com.nextpari.app.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

data class MatchCardModel(
    val id: String,
    val sport: String,
    val league: String,
    val country: String,
    val team1: String,
    val team2: String,
    val isLive: Boolean = false,
    val score: String? = null,
    val kickoff: String? = null,
    val odds: List<String> = emptyList(),
    val extraMarkets: Int = 0,
)

@Composable
fun NextpariMatchCard(
    model: MatchCardModel,
    carousel: Boolean,
    onOpen: () -> Unit,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Column(
        modifier = Modifier
            .then(if (carousel) Modifier.width(320.dp) else Modifier.fillMaxWidth())
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .background(if (dark) Color(0xFF1E293B) else Color(0xFFF9FAFB))
            .clickable(onClick = onOpen),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(painterResource(SportIconRes.drawable(model.sport)), contentDescription = null, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(6.dp))
            Text(model.league, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Text(" • ", color = colors.textSecondary)
            Text(model.country, color = colors.textSecondary, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Outlined.Notifications, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Outlined.Star, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(16.dp))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(model.team1, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            Text(
                model.score ?: model.kickoff.orEmpty(),
                color = colors.text,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            Text(model.team2, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        }
        if (model.isLive) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(Color(0xFFEF4444)))
                Text(" LIVE", color = Color(0xFFEF4444), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Row(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val labels = if (model.odds.size >= 3) model.odds.take(3) else listOf("1", "X", "2")
            labels.forEach { label ->
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp)).background(if (dark) Color(0xFF334155) else Color(0xFFF3F4F6)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
        if (model.extraMarkets > 0) {
            Row(
                Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("+${model.extraMarkets}", color = colors.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun MatchSkeletonCarousel(count: Int = 2) {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val card = if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6)
    val bar = if (dark) Color(0xFF334155) else Color(0xFFE5E7EB)
    androidx.compose.foundation.lazy.LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(count) {
            Column(
                Modifier
                    .width(320.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
                    .background(card),
            ) {
                Box(Modifier.fillMaxWidth().height(32.dp).background(bar))
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.align(Alignment.CenterHorizontally).width(180.dp).height(16.dp).clip(RoundedCornerShape(8.dp)).background(bar))
                    Box(Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(12.dp)).background(bar))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(3) {
                            Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp)).background(bar))
                        }
                    }
                }
            }
        }
    }
}
