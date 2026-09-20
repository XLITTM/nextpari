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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.components.LiveBadge
import com.nextpari.app.core.ui.icons.NextpariGlyph
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariSportIcon
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun NextpariMatchCard(
    model: MatchCardModel,
    carousel: Boolean,
    onOpen: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
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
            NextpariSportIcon(model.sport, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(6.dp))
            Text(model.league, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            if (model.country.isNotBlank()) {
                Text(" • ", color = colors.textSecondary)
                Text(model.country, color = colors.textSecondary, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.weight(1f))
            NextpariGlyph(NextpariIcons.Notifications, contentDescription = null, tint = NextpariIconPalette.Action.Bell, size = 16.dp)
            Spacer(Modifier.width(4.dp))
            Icon(
                if (model.isFavorite) NextpariIcons.FavoriteStar else NextpariIcons.FavoriteStarBorder,
                contentDescription = if (model.isFavorite) "Убрать из избранного" else "Добавить в избранное",
                tint = if (model.isFavorite) NextpariIconPalette.Action.Star else NextpariIconPalette.Action.Lock,
                modifier = Modifier.size(16.dp).clickable(enabled = onToggleFavorite != null) { onToggleFavorite?.invoke() },
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (dark) Color(0xFF374151) else Color(0xFFE5E7EB)))
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TeamSide(name = model.team1, logoRes = model.team1LogoRes, alignEnd = true, modifier = Modifier.weight(1f))
            MatchCenter(model)
            TeamSide(name = model.team2, logoRes = model.team2LogoRes, alignEnd = false, modifier = Modifier.weight(1f))
        }
        if (model.isLive) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                LiveBadge(period = model.period)
            }
        }
        if (!model.marketTitle.isNullOrBlank()) {
            Text(
                model.marketTitle,
                color = colors.textMuted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp),
            )
        }
        if (model.outcomes.isNotEmpty()) {
            Row(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                model.outcomes.take(3).forEach { outcome ->
                    OutcomeButton(outcome, dark, Modifier.weight(1f))
                }
            }
        }
        if (model.extraMarkets > 0) {
            Row(
                Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("+${model.extraMarkets} рынков", color = colors.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun TeamSide(name: String, logoRes: Int?, alignEnd: Boolean, modifier: Modifier) {
    val colors = NextpariTheme.colors
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = if (alignEnd) Arrangement.End else Arrangement.Start) {
        if (!alignEnd) TeamAvatar(name, logoRes)
        Text(
            name,
            color = colors.text,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = if (alignEnd) TextAlign.End else TextAlign.Start,
            modifier = Modifier.weight(1f, fill = false).padding(horizontal = 6.dp),
        )
        if (alignEnd) TeamAvatar(name, logoRes)
    }
}

@Composable
private fun TeamAvatar(name: String, logoRes: Int?) {
    val colors = NextpariTheme.colors
    Box(
        Modifier.size(28.dp).clip(CircleShape).background(colors.surfaceMuted),
        contentAlignment = Alignment.Center,
    ) {
        if (logoRes != null) {
            Image(painterResource(logoRes), contentDescription = null, modifier = Modifier.size(28.dp), contentScale = ContentScale.Crop)
        } else {
            Text(name.take(1).uppercase(), color = colors.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun MatchCenter(model: MatchCardModel) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    if (model.isLive && !model.score.isNullOrBlank()) {
        Text(
            model.score,
            color = colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
    } else {
        Column(
            Modifier
                .padding(horizontal = 6.dp)
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(8.dp))
                .background(if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val kickoff = model.kickoffLabel.orEmpty()
            if (kickoff.contains(",")) {
                val parts = kickoff.split(",", limit = 2)
                Text(parts[0].trim(), color = colors.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(parts.getOrNull(1)?.trim().orEmpty(), color = colors.text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
            } else {
                Text("VS", color = colors.text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                if (kickoff.isNotBlank()) {
                    Text(kickoff, color = colors.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun OutcomeButton(outcome: MatchOutcome, dark: Boolean, modifier: Modifier) {
    val colors = NextpariTheme.colors
    val oddsColor = when (outcome.movement) {
        OddsMovement.Up -> Color(0xFF16A34A)
        OddsMovement.Down -> Color(0xFFEF4444)
        OddsMovement.None -> colors.text
    }
    Row(
        modifier
            .height(36.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF0F172A) else Color.White)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(outcome.key, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        if (outcome.locked || outcome.odds.isNullOrBlank()) {
            Icon(NextpariIcons.Lock, contentDescription = null, tint = NextpariIconPalette.Action.Lock, modifier = Modifier.size(14.dp))
        } else {
            Text(outcome.odds, color = oddsColor, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
        }
    }
}

@Composable
fun MatchCarousel(
    matches: List<MatchCardModel>,
    onOpen: (MatchCardModel) -> Unit,
) {
    androidx.compose.foundation.lazy.LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(matches.size, key = { matches[it].id }) { index ->
            val match = matches[index]
            NextpariMatchCard(model = match, carousel = true, onOpen = { onOpen(match) })
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
