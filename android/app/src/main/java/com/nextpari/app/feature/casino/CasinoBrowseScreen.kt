package com.nextpari.app.feature.casino

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun CasinoBrowseScreen(
    category: String,
    provider: String = "",
    title: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val scope = rememberCoroutineScope()
    var retry by rememberSaveable { mutableIntStateOf(0) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var nextPage by remember { mutableStateOf<Int?>(null) }
    var games by remember {
        mutableStateOf(CasinoCatalogStore.peek("", category, 1, provider)?.games.orEmpty())
    }
    var loading by rememberSaveable { mutableStateOf(games.isEmpty()) }
    var paging by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    var unauthorized by rememberSaveable { mutableStateOf(false) }
    val grid = rememberLazyGridState()

    LaunchedEffect(category, provider, retry) {
        val cached = CasinoCatalogStore.peek("", category, 1, provider)?.games.orEmpty()
        if (cached.isNotEmpty()) {
            games = cached
            loading = false
            nextPage = CasinoCatalogStore.peek("", category, 1, provider)?.nextPage
        } else {
            loading = true
        }
        failed = false
        unauthorized = false
        try {
            val first = CasinoRealCatalogClient.list("", category, 1, provider)
            games = first.games.distinctBy(CasinoDemoGame::id)
            nextPage = first.nextPage
            page = 1
            loading = false
        } catch (error: CancellationException) {
            throw error
        } catch (error: CasinoCatalogException) {
            unauthorized = error.unauthorized
            failed = games.isEmpty()
            loading = false
        } catch (_: Exception) {
            failed = games.isEmpty()
            loading = false
        }
    }

    val loadMore by remember { derivedStateOf {
        val last = grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        nextPage != null && !paging && !loading && games.isNotEmpty() && last >= games.size - 4
    } }
    LaunchedEffect(grid, loadMore, nextPage) {
        snapshotFlow { loadMore }.collect { shouldLoad ->
            val upcoming = nextPage ?: return@collect
            if (!shouldLoad || paging) return@collect
            paging = true
            try {
                val more = CasinoRealCatalogClient.list("", category, upcoming, provider)
                games = (games + more.games).distinctBy(CasinoDemoGame::id)
                nextPage = more.nextPage
                page = upcoming
            } catch (_: Exception) {
                nextPage = null
            } finally {
                paging = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar(title, NextpariWebIcons.ChevronLeft, onBack)
        when {
            loading && games.isEmpty() -> CasinoBrowseSkeleton()
            failed -> Column(Modifier.padding(16.dp)) {
                Text(CasinoCatalogLogic.emptyMessage(unauthorized), color = colors.textSecondary, fontSize = 14.sp)
                TextButton(onClick = { retry++ }) { Text("Повторить") }
            }
            games.isEmpty() -> Text(
                CasinoCatalogLogic.emptyMessage(false),
                Modifier.padding(16.dp),
                color = colors.textSecondary,
                fontSize = 14.sp,
            )
            else -> LazyVerticalGrid(
                state = grid,
                columns = GridCells.Adaptive(154.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(games, key = { it.id }) { game ->
                    CasinoGameTile(game) {
                        scope.launch { CasinoLibraryStore.recordPlayed(game) }
                        onNavigate(Destinations.casinoDemoGame(game.id))
                    }
                }
            }
        }
    }
}

@Composable
private fun CasinoBrowseSkeleton() {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(3) {
            Text(" ", Modifier.fillMaxWidth().background(colors.surfaceMuted).padding(48.dp))
        }
    }
}

internal object CasinoBrowseLogic {
    fun title(category: String, providerName: String = ""): String {
        if (providerName.isNotBlank()) return providerName
        return CasinoCatalogLogic.categoryLabel(category.ifBlank { "slots" })
    }
}
