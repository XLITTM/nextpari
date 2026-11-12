package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchSkeletonCarousel
import com.nextpari.app.feature.home.NextpariMatchCard
import com.nextpari.app.feature.home.TrackFootballViewport

@Composable
fun GameListScreen(
    initialMode: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory),
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    var tab by rememberSaveable { mutableStateOf(if (initialMode == "line") "line" else "live") }
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val football = viewModel.state.collectAsStateWithLifecycle().value
    val realMatches = viewModel.pool(tab).filterNot(FeaturedSports::isEsports)
    val matches = if (query.isBlank()) realMatches else realMatches.filter { match ->
        listOf(match.team1, match.team2, match.league, SportsRegions.name(match.country))
            .any { it.contains(query.trim(), ignoreCase = true) }
    }

    val listState = rememberLazyListState()
    TrackFootballViewport(listState, viewModel::visibleMatches)

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFE5E7EB))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Список игр",
                onBack = onBack,
                actions = listOf(NextpariWebIcons.Search to "Поиск"),
                onAction = {
                    searching = !searching
                    if (!searching) query = ""
                },
            )
            if (searching) {
                OutlinedTextField(query, { query = it }, singleLine = true, label = { Text("Поиск матчей") },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp))
            }
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                GameListTab("LIVE", tab == "live", Modifier.weight(1f)) { tab = "live" }
                GameListTab("Линия", tab == "line", Modifier.weight(1f)) { tab = "line" }
            }
        }
        FootballFeedControl(football.loading, football.feed.notice, football.feed.retryable, viewModel::refreshFeed)
        when {
            football.loading && matches.isEmpty() -> MatchSkeletonCarousel(count = 3)
            matches.isEmpty() -> Text(
                if (query.isBlank()) "Сейчас матчей нет" else "Матчи не найдены",
                color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 12.dp),
                state = listState,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(matches, key = { it.id }) { match ->
                    NextpariMatchCard(
                        model = match,
                        carousel = false,
                        onOpen = { onNavigate(Destinations.match(match.id)) },
                        onToggleFavorite = { viewModel.toggleMatchFavorite(match.id) },
                        selectedOdds = football.selectedKeys,
                        onOddSelected = viewModel::toggle,
                    )
                }
            }
        }
    }
}

@Composable
private fun GameListTab(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Box(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (active) colors.accent else if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (active) Color.White else if (dark) Color(0xFFE5E7EB) else Color(0xFF374151),
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
