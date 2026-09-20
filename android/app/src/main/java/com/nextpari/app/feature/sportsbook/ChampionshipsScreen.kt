package com.nextpari.app.feature.sportsbook

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.outlined.Tv
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchSkeletonCarousel
import com.nextpari.app.feature.home.SportIconRes

@Composable
fun ChampionshipsScreen(
    sport: String,
    initialMode: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory),
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    var tab by rememberSaveable { mutableStateOf(if (initialMode == "line") "line" else "live") }
    val groups = viewModel.championships(sport, tab)
    var expanded by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(groups.map { it.country }) {
        expanded = CountryGrouping.nextExpanded(groups, expanded)
    }
    var favorites by rememberSaveable { mutableStateOf(setOf<String>()) }
    val sportName = SportsListCatalog.sportName(sport)

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Чемпионаты",
                onBack = onBack,
                actions = listOf(
                    Icons.Outlined.Search to "Поиск",
                    Icons.Outlined.Language to "Страна",
                    Icons.Outlined.Tv to "Трансляции",
                ),
            )
            SportsbookSegmentedTabs(
                tabs = listOf("live" to "LIVE", "line" to "Линия"),
                activeId = tab,
                onChange = { tab = it },
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(painterResource(SportIconRes.drawable(sport)), contentDescription = null, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Text(sportName.uppercase(), color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563), fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        when {
            viewModel.loading && groups.isEmpty() -> MatchSkeletonCarousel(count = 4)
            groups.isEmpty() -> Text(
                "Сейчас матчей нет",
                color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 32.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            else -> LazyColumn(Modifier.fillMaxSize().background(if (dark) Color(0xFF1E293B) else Color.White)) {
                items(groups, key = { it.country.ifEmpty { it.leagues.firstOrNull()?.name.orEmpty() } }) { group ->
                    CountryAccordion(
                        group = group,
                        expanded = expanded == group.country,
                        dark = dark,
                        favorites = favorites,
                        onToggle = { expanded = if (expanded == group.country) "" else group.country },
                        onLeague = { league ->
                            viewModel.rememberMode(tab)
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
}

@Composable
private fun CountryAccordion(
    group: CountryGroup,
    expanded: Boolean,
    dark: Boolean,
    favorites: Set<String>,
    onToggle: () -> Unit,
    onLeague: (LeagueRow) -> Unit,
    onFavorite: (String) -> Unit,
) {
    val rotation by animateFloatAsState(if (expanded) 180f else 0f, label = "country-chevron")
    Column(Modifier.fillMaxWidth().background(if (dark) Color(0xFF1E293B) else Color.White)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Language, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Text(
                group.country,
                color = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937),
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            CountPill(group.count)
            Spacer(Modifier.width(12.dp))
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp).rotate(rotation))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)))
        AnimatedVisibility(visible = expanded && group.leagues.isNotEmpty(), enter = expandVertically(), exit = shrinkVertically()) {
            Column(Modifier.background(if (dark) Color(0xFF151E2B) else Color(0xFFF9FAFB))) {
                group.leagues.forEach { league ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onLeague(league) }
                            .padding(start = 48.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            league.name,
                            color = if (dark) Color(0xFFD1D5DB) else Color(0xFF374151),
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f).padding(end = 16.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        CountPill(league.count)
                        Spacer(Modifier.width(12.dp))
                        Box(
                            Modifier.size(32.dp).clickable { onFavorite(league.name) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (league.name in favorites) Icons.Outlined.Star else Icons.Outlined.StarBorder,
                                contentDescription = "Добавить чемпионат в избранное",
                                tint = if (league.name in favorites) Color(0xFF16A34A) else Color(0xFF9CA3AF),
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
