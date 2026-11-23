package com.nextpari.app.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.feature.casino.CasinoRealCatalog
import com.nextpari.app.feature.sportsbook.FootballFeedControl
import com.nextpari.app.feature.sportsbook.footballFeedFailed
import com.nextpari.app.feature.sportsbook.SportsBetSelection
import com.nextpari.app.feature.sportsbook.SportsbookViewModel
import com.nextpari.app.feature.sportsbook.SportsListCatalog
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariSportIconBadge
import com.nextpari.app.feature.sportsbook.HomeChampionships
import com.nextpari.app.core.ui.components.ProductSectionHeader
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.TabActiveGold

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onNavigate: (String) -> Unit,
    sportsbook: SportsbookViewModel = androidx.lifecycle.viewmodel.compose.viewModel(factory = SportsbookViewModel.Factory),
) {
    val home by viewModel.uiState.collectAsStateWithLifecycle()
    val football = sportsbook.state.collectAsStateWithLifecycle().value
    val live = sportsbook.live()
    val line = sportsbook.line()
    val availableSports = SportsListCatalog.selector(live, line)
    val selectedSport = home.selectedSportId.takeIf { id -> availableSports.any { it.id == id } } ?: "all"
    val state = home.copy(sports = availableSports, selectedSportId = selectedSport, liveMatches = live, lineMatches = line,
        esportsLive = live.filter { it.sport == "esports" },
        esportsLine = line.filter { it.sport == "esports" })
    val colors = NextpariTheme.colors
    val now = System.currentTimeMillis()
    val featuredLive = if (state.mainTabId == "sport") {
        state.filteredLive
    } else {
        SportsbookFilters.matchesForSport(live, "all", excludeEsportsWhenAll = true)
    }
    val featuredLine = if (state.mainTabId == "sport") {
        state.filteredLine
    } else {
        SportsbookFilters.matchesForSport(line, "all", excludeEsportsWhenAll = true)
    }
    val popularLive = sportsbook.featured(true, featuredLive, now)
    val popularLine = sportsbook.featured(false, featuredLine, now)
    val topListState = rememberLazyListState()
    val sportListState = rememberLazyListState()
    val esportsListState = rememberLazyListState()
    val casinoListState = rememberLazyListState()
    val listState = when (state.mainTabId) {
        "sport" -> sportListState
        "esports" -> esportsListState
        "casino" -> casinoListState
        else -> topListState
    }
    val visibleSections by remember(listState) {
        derivedStateOf { listState.layoutInfo.visibleItemsInfo.map { it.key }.toSet() }
    }
    Box(Modifier.fillMaxSize().background(colors.bg)) {
        key(state.mainTabId) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().background(colors.bg),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
        when (state.mainTabId) {
            "casino" -> {
                item(key = "casino") {
                    CasinoHomeContent(
                        features = state.casinoFeatures,
                        tournaments = state.casinoTournaments,
                        categories = state.casinoCategories,
                        onNavigate = onNavigate,
                    )
                }
            }
            "esports" -> {
                item(key = "esports-disciplines") { EsportsDisciplines(state.esports, onNavigate) }
                item(key = "esports-live") {
                    MatchSection(
                        title = "Киберспорт LIVE",
                        matches = state.esportsLive,
                        body = HomeFeedVisibility.alwaysVisibleSection(state.loading, state.esportsLive.size),
                        seeAllRoute = Destinations.SPORTS_CYBERS,
                        onNavigate = onNavigate,
                        badge = "Esports",
                    )
                }
                item(key = "esports-line") {
                    MatchSection(
                        title = "Киберспорт Линия",
                        matches = state.esportsLine,
                        body = HomeFeedVisibility.alwaysVisibleSection(state.loading, state.esportsLine.size),
                        seeAllRoute = Destinations.SPORTS_CYBERS,
                        onNavigate = onNavigate,
                        badge = "Esports",
                    )
                }
                if (HomeFeedVisibility.optionalDataOnly(state.esportsTournaments.size) == HomeSectionBody.Data) {
                    item(key = "esports-tournaments") {
                        EsportsTournamentsSection(state.esportsTournaments, onNavigate)
                    }
                }
            }
            "sport" -> {
                item(key = "sports") { SportsSelector(state, viewModel::selectSport) }
                if (state.promos.isNotEmpty()) item(key = "promos") { PromoRow(state.promos, onNavigate) }
                item(key = "football-refresh") { FootballFeedControl(football.loading, football.feed.notice, football.feed.retryable, sportsbook::refreshFeed) }
                item(key = "live") {
                    MatchSection(
                        title = "Популярное LIVE",
                        matches = popularLive,
                        onViewport = if ("live" in visibleSections) sportsbook::visibleMatches else null,
                        selectedOdds = football.selectedKeys,
                        onOddSelected = sportsbook::toggle,
                        onToggleFavorite = sportsbook::toggleMatchFavorite,
                        body = HomeFeedVisibility.alwaysVisibleSection(football.loading, popularLive.size, footballFeedFailed(football)),
                        seeAllRoute = Destinations.GAMELIST_LIVE,
                        onNavigate = onNavigate,
                        filterLabel = "Спорт",
                    )
                }
                item(key = "line") {
                    MatchSection(
                        title = "Популярное Линия",
                        matches = popularLine,
                        onViewport = if ("line" in visibleSections) sportsbook::visibleMatches else null,
                        selectedOdds = football.selectedKeys,
                        onOddSelected = sportsbook::toggle,
                        onToggleFavorite = sportsbook::toggleMatchFavorite,
                        body = HomeFeedVisibility.alwaysVisibleSection(football.loading, popularLine.size, footballFeedFailed(football)),
                        seeAllRoute = Destinations.GAMELIST_LINE,
                        onNavigate = onNavigate,
                        filterLabel = "Спорт",
                    )
                }
                if (HomeChampionships.preview(state.filteredLive, excludeEsports = true).isNotEmpty()) {
                    item(key = "champs") {
                        HomeChampionshipsAccordion(
                            live = state.filteredLive,
                            sportId = state.selectedSportId,
                            onNavigate = { route ->
                                if (route.startsWith("league/")) sportsbook.rememberMode("live")
                                onNavigate(route)
                            },
                            excludeEsports = true,
                        )
                    }
                }
            }
            else -> {
                item(key = "sports") { SportsSelector(state, viewModel::selectSport) }
                if (state.promos.isNotEmpty()) item(key = "promos") { PromoRow(state.promos, onNavigate) }
                item(key = "football-refresh") { FootballFeedControl(football.loading, football.feed.notice, football.feed.retryable, sportsbook::refreshFeed) }
                val liveBody = HomeFeedVisibility.alwaysVisibleSection(football.loading, popularLive.size, footballFeedFailed(football))
                if (liveBody != HomeSectionBody.Hidden) {
                    item(key = "live") {
                        MatchSection(
                            title = "Популярное LIVE",
                            matches = popularLive,
                            onViewport = if ("live" in visibleSections) sportsbook::visibleMatches else null,
                            selectedOdds = football.selectedKeys,
                            onOddSelected = sportsbook::toggle,
                            onToggleFavorite = sportsbook::toggleMatchFavorite,
                            body = liveBody,
                            seeAllRoute = Destinations.GAMELIST_LIVE,
                            onNavigate = onNavigate,
                            filterLabel = "Спорт",
                        )
                    }
                }
                item(key = "line") {
                    MatchSection(
                        title = "Популярное Линия",
                        matches = popularLine,
                        onViewport = if ("line" in visibleSections) sportsbook::visibleMatches else null,
                        selectedOdds = football.selectedKeys,
                        onOddSelected = sportsbook::toggle,
                        onToggleFavorite = sportsbook::toggleMatchFavorite,
                        body = HomeFeedVisibility.alwaysVisibleSection(football.loading, popularLine.size, footballFeedFailed(football)),
                        seeAllRoute = Destinations.GAMELIST_LINE,
                        onNavigate = onNavigate,
                        filterLabel = "Спорт",
                    )
                }
                if (HomeChampionships.preview(state.filteredLive, excludeEsports = true).isNotEmpty()) {
                    item(key = "champs") {
                        HomeChampionshipsAccordion(
                            live = state.filteredLive,
                            sportId = state.selectedSportId,
                            onNavigate = { route ->
                                if (route.startsWith("league/")) sportsbook.rememberMode("live")
                                onNavigate(route)
                            },
                            excludeEsports = true,
                        )
                    }
                }
                item(key = "esports-disciplines") { EsportsDisciplines(state.esports, onNavigate) }
                if (HomeFeedVisibility.optionalDataOnly(state.esportsLive.size) == HomeSectionBody.Data) {
                    item(key = "esports-live") {
                        MatchSection(
                            title = "Киберспорт LIVE",
                            matches = state.esportsLive,
                            body = HomeSectionBody.Data,
                            seeAllRoute = Destinations.SPORTS_CYBERS,
                            onNavigate = onNavigate,
                            badge = "Esports",
                        )
                    }
                }
                if (HomeFeedVisibility.optionalDataOnly(state.esportsLine.size) == HomeSectionBody.Data) {
                    item(key = "esports-line") {
                        MatchSection(
                            title = "Киберспорт Линия",
                            matches = state.esportsLine,
                            body = HomeSectionBody.Data,
                            seeAllRoute = Destinations.SPORTS_CYBERS,
                            onNavigate = onNavigate,
                            badge = "Esports",
                        )
                    }
                }
                item(key = "popular-slots") {
                    CasinoRealCatalog(
                        "slots",
                        "Популярные слоты",
                        active = "popular-slots" in visibleSections,
                        onOpenCatalog = { onNavigate(Destinations.SLOTS) },
                        onOpenGame = { game -> onNavigate(Destinations.casinoDemoGame(game.id)) },
                    )
                }
                item(key = "popular-live-casino") {
                    CasinoRealCatalog(
                        "live",
                        "Популярное Live Casino",
                        active = "popular-live-casino" in visibleSections,
                        onOpenCatalog = { onNavigate(Destinations.LIVE_CASINO) },
                        onOpenGame = { game -> onNavigate(Destinations.casinoDemoGame(game.id)) },
                    )
                }
            }
        }
        }
    }
    }
}

