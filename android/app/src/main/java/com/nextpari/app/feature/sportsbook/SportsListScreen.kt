package com.nextpari.app.feature.sportsbook

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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.SportIconRes

@Composable
fun SportsListScreen(
    initialMode: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory),
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    var tab by rememberSaveable { mutableStateOf(initialMode) }
    val football = viewModel.state.collectAsStateWithLifecycle().value
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val rows = viewModel.sportRows(tab).filter { it.name.contains(query.trim(), ignoreCase = true) }
    val storedFavorites by com.nextpari.app.core.AppGraph.sportsFavorites.favorites.collectAsStateWithLifecycle()
    val favoriteScope = androidx.compose.runtime.rememberCoroutineScope()
    androidx.compose.runtime.LaunchedEffect(Unit) { com.nextpari.app.core.AppGraph.sportsFavorites.load() }
    val favorites = storedFavorites.sportIds

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Виды спорта",
                onBack = onBack,
                actions = listOf(NextpariWebIcons.Search to "Поиск"),
                onAction = {
                    searching = !searching
                    if (!searching) query = ""
                },
            )
            if (searching) {
                OutlinedTextField(query, { query = it }, singleLine = true, label = { Text("Поиск по видам спорта") },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp))
            }
            SportsbookSegmentedTabs(
                tabs = listOf("live" to "LIVE", "line" to "Линия", "cybers" to "Киберы"),
                activeId = tab,
                onChange = { tab = it },
            )
        }
        FootballFeedControl(football.loading, football.feed.notice, football.feed.retryable, viewModel::refreshFeed)
        if (rows.isEmpty() && !footballFeedFailed(football)) {
            Text(
                when {
                    football.loading -> "Загрузка событий…"
                    query.isNotBlank() -> "Виды спорта не найдены"
                    else -> "Сейчас событий нет"
                },
                color = colors.textSecondary, fontSize = 14.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
        LazyColumn(Modifier.weight(1f).padding(top = 8.dp).background(if (dark) Color(0xFF1E293B) else Color.White)) {
            itemsIndexed(rows, key = { _, row -> row.id }) { index, row ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            val mode = if (tab == "cybers") "live" else tab
                            onNavigate(Destinations.championships(row.id, mode))
                        }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(painterResource(SportIconRes.drawable(row.id)), contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        row.name,
                        color = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937),
                        fontSize = 15.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                    )
                    Box(
                        Modifier.size(32.dp).clickable {
                            favoriteScope.launch { com.nextpari.app.core.AppGraph.sportsFavorites.toggleSport(row.id) }
                        },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            NextpariWebIcons.Star,
                            contentDescription = if (row.id in favorites) "Убрать из избранного" else "Добавить в избранное",
                            tint = if (row.id in favorites) Color(0xFF16A34A) else Color(0xFF9CA3AF),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    CountPill(row.count)
                }
                if (index != rows.lastIndex) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)))
                }
            }
        }
    }
}
