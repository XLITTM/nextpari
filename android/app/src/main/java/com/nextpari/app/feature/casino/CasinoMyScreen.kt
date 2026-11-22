package com.nextpari.app.feature.casino

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.launch

@Composable
fun CasinoMyScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val scope = rememberCoroutineScope()
    val library by CasinoLibraryStore.library.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { CasinoLibraryStore.load() }
    val favorites = CasinoLibraryStore.games(library.favoriteIds)
    val recent = CasinoLibraryStore.games(library.recentIds)

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar("Моё казино", NextpariWebIcons.ChevronLeft, onBack)
        if (favorites.isEmpty() && recent.isEmpty()) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Пока нет сохранённых игр", color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(
                    "Добавляйте слоты и live-игры в избранное, чтобы открывать их отсюда. Недавние игры появятся после запуска из каталога.",
                    color = colors.textSecondary,
                    fontSize = 14.sp,
                )
                Button(onClick = { onNavigate(Destinations.CASINO_CATEGORIES) }) {
                    Text("Открыть каталог")
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(154.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                if (favorites.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "fav-title") {
                        Text("Избранное", color = colors.text, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(vertical = 6.dp))
                    }
                    items(favorites, key = { "fav-${it.id}" }) { game ->
                        CasinoGameTile(game) {
                            scope.launch { CasinoLibraryStore.recordPlayed(game) }
                            onNavigate(Destinations.casinoDemoGame(game.id))
                        }
                    }
                }
                if (recent.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "recent-title") {
                        Text("Недавние", color = colors.text, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(vertical = 6.dp))
                    }
                    items(recent, key = { "recent-${it.id}" }) { game ->
                        CasinoGameTile(game) {
                            scope.launch { CasinoLibraryStore.recordPlayed(game) }
                            onNavigate(Destinations.casinoDemoGame(game.id))
                        }
                    }
                }
            }
        }
    }
}
