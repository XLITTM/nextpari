package com.nextpari.app.feature.casino

import android.graphics.BitmapFactory
import android.util.LruCache
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.games.web.GameWebPolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.util.concurrent.TimeUnit

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

private object CasinoDemoCatalogClient {
    private val api by lazy { NetworkModule.playerApi(NetworkModule.okHttpClient()) }

    suspend fun list(query: String, category: String, page: Int): CasinoDemoPage {
        val response = api.casinoDemoCatalog(query, category, page)
        val catalog = response.body()
        if (!response.isSuccessful || catalog?.ok != true) throw IllegalStateException("Casino catalog unavailable")
        return catalog.copy(
            games = catalog.games.filter { it.demo && it.mobile != false && GameWebPolicy.isCasinoDemoId(it.id) },
            nextPage = catalog.nextPage?.takeIf { it == page + 1 },
        )
    }
}

@Composable
fun CasinoDemoCatalog(onOpen: (String) -> Unit, category: String = "") {
    val colors = NextpariTheme.colors
    var query by remember(category) { mutableStateOf("") }
    var page by remember(category) { mutableStateOf(1) }
    var retry by remember(category) { mutableStateOf(0) }
    var games by remember(category) { mutableStateOf(emptyList<CasinoDemoGame>()) }
    var nextPage by remember(category) { mutableStateOf<Int?>(null) }
    var loading by remember(category) { mutableStateOf(true) }
    var failed by remember(category) { mutableStateOf(false) }

    LaunchedEffect(query, category, page, retry) {
        loading = true
        failed = false
        if (query.isNotBlank()) delay(240)
        try {
            val result = CasinoDemoCatalogClient.list(query.trim(), category, page)
            games = (if (page == 1) result.games else games + result.games).distinctBy(CasinoDemoGame::id)
            nextPage = result.nextPage
            loading = false
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            failed = true
            loading = false
        }
    }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Демо-игры", Modifier.padding(horizontal = 16.dp), color = colors.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = query,
            onValueChange = {
                if (it.length <= 120) {
                    query = it
                    page = 1
                    games = emptyList()
                    nextPage = null
                }
            },
            label = { Text("Поиск игр") },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        if (games.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(games, key = CasinoDemoGame::id) { game -> CasinoDemoTile(game) { onOpen(game.id) } }
            }
        }
        when {
            loading -> Text("Загружаем каталог…", Modifier.padding(horizontal = 16.dp), color = colors.textSecondary)
            failed -> TextButton(onClick = { retry++ }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Повторить загрузку каталога") }
            games.isEmpty() -> Text("Демо-игры не найдены", Modifier.padding(horizontal = 16.dp), color = colors.textSecondary)
        }
        if (!loading && !failed && nextPage != null) {
            TextButton(onClick = { nextPage?.let { page = it } }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Показать ещё") }
        }
    }
}

@Composable
private fun CasinoDemoTile(game: CasinoDemoGame, onOpen: () -> Unit) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(16.dp)
    val image by produceState(game.image?.let(CasinoArtwork::cached), game.image) {
        value = game.image?.let { CasinoArtwork.load(it) }
    }
    Column(
        Modifier.width(154.dp).vipNeonFrame(shape = shape, chrome = VipNeonChrome.PressOnly)
            .shadow(5.dp, shape).clip(shape)
            .background(Brush.verticalGradient(listOf(colors.surfaceElevated, colors.surfaceSoft)))
            .border(1.dp, colors.border, shape).clickable(onClick = onOpen),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).background(colors.surfaceMuted), contentAlignment = Alignment.Center) {
            val bitmap = image
            if (bitmap != null) {
                Image(bitmap, null, Modifier.matchParentSize(), contentScale = ContentScale.Fit)
            } else {
                Icon(NextpariWebIcons.Dices, contentDescription = null, tint = colors.textMuted)
            }
            Text("Демо", Modifier.align(Alignment.TopEnd).padding(6.dp).clip(RoundedCornerShape(8.dp))
                .background(colors.surface).padding(horizontal = 5.dp, vertical = 2.dp), color = colors.text, fontSize = 11.sp)
        }
        Text(game.title, Modifier.padding(start = 9.dp, top = 7.dp, end = 9.dp), color = colors.text,
            fontSize = 13.sp, fontWeight = FontWeight.Bold, minLines = 2, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val category = when (game.category) {
            "slots" -> "Слоты"
            "live" -> "Лайв казино"
            "table" -> "Настольные"
            "instant" -> "Моментальные"
            "fishing" -> "Рыбалка"
            "bingo" -> "Бинго"
            "keno" -> "Кено"
            "crash" -> "Crash"
            else -> "Другие"
        }
        Text("${game.studio} · $category", Modifier.padding(start = 9.dp, end = 9.dp, bottom = 8.dp),
            color = colors.textSecondary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

internal fun casinoArtworkUrl(raw: String): String? {
    val uri = runCatching { URI(raw) }.getOrNull() ?: return null
    return raw.takeIf {
        uri.scheme == "https" && uri.host == "cdn.imagesai.org" && uri.port == -1 &&
            uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null
    }
}

private object CasinoArtwork {
    private const val byteLimit = 1024L * 1024
    private val requests = Semaphore(3)
    private val memory = object : LruCache<String, ImageBitmap>(12 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .callTimeout(6, TimeUnit.SECONDS).build()

    fun cached(url: String): ImageBitmap? = memory.get(url)

    suspend fun load(raw: String): ImageBitmap? = requests.withPermit {
        val url = casinoArtworkUrl(raw) ?: return@withPermit null
        cached(url) ?: runInterruptible(Dispatchers.IO) {
            try {
                client.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    val body = response.body ?: return@use null
                    if (!response.isSuccessful || body.contentLength() > byteLimit) return@use null
                    val source = body.source()
                    if (source.request(byteLimit + 1)) return@use null
                    val bytes = source.readByteArray()
                    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                    if (options.outWidth !in 1..1600 || options.outHeight !in 1..1600 ||
                        options.outMimeType !in setOf("image/png", "image/jpeg", "image/webp")) return@use null
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { memory.put(url, it) }
                }
            } catch (_: java.io.IOException) {
                null
            }
        }
    }
}
