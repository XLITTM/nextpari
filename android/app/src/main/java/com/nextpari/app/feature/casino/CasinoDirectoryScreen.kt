package com.nextpari.app.feature.casino

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.CancellationException

enum class CasinoDirectoryKind { Categories, Providers }

@Composable
fun CasinoDirectoryScreen(
    kind: CasinoDirectoryKind,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val title = if (kind == CasinoDirectoryKind.Categories) "Категории" else "Провайдеры"
    var retry by rememberSaveable { mutableStateOf(0) }
    var unauthorized by rememberSaveable { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var games by androidx.compose.runtime.remember {
        mutableStateOf(
            listOf("slots", "live").flatMap { category ->
                CasinoCatalogStore.peek("", category, 1)?.games.orEmpty()
            }.distinctBy(CasinoDemoGame::id),
        )
    }
    var loading by rememberSaveable { mutableStateOf(games.isEmpty()) }

    LaunchedEffect(kind, retry) {
        val cached = listOf("slots", "live").flatMap { category ->
            CasinoCatalogStore.peek("", category, 1)?.games.orEmpty()
        }.distinctBy(CasinoDemoGame::id)
        if (cached.isNotEmpty()) {
            games = cached
            loading = false
        } else {
            loading = true
        }
        failed = false
        unauthorized = false
        try {
            val pages = listOf("slots", "live").flatMap { category ->
                CasinoRealCatalogClient.list("", category, 1).games
            }
            games = pages.distinctBy(CasinoDemoGame::id)
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

    val rows = if (kind == CasinoDirectoryKind.Categories) {
        games.map { it.category.ifBlank { "other" } }.distinct().sorted()
            .map { it to CasinoCatalogLogic.categoryLabel(it) }
    } else {
        games.map { it.studio.trim() }.filter { it.isNotEmpty() }.distinct().sorted()
            .map { it to it }
    }
    val visibleGames = selected?.let { key ->
        if (kind == CasinoDirectoryKind.Categories) games.filter { (it.category.ifBlank { "other" }) == key }
        else games.filter { it.studio.trim() == key }
    }.orEmpty()

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar(title, NextpariWebIcons.ChevronLeft, onBack)
        when {
            loading && games.isEmpty() -> Text("Загружаем каталог…", Modifier.padding(16.dp), color = colors.textSecondary)
            failed -> Column(Modifier.padding(16.dp)) {
                Text(CasinoCatalogLogic.emptyMessage(unauthorized), color = colors.textSecondary, fontSize = 14.sp)
                TextButton(onClick = { retry++ }) { Text("Повторить") }
            }
            rows.isEmpty() -> Text(
                CasinoCatalogLogic.emptyMessage(false),
                Modifier.padding(16.dp),
                color = colors.textSecondary,
                fontSize = 14.sp,
            )
            selected == null -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(rows, key = { it.first }) { (id, label) ->
                    Text(
                        label,
                        modifier = Modifier.fillMaxWidth().clickable { selected = id }.padding(vertical = 12.dp),
                        color = colors.text,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            else -> {
                TextButton(onClick = { selected = null }, modifier = Modifier.padding(horizontal = 8.dp)) {
                    Text("Назад к списку")
                }
                if (visibleGames.isEmpty()) {
                    Text("Игры не найдены", Modifier.padding(16.dp), color = colors.textSecondary)
                } else {
                    LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                        items(visibleGames, key = { it.id }) { game ->
                            val destination = when (game.category) {
                                "live" -> Destinations.LIVE_CASINO
                                else -> Destinations.SLOTS
                            }
                            Column(
                                Modifier.fillMaxWidth().clickable { onNavigate(destination) }.padding(vertical = 10.dp),
                            ) {
                                Text(game.title, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                Text(
                                    "${game.studio} · ${CasinoCatalogLogic.categoryLabel(game.category)}",
                                    color = colors.textSecondary,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
