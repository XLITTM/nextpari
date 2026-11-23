package com.nextpari.app.feature.sportsbook

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariSportMark
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchSkeletonCarousel

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
    val football = viewModel.state.collectAsStateWithLifecycle().value
    var searchLabel by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    val groups = CountryGrouping.search(viewModel.championships(sport, tab), query, searchLabel == "Страна")
    val storedFavorites by com.nextpari.app.core.AppGraph.sportsFavorites.favorites.collectAsStateWithLifecycle()
    val favorites = storedFavorites.leagueIds
    val directory = CompetitionDirectory.organize(groups, favorites)
    var expanded by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(directory.countries.map { it.country }) {
        expanded = CountryGrouping.nextExpanded(directory.countries, expanded)
    }
    val favoriteScope = androidx.compose.runtime.rememberCoroutineScope()
    androidx.compose.runtime.LaunchedEffect(Unit) { com.nextpari.app.core.AppGraph.sportsFavorites.load() }
    var actionNotice by rememberSaveable { mutableStateOf("") }
    val sportName = SportsListCatalog.sportName(sport)

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Чемпионаты",
                onBack = onBack,
                actions = listOf(
                    NextpariWebIcons.Search to "Поиск",
                    NextpariWebIcons.Globe to "Страна",
                    NextpariWebIcons.Tv to "Трансляции",
                ),
                onAction = { label ->
                    if (label == "Трансляции") {
                        actionNotice = "Трансляции недоступны"
                    } else {
                        actionNotice = ""
                        searchLabel = if (searchLabel == label) "" else label
                        query = ""
                    }
                },
            )
            if (searchLabel.isNotEmpty()) {
                OutlinedTextField(query, { query = it }, singleLine = true,
                    label = { Text(if (searchLabel == "Страна") "Поиск по стране" else "Поиск чемпионатов") },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp))
            }
            if (actionNotice.isNotBlank()) {
                Text(actionNotice, color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }
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
            NextpariSportMark(sport, size = 24.dp)
            Spacer(Modifier.width(8.dp))
            Text(sportName.uppercase(), color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563), fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        FootballFeedControl(football.loading, football.feed.notice, football.feed.retryable, viewModel::refreshFeed)
        when {
            football.loading && groups.isEmpty() -> MatchSkeletonCarousel(count = 4)
            groups.isEmpty() && !footballFeedFailed(football) -> Text(
                if (query.isBlank()) "Сейчас матчей нет" else "Чемпионаты не найдены",
                color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 32.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            else -> ChampionshipsDirectory(
                directory = directory,
                dark = dark,
                favorites = favorites,
                expanded = expanded,
                onToggle = { country -> expanded = if (expanded == country) "" else country },
                onLeague = { league ->
                    viewModel.rememberMode(tab)
                    onNavigate(Destinations.league(league.id))
                },
                onFavorite = { id ->
                    favoriteScope.launch { com.nextpari.app.core.AppGraph.sportsFavorites.toggleLeague(id) }
                },
            )
        }
    }
}

@Composable
fun ChampionshipsDirectory(
    directory: CompetitionDirectory,
    dark: Boolean,
    favorites: Set<String>,
    expanded: String,
    onToggle: (String) -> Unit,
    onLeague: (LeagueRow) -> Unit,
    onFavorite: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (directory.favorites.isNotEmpty()) {
            item(key = "section-favorites") { DirectorySectionTitle("Избранное", dark) }
            items(directory.favorites, key = { "fav:${it.id}" }) { league ->
                CompetitionCard(league, dark, league.id in favorites, onLeague, onFavorite)
            }
        }
        if (directory.top.isNotEmpty()) {
            item(key = "section-top") { DirectorySectionTitle("Топ-чемпионаты", dark) }
            items(directory.top, key = { "top:${it.id}" }) { league ->
                CompetitionCard(league, dark, league.id in favorites, onLeague, onFavorite)
            }
        }
        if (directory.international.isNotEmpty()) {
            item(key = "section-international") { DirectorySectionTitle("Международные", dark) }
            items(directory.international, key = { "int:${it.id}" }) { league ->
                CompetitionCard(league, dark, league.id in favorites, onLeague, onFavorite)
            }
        }
        items(directory.countries, key = { "country:${it.country.ifEmpty { it.leagues.firstOrNull()?.id.orEmpty() }}" }) { group ->
            CountryAccordion(
                group = group,
                expanded = expanded == group.country,
                dark = dark,
                favorites = favorites,
                onToggle = { onToggle(group.country) },
                onLeague = onLeague,
                onFavorite = onFavorite,
            )
        }
    }
}

@Composable
private fun DirectorySectionTitle(title: String, dark: Boolean) {
    Text(
        title,
        color = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937),
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
    )
}

@Composable
private fun CompetitionCard(
    league: LeagueRow,
    dark: Boolean,
    favorite: Boolean,
    onLeague: (LeagueRow) -> Unit,
    onFavorite: (String) -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(2.dp, shape)
            .clip(shape)
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), shape)
            .background(if (dark) Color(0xFF1E293B) else Color.White)
            .clickable { onLeague(league) }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompetitionArtwork(league.badge?.url, league.badgeRes, league.country, Modifier.size(22.dp)) {
            NextpariSportMark(league.sport, size = 22.dp)
        }
        Spacer(Modifier.width(10.dp))
        Text(
            league.name,
            color = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        CountPill(league.count)
        Box(
            Modifier.size(32.dp).clickable { onFavorite(league.id) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                NextpariWebIcons.Star,
                contentDescription = "Добавить чемпионат в избранное",
                tint = if (favorite) Color(0xFF16A34A) else Color(0xFF9CA3AF),
                modifier = Modifier.size(18.dp),
            )
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
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .shadow(2.dp, shape)
            .clip(shape)
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), shape)
            .background(if (dark) Color(0xFF1E293B) else Color.White),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SportsFlag(SportsRegions.code(group.country), Modifier.size(20.dp)) {
                Icon(NextpariWebIcons.Trophy, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Text(
                SportsRegions.name(group.country),
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
                Icon(NextpariWebIcons.ChevronDown, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp).rotate(rotation))
            }
        }
        AnimatedVisibility(visible = expanded && group.leagues.isNotEmpty(), enter = expandVertically(), exit = shrinkVertically()) {
            Column(Modifier.background(if (dark) Color(0xFF151E2B) else Color(0xFFF9FAFB))) {
                group.leagues.forEach { league ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onLeague(league) }
                            .padding(start = 24.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CompetitionArtwork(league.badge?.url, league.badgeRes, league.country, Modifier.size(18.dp)) {
                            NextpariSportMark(league.sport, size = 18.dp)
                        }
                        Spacer(Modifier.width(6.dp))
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
                            Modifier.size(32.dp).clickable { onFavorite(league.id) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (league.id in favorites) NextpariWebIcons.Star else NextpariWebIcons.Star,
                                contentDescription = "Добавить чемпионат в избранное",
                                tint = if (league.id in favorites) Color(0xFF16A34A) else Color(0xFF9CA3AF),
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
