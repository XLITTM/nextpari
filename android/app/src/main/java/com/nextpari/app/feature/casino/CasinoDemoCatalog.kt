package com.nextpari.app.feature.casino

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

@Serializable
data class CasinoDemoGame(
    val id: String,
    val title: String,
    val studio: String,
    val category: String,
    val image: String? = null,
    val demo: Boolean = false,
    val mobile: Boolean? = null,
)

@Serializable
data class CasinoDemoPage(
    val ok: Boolean = false,
    val games: List<CasinoDemoGame> = emptyList(),
    val nextPage: Int? = null,
)

internal class CasinoCatalogException(
    val unauthorized: Boolean,
    message: String,
) : IllegalStateException(message)

internal object CasinoCatalogLogic {
    fun accept(game: CasinoDemoGame): Boolean =
        game.id.isNotBlank() && game.title.isNotBlank() && game.mobile != false

    fun categoryLabel(raw: String): String = when (raw.lowercase()) {
        "slots" -> "Слоты"
        "live" -> "Лайв казино"
        "table" -> "Настольные"
        "instant" -> "Моментальные"
        "fishing" -> "Рыбалка"
        "bingo" -> "Бинго"
        "keno" -> "Кено"
        "crash" -> "Crash"
        else -> raw.ifBlank { "Другие" }
    }

    fun emptyMessage(unauthorized: Boolean): String =
        if (unauthorized) "Войдите в аккаунт, чтобы открыть каталог" else "Игры не найдены"

    fun preview(games: List<CasinoDemoGame>): List<CasinoDemoGame> =
        games.filter(CasinoCatalogLogic::accept).distinctBy(CasinoDemoGame::id).take(12)
}

internal object CasinoRealCatalogClient {
    suspend fun network(
        query: String,
        category: String,
        page: Int,
        api: PlayerApi? = AppGraph.playerApi,
    ): CasinoDemoPage {
        val client = api ?: NetworkModule.playerApi(NetworkModule.okHttpClient())
        val response = client.casinoRealCatalog(query, category, page)
        if (response.code() == 401) {
            throw CasinoCatalogException(true, "JWT_REQUIRED")
        }
        val catalog = response.body()
        if (!response.isSuccessful || catalog?.ok != true) {
            throw CasinoCatalogException(false, "Casino catalog unavailable")
        }
        return catalog.copy(
            games = catalog.games.filter(CasinoCatalogLogic::accept),
            nextPage = catalog.nextPage?.takeIf { it == page + 1 },
        )
    }

    suspend fun list(
        query: String,
        category: String,
        page: Int,
    ): CasinoDemoPage = CasinoCatalogStore.list(query, category, page)
}

@Composable
fun CasinoRealCatalog(
    category: String,
    title: String,
    active: Boolean = true,
    onOpenCatalog: () -> Unit,
) {
    val colors = NextpariTheme.colors
    var retry by remember(category) { mutableStateOf(0) }
    var games by remember(category) {
        mutableStateOf(CasinoCatalogLogic.preview(CasinoCatalogStore.peek("", category, 1)?.games.orEmpty()))
    }
    var loading by remember(category) { mutableStateOf(games.isEmpty()) }
    var failed by remember(category) { mutableStateOf(false) }
    var unauthorized by remember(category) { mutableStateOf(false) }

    LaunchedEffect(category, retry, active) {
        val cached = CasinoCatalogLogic.preview(CasinoCatalogStore.peek("", category, 1)?.games.orEmpty())
        if (cached.isNotEmpty()) {
            games = cached
            loading = false
            failed = false
        }
        val fresh = CasinoCatalogStore.peekFresh("", category, 1)
        if (!active && retry == 0) {
            if (fresh != null) return@LaunchedEffect
            if (cached.isEmpty()) loading = true
            return@LaunchedEffect
        }
        if (fresh != null && retry == 0) return@LaunchedEffect
        if (games.isEmpty()) loading = true
        unauthorized = false
        try {
            games = CasinoCatalogLogic.preview(CasinoRealCatalogClient.list("", category, 1).games)
            loading = false
            failed = false
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
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        com.nextpari.app.core.ui.components.ProductSectionHeader(title = title, onSeeAll = onOpenCatalog)
        if (games.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(games, key = CasinoDemoGame::id) { game -> CasinoRealTile(game, onOpenCatalog) }
            }
        } else if (loading) {
            CasinoCatalogSkeleton()
        }
        when {
            loading && games.isEmpty() -> Unit
            failed -> Column(Modifier.padding(horizontal = 16.dp)) {
                Text(CasinoCatalogLogic.emptyMessage(unauthorized), color = colors.textSecondary, fontSize = 13.sp)
                TextButton(onClick = { retry++ }) { Text("Повторить") }
            }
            !loading && games.isEmpty() -> Text(
                CasinoCatalogLogic.emptyMessage(false),
                Modifier.padding(horizontal = 16.dp),
                color = colors.textSecondary,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun CasinoCatalogSkeleton() {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(16.dp)
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(4) {
            Column(
                Modifier.width(154.dp).clip(shape).background(colors.surfaceSoft).border(1.dp, colors.border, shape),
            ) {
                Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).background(colors.surfaceMuted))
                Box(Modifier.padding(start = 9.dp, top = 10.dp, end = 9.dp).fillMaxWidth().height(14.dp).clip(RoundedCornerShape(6.dp)).background(colors.surfaceMuted))
                Box(Modifier.padding(start = 9.dp, top = 8.dp, end = 36.dp, bottom = 12.dp).fillMaxWidth().height(10.dp).clip(RoundedCornerShape(6.dp)).background(colors.surfaceMuted))
            }
        }
    }
}

@Composable
private fun CasinoRealTile(game: CasinoDemoGame, onOpen: () -> Unit) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(16.dp)
    val image by produceState(game.image?.let(CasinoArtwork::cached), game.image) {
        value = game.image?.let { CasinoArtwork.load(it) }
    }
    val shown = animateFloatAsState(if (image != null) 1f else 0f, label = "casino-art")
    Column(
        Modifier.width(154.dp).vipNeonFrame(shape = shape, chrome = VipNeonChrome.PressOnly)
            .shadow(5.dp, shape).clip(shape)
            .background(Brush.verticalGradient(listOf(colors.surfaceElevated, colors.surfaceSoft)))
            .border(1.dp, colors.border, shape).clickable(onClick = onOpen),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).background(colors.surfaceMuted), contentAlignment = Alignment.Center) {
            Icon(NextpariWebIcons.Dices, contentDescription = null, tint = colors.textMuted)
            val bitmap = image
            if (bitmap != null) {
                Image(
                    bitmap,
                    null,
                    Modifier.matchParentSize().graphicsLayer { alpha = shown.value },
                    contentScale = ContentScale.Crop,
                )
            }
        }
        Text(game.title, Modifier.padding(start = 9.dp, top = 7.dp, end = 9.dp), color = colors.text,
            fontSize = 13.sp, fontWeight = FontWeight.Bold, minLines = 2, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${game.studio} · ${CasinoCatalogLogic.categoryLabel(game.category)}", Modifier.padding(start = 9.dp, end = 9.dp, bottom = 8.dp),
            color = colors.textSecondary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
