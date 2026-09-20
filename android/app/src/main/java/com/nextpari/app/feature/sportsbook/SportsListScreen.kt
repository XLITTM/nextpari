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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariSportIcon
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

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
    val rows = viewModel.sportRows(tab)
    var favorites by rememberSaveable { mutableStateOf(setOf<String>()) }

    Column(Modifier.fillMaxSize().background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))) {
        Column(Modifier.background(if (dark) Color(0xFF1E293B) else Color.White)) {
            SportsbookScreenHeader(
                title = "Виды спорта",
                onBack = onBack,
                actions = listOf(NextpariIcons.Search to "Поиск"),
            )
            SportsbookSegmentedTabs(
                tabs = listOf("live" to "LIVE", "line" to "Линия", "cybers" to "Киберы"),
                activeId = tab,
                onChange = { tab = it },
            )
        }
        LazyColumn(Modifier.fillMaxSize().padding(top = 8.dp).background(if (dark) Color(0xFF1E293B) else Color.White)) {
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
                    NextpariSportIcon(row.id, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(row.name, color = if (dark) Color(0xFFE5E7EB) else Color(0xFF1F2937), fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Box(
                        Modifier.size(32.dp).clickable { favorites = if (row.id in favorites) favorites - row.id else favorites + row.id },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (row.id in favorites) NextpariIcons.FavoriteStar else NextpariIcons.FavoriteStarBorder,
                            contentDescription = "Добавить вид спорта в избранное",
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
