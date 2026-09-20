package com.nextpari.app.feature.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.ProductSectionHeader
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.sportsbook.CountPill
import com.nextpari.app.feature.sportsbook.CountryGroup
import com.nextpari.app.feature.sportsbook.HomeAccordionExpansion
import com.nextpari.app.feature.sportsbook.HomeChampionships
import com.nextpari.app.feature.sportsbook.LeagueIds
import com.nextpari.app.feature.sportsbook.LeagueRow

@Composable
fun HomeChampionshipsAccordion(
    live: List<MatchCardModel>,
    line: List<MatchCardModel>,
    sportId: String,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    var mode by rememberSaveable { mutableStateOf("live") }
    var expanded by rememberSaveable { mutableStateOf("") }
    var userInteracted by rememberSaveable { mutableStateOf(false) }
    var lastMode by rememberSaveable { mutableStateOf("live") }
    var favorites by rememberSaveable { mutableStateOf(setOf<String>()) }
    val groups = HomeChampionships.groups(mode, sportId, live, line)

    LaunchedEffect(mode, groups.map { it.country }.joinToString()) {
        if (lastMode != mode) {
            lastMode = mode
            userInteracted = false
        }
        expanded = HomeAccordionExpansion.resolve(groups, expanded, userInteracted)
    }

    Column(Modifier.padding(top = 16.dp).animateContentSize()) {
        ProductSectionHeader(
            title = HomeChampionships.title(mode),
            filterLabel = "Спорт",
            onFilter = { onNavigate(HomeChampionships.seeAllRoute(sportId, mode)) },
            onSeeAll = { onNavigate(HomeChampionships.seeAllRoute(sportId, mode)) },
        )
        Row(
            Modifier
                .padding(start = 16.dp, end = 16.dp, bottom = 8.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6))
                .padding(4.dp),
        ) {
            HomeModeTab("LIVE", mode == "live", live = true, Modifier.weight(1f)) { mode = "live" }
            HomeModeTab("Линия", mode == "line", live = false, Modifier.weight(1f)) { mode = "line" }
        }
        if (groups.isEmpty()) {
            Text(
                "Сейчас событий нет",
                color = colors.textMuted,
                fontSize = 13.sp,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            )
        } else {
            groups.forEach { group ->
                HomeCountryCard(
                    group = group,
                    expanded = expanded == group.country,
                    dark = dark,
                    favorites = favorites,
                    onToggle = {
                        userInteracted = true
                        expanded = if (expanded == group.country) "" else group.country
                    },
                    onLeague = { league ->
                        onNavigate(Destinations.league(LeagueIds.toLeagueId(league.country, league.name)))
                    },
                    onFavorite = { name ->
                        favorites = if (name in favorites) favorites - name else favorites + name
                    },
                )
            }
        }
    }
}

@Composable
private fun HomeModeTab(label: String, active: Boolean, live: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    val bg = when {
        active && live -> colors.accent
        active -> Color(0xFFD9822B)
        else -> Color.Transparent
    }
    Box(
        modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (active) Color.White else Color(0xFF6B7280),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun HomeCountryCard(
    group: CountryGroup,
    expanded: Boolean,
    dark: Boolean,
    favorites: Set<String>,
    onToggle: () -> Unit,
    onLeague: (LeagueRow) -> Unit,
    onFavorite: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val rotation by animateFloatAsState(if (expanded) 180f else 0f, label = "home-country-chevron")
    Column(
        Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .background(if (dark) Color(0xFF1E293B) else Color.White)
            .animateContentSize(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(50.dp)
                .clickable(onClick = onToggle)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Language, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(
                group.country.ifBlank { "Международные" },
                color = colors.text,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            CountPill(group.count)
            Spacer(Modifier.width(8.dp))
            Icon(
                Icons.Outlined.KeyboardArrowDown,
                contentDescription = null,
                tint = Color(0xFF9CA3AF),
                modifier = Modifier.size(18.dp).rotate(rotation),
            )
        }
        AnimatedVisibility(visible = expanded && group.leagues.isNotEmpty(), enter = expandVertically(), exit = shrinkVertically()) {
            Column(Modifier.background(if (dark) Color(0xFF151E2B) else Color(0xFFF9FAFB))) {
                group.leagues.forEach { league ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onLeague(league) }
                            .padding(start = 44.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            league.name,
                            color = colors.text,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f).padding(end = 8.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        CountPill(league.count)
                        Box(
                            Modifier.size(32.dp).clickable { onFavorite(league.name) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (league.name in favorites) Icons.Outlined.Star else Icons.Outlined.StarBorder,
                                contentDescription = "Добавить чемпионат в избранное",
                                tint = if (league.name in favorites) Color(0xFF16A34A) else colors.textSecondary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