@Composable
private fun SportsSelector(
    state: HomeUiState,
    onSport: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    LazyRow(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(state.sports, key = { it.id }) { sport ->
            val active = sport.id == state.selectedSportId
            Column(
                modifier = Modifier
                    .widthIn(min = 70.dp)
                    .vipNeonFrame(selected = active, shape = RoundedCornerShape(16.dp))
                    .shadow(if (active) 6.dp else 2.dp, RoundedCornerShape(16.dp))
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.surface)
                    .clickable { onSport(sport.id) }
                    .padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                NextpariSportIconBadge(
                    sportId = sport.id,
                    contentDescription = sport.name,
                    active = active,
                    containerSize = 36.dp,
                    iconSize = 28.dp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    sport.name,
                    color = if (active) TabActiveGold else colors.text,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun PromoRow(promos: List<HomePromo>, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val shape = RoundedCornerShape(HomePromoLayout.Corner)
    val face = remember(colors) {
        Brush.verticalGradient(listOf(colors.surfaceElevated, colors.surfaceSoft))
    }
    val rim = remember(colors, dark) {
        Brush.verticalGradient(
            listOf(
                colors.accent.copy(alpha = if (dark) .44f else .24f).compositeOver(colors.border),
                colors.border,
            ),
        )
    }
    val reflection = remember(dark) {
        Brush.verticalGradient(0f to Color.White.copy(alpha = if (dark) .15f else .18f), .37f to Color.Transparent)
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cardWidth = HomePromoLayout.cardWidth(maxWidth)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(HomePromoLayout.Gap),
        ) {
            items(promos, key = { it.route }) { promo ->
                Column(
                    modifier = Modifier.width(cardWidth)
                        .vipNeonFrame(shape = shape, chrome = VipNeonChrome.PressOnly)
                        .shadow(HomePromoLayout.Shadow, shape, clip = false, spotColor = if (dark) colors.accent else colors.text)
                        .clip(shape).background(face).border(1.dp, rim, shape)
                        .clickable(onClickLabel = promo.title) { onNavigate(promo.route) }
                        .padding(2.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(HomePromoLayout.ImageAspect)
                            .clip(RoundedCornerShape(10.dp)).background(colors.surfaceMuted),
                    ) {
                        Image(
                            painter = painterResource(promo.imageRes),
                            contentDescription = null,
                            modifier = Modifier.matchParentSize(),
                            contentScale = ContentScale.Fit,
                        )
                        Box(Modifier.matchParentSize().background(reflection))
                    }
                    Text(
                        promo.title,
                        color = colors.text,
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        minLines = 2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 3.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun MatchSection(
    title: String,
    matches: List<MatchCardModel>,
    body: HomeSectionBody,
    seeAllRoute: String,
    onNavigate: (String) -> Unit,
    badge: String? = null,
    filterLabel: String? = null,
    selectedOdds: Set<String> = emptySet(),
    onOddSelected: ((SportsBetSelection) -> Unit)? = null,
    onViewport: ((Any, List<String>) -> Unit)? = null,
    onToggleFavorite: ((String) -> Unit)? = null,
) {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(top = 4.dp)) {
        ProductSectionHeader(
            title = title,
            verticalPadding = 4.dp,
            badge = badge,
            filterLabel = filterLabel,
            onFilter = filterLabel?.let { { onNavigate(seeAllRoute) } },
            onSeeAll = { onNavigate(seeAllRoute) },
        )
        when (body) {
            HomeSectionBody.Hidden -> Unit
            HomeSectionBody.Skeleton -> MatchSkeletonCarousel()
            HomeSectionBody.EmptyText -> Text(
                SportsListCatalog.EMPTY_MATCHES,
                color = colors.textMuted,
                fontSize = 14.sp,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            )
            HomeSectionBody.Data -> MatchCarousel(matches, selectedOdds, onOddSelected, onViewport, onToggleFavorite) { match ->
                onNavigate(Destinations.match(match.eventId))
            }
        }
    }
}

@Composable
private fun EsportsDisciplines(items: List<EsportsDiscipline>, onNavigate: (String) -> Unit) {
    Column(Modifier.padding(top = 16.dp)) {
        ProductSectionHeader(
            title = "Дисциплины",
            badge = "Esports",
            onSeeAll = { onNavigate(Destinations.SPORTS_CYBERS) },
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items, key = { it.id }) { item ->
                Box(
                    modifier = Modifier
                        .width(168.dp)
                        .height(228.dp)
                        .shadow(4.dp, RoundedCornerShape(16.dp), clip = false)
                        .clip(RoundedCornerShape(16.dp))
                        .clickable(onClickLabel = item.name) { onNavigate(item.destination) },
                ) {
                    Image(
                        painter = painterResource(item.imageRes),
                        contentDescription = item.name,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                    if (!item.bakedInTitle) {
                        Box(
                            Modifier
                                .align(Alignment.TopStart)
                                .padding(10.dp)
                                .size(36.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.Black.copy(alpha = 0.45f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            NextpariSportIconBadge(
                                sportId = "esports",
                                contentDescription = null,
                                active = true,
                                containerSize = 28.dp,
                                iconSize = 22.dp,
                            )
                        }
                        Box(
                            Modifier
                                .align(Alignment.BottomStart)
                                .fillMaxWidth()
                                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.88f))))
                                .padding(12.dp),
                        ) {
                            Column {
                                Text(
                                    item.name,
                                    color = Color.White,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    lineHeight = 20.sp,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    "Киберспорт",
                                    color = Color.White.copy(alpha = 0.78f),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
