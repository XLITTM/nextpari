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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchSkeletonCarousel
import com.nextpari.app.feature.home.NextpariMatchCard

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
    val matches = viewModel.pool(tab)

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFE5E7EB))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Список игр",
                onBack = onBack,
                actions = listOf(Icons.Outlined.Search to "Поиск"),
            )
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                GameListTab("LIVE", tab == "live", Modifier.weight(1f)) { tab = "live" }
                GameListTab("Линия", tab == "line", Modifier.weight(1f)) { tab = "line" }
            }
        }
        when {
            viewModel.loading && matches.isEmpty() -> MatchSkeletonCarousel(count = 3)
            matches.isEmpty() -> Text(
                "Сейчас матчей нет",
                color = if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
            )
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
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
