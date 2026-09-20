package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchSkeletonCarousel
import com.nextpari.app.feature.home.NextpariMatchCard

@Composable
fun LeagueScreen(
    leagueId: String,
    mode: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory),
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val (_, name) = LeagueIds.fromLeagueId(leagueId)
    val resolvedMode = viewModel.rememberMode(mode)
    val matches = viewModel.leagueMatches(leagueId, resolvedMode)

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFF0F2F5))) {
        SportsbookScreenHeader(title = name, onBack = onBack, actions = emptyList())
        when {
            viewModel.loading && matches.isEmpty() -> MatchSkeletonCarousel(count = 3)
            matches.isEmpty() -> Text(
                "Сейчас матчей нет",
                color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
            )
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(matches, key = { it.id }) { match ->
                    NextpariMatchCard(
                        model = match,
                        carousel = false,
                        onOpen = { onNavigate(Destinations.match(match.id)) },
                    )
                }
            }
        }
    }
}
