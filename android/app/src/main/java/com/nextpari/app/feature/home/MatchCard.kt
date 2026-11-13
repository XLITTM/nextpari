package com.nextpari.app.feature.home

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.nextpari.app.feature.sportsbook.footballEventId
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.sportsbook.BundledFootballBadges
import com.nextpari.app.feature.sportsbook.FootballBadge
import com.nextpari.app.feature.sportsbook.MatchCompetitionArtwork
import com.nextpari.app.feature.sportsbook.SportsFlag
import com.nextpari.app.feature.sportsbook.SportsRegions
import com.nextpari.app.feature.sportsbook.SportsBetSelection
import com.nextpari.app.feature.sportsbook.matchLiveStatus

internal val MatchCardHeight = 168.dp
private val MatchCardShape = RoundedCornerShape(18.dp)
private val MatchCardWidth = 320.dp

internal fun carouselCardWidth(available: Dp): Dp =
    (available - 32.dp).coerceIn(0.dp, MatchCardWidth)

@Composable
fun NextpariMatchCard(
    model: MatchCardModel,
    carousel: Boolean,
    onOpen: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
    selectedOdds: Set<String> = emptySet(),
    onOddSelected: ((SportsBetSelection) -> Unit)? = null,
    carouselWidth: Dp = MatchCardWidth,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val shape = MatchCardShape
    val face = remember(colors, dark) {
        Brush.verticalGradient(
            listOf(
                (if (dark) Color.White.copy(alpha = .045f) else colors.accent.copy(alpha = .035f))
                    .compositeOver(colors.surface),
                colors.surface,
            ),
        )
    }
    Column(
        modifier = Modifier
            .then(if (carousel) Modifier.width(carouselWidth) else Modifier.fillMaxWidth())
            .height(MatchCardHeight)
            .shadow(if (dark) 4.dp else 5.dp, shape, clip = false)
            .clip(shape)
            .background(face)
            .border(1.dp, colors.border, shape)
            .clickable(onClickLabel = "Открыть матч", onClick = onOpen),
    ) {
        Row(
            Modifier.fillMaxWidth().height(36.dp).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            MatchCompetitionArtwork(model, Modifier.size(20.dp)) {
                Image(painterResource(SportIconRes.drawable(model.sport)), null, Modifier.size(20.dp))
            }
            Text(model.league, color = colors.textSecondary, fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (onToggleFavorite != null) {
                Icon(
                    NextpariWebIcons.Star,
                    contentDescription = if (model.isFavorite) "Убрать из избранного" else "Добавить в избранное",
                    tint = if (model.isFavorite) colors.accent else colors.textSecondary,
                    modifier = Modifier.size(22.dp).clickable(onClick = onToggleFavorite).padding(2.dp),
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
        Row(Modifier.fillMaxWidth().height(51.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            TeamSide(model, home = true, modifier = Modifier.weight(1f))
            Text(
                if (model.isLive) model.score ?: "—" else "VS",
                color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                modifier = Modifier.width(66.dp),
            )
            TeamSide(model, home = false, modifier = Modifier.weight(1f))
        }
        Box(Modifier.fillMaxWidth().height(21.dp), contentAlignment = Alignment.Center) {
            val status = if (model.isLive) matchLiveStatus(model) else model.kickoffLabel
            status?.let {
                Text(
                    it,
                    color = if (model.isLive) colors.accentInk else colors.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = if (model.isLive) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 10.dp),
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(16.dp).padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) {
            model.marketTitle?.let {
                Text(it, color = colors.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
        val outcomes = model.outcomes.take(3).ifEmpty {
            if (model.marketTitle == "1X2") listOf("П1", "X", "П2").map { MatchOutcome(it, locked = true) } else emptyList()
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            outcomes.forEach { outcome ->
                val selection = outcome.selection
                OutcomeButton(
                    outcome, dark, Modifier.weight(1f),
                    selected = selection != null && selection.identity in selectedOdds,
                    onClick = if (selection != null && onOddSelected != null) {
                        { onOddSelected(selection) }
                    } else null,
                )
            }
        }
    }
}

@Composable
private fun TeamSide(model: MatchCardModel, home: Boolean, modifier: Modifier) {
    val name = if (home) model.team1 else model.team2
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (!home) MatchTeamArtwork(model, home, Modifier.size(27.dp))
        Text(
            name, color = NextpariTheme.colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp,
            maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = if (home) TextAlign.End else TextAlign.Start,
            modifier = Modifier.weight(1f),
        )
        if (home) MatchTeamArtwork(model, home, Modifier.size(27.dp))
    }
}

@Composable
internal fun MatchTeamArtwork(
    model: MatchCardModel,
    home: Boolean,
    modifier: Modifier,
    placeholderTint: Color = NextpariTheme.colors.textSecondary,
) {
    val name = if (home) model.team1 else model.team2
    val logoRes = (if (home) model.team1LogoRes else model.team2LogoRes) ?: BundledFootballBadges.team(model, name, home)
    val badgeUrl = if (home) model.homeBadgeUrl else model.awayBadgeUrl
    FootballBadge(badgeUrl, modifier) {
        if (logoRes != null) {
            Image(painterResource(logoRes), contentDescription = null, modifier, contentScale = ContentScale.Fit)
        } else {
            SportsFlag(SportsRegions.nationalTeam(model, name), modifier) {
                val initial = remember(name) { name.firstOrNull(Char::isLetter)?.uppercaseChar()?.toString() ?: "–" }
                val shape = RoundedCornerShape(8.dp)
                Box(
                    modifier.clip(shape).background(placeholderTint.copy(alpha = .13f))
                        .border(1.dp, placeholderTint.copy(alpha = .27f), shape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initial, color = placeholderTint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun OutcomeButton(
    outcome: MatchOutcome, dark: Boolean, modifier: Modifier, selected: Boolean, onClick: (() -> Unit)?,
) {
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
            .background(if (selected) colors.surfaceMuted else if (dark) Color(0xFF0F172A) else Color.White)
            .then(if (onClick != null && !outcome.locked && !outcome.odds.isNullOrBlank()) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(outcome.key, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
        if (outcome.locked || outcome.odds.isNullOrBlank()) {
            Icon(NextpariWebIcons.Lock, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(14.dp))
        } else {
            Text(outcome.odds, color = oddsColor, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1)
        }
    }
}

@Composable
fun MatchCarousel(
    matches: List<MatchCardModel>,
    selectedOdds: Set<String> = emptySet(),
    onOddSelected: ((SportsBetSelection) -> Unit)? = null,
    onViewport: ((Any, List<String>) -> Unit)? = null,
    onToggleFavorite: ((String) -> Unit)? = null,
    onOpen: (MatchCardModel) -> Unit,
) {
    val listState = rememberLazyListState()
    TrackFootballViewport(listState, onViewport)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cardWidth = carouselCardWidth(maxWidth)
        androidx.compose.foundation.lazy.LazyRow(
            state = listState,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(matches.size, key = { matches[it].id }) { index ->
                val match = matches[index]
                NextpariMatchCard(
                    model = match, carousel = true, onOpen = { onOpen(match) },
                    onToggleFavorite = onToggleFavorite?.let { toggle -> { toggle(match.id) } },
                    selectedOdds = selectedOdds, onOddSelected = onOddSelected, carouselWidth = cardWidth,
                )
            }
        }
    }
}

@Composable
internal fun TrackFootballViewport(list: LazyListState, onViewport: ((Any, List<String>) -> Unit)?) {
    val callback = rememberUpdatedState(onViewport)
    val source = remember { Any() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(list, lifecycle, onViewport != null) {
        val report = callback.value ?: return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                snapshotFlow {
                    list.layoutInfo.visibleItemsInfo.mapNotNull { it.key as? String }.filter(footballEventId::matches)
                }.collect { report(source, it) }
            } finally {
                report(source, emptyList())
            }
        }
    }
}

@Composable
fun MatchSkeletonCarousel(count: Int = 2) {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val card = if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6)
    val bar = if (dark) Color(0xFF334155) else Color(0xFFE5E7EB)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val width = carouselCardWidth(maxWidth)
        androidx.compose.foundation.lazy.LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(count) {
                Column(
                    Modifier.width(width).height(MatchCardHeight).clip(MatchCardShape).background(card),
                ) {
                    Box(Modifier.fillMaxWidth().height(36.dp).background(bar))
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(10.dp)).background(bar))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            repeat(3) {
                                Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(10.dp)).background(bar))
                            }
                        }
                    }
                }
            }
        }
    }
}
