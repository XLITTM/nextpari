package com.nextpari.app.feature.sportsbook

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.nextpari.app.R
import com.nextpari.app.feature.home.MatchCardModel
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

data class FootballCompetitionBadge internal constructor(val canonicalId: String, val url: String)

internal data class FootballBadges(
    val home: String?,
    val away: String?,
    val competition: FootballCompetitionBadge?,
    val competitionId: String?,
) {
    companion object {
        // PR #93 resolves participant IDs before assigning the home and away roles.
        fun fromCatalog(value: JsonElement?): FootballBadges? {
            val row = value as? JsonObject ?: return null
            fun field(key: String) = (row[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val competitionId = field("competitionId")?.takeIf { it.isNotBlank() && it == it.trim() }
            val competition = ownedBadgeUrl(field("competition"))
            return FootballBadges(
                home = ownedBadgeUrl(field("home")),
                away = ownedBadgeUrl(field("away")),
                competition = if (competitionId != null && competition != null) FootballCompetitionBadge(competitionId, competition) else null,
                competitionId = competitionId,
            )
        }
    }
}

internal fun ownedBadgeUrl(value: String?): String? {
    val url = value?.toHttpUrlOrNull() ?: return null
    if (!url.isHttps || url.host != "nextpari.net" || url.port != 443 ||
        url.username.isNotEmpty() || url.password.isNotEmpty() || url.query != null || url.fragment != null) return null
    return url.takeIf { it.encodedPath.endsWith(".png") || it.encodedPath.endsWith(".webp") }?.toString()
}

@Composable
internal fun FootballBadge(
    url: String?,
    modifier: Modifier,
    placeholder: @Composable () -> Unit = {},
) {
    if (url == null) {
        placeholder()
        return
    }
    key(url) {
        val bitmap = produceState(FootballBadgeImages.cached(url), url) { value = FootballBadgeImages.load(url) }.value
        if (bitmap == null) placeholder()
        else Image(bitmap, contentDescription = null, modifier = modifier, contentScale = ContentScale.Fit)
    }
}

private object FootballBadgeImages {
    private const val MAX_BYTES = 512 * 1024L
    private const val MAX_DIMENSION = 1_024
    private val requests = Semaphore(3)
    private val cache = object : LruCache<String, ImageBitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }
    private val client = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .callTimeout(5, TimeUnit.SECONDS)
        .build()

    fun cached(url: String): ImageBitmap? = cache.get(url)

    suspend fun load(url: String): ImageBitmap? = requests.withPermit {
        cached(url) ?: runInterruptible(Dispatchers.IO) { download(url) }?.also { cache.put(url, it) }
    }

    private fun download(url: String): ImageBitmap? {
        val owned = ownedBadgeUrl(url) ?: return null
        return try {
            client.newCall(Request.Builder().url(owned).build()).execute().use { response ->
                val body = response.body ?: return null
                if (!response.isSuccessful || body.contentLength() > MAX_BYTES) return null
                val source = body.source()
                if (source.request(MAX_BYTES + 1)) return null
                val bytes = source.readByteArray()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth !in 1..MAX_DIMENSION || bounds.outHeight !in 1..MAX_DIMENSION ||
                    bounds.outMimeType !in setOf("image/png", "image/webp")) return null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        } catch (_: IOException) {
            null
        }
    }
}

internal object BundledFootballBadges {
    // PR #93 starter catalog: Premier League (BetsAPI 94), Arsenal (17230), Manchester City (708).
    const val PREMIER_LEAGUE_ID = "football:eng:premier-league"

    private fun isPremierLeague(match: MatchCardModel): Boolean {
        if (match.sport != "football") return false
        val canonical = match.competitionId ?: match.competitionBadge?.canonicalId
        if (canonical != null) return canonical == PREMIER_LEAGUE_ID
        val name = match.league.trim()
        val country = SportsRegions.code(match.country)
        return (country == "eng" && name.equals("Premier League", ignoreCase = true)) ||
            (country in setOf("eng", "gb") && name.equals("England Premier League", ignoreCase = true))
    }

    fun competition(match: MatchCardModel): Int? = R.drawable.badge_premier_league.takeIf { isPremierLeague(match) }

    fun team(match: MatchCardModel, name: String): Int? {
        if (!isPremierLeague(match)) return null
        return when {
            name.trim().equals("Arsenal", ignoreCase = true) -> R.drawable.badge_arsenal
            name.trim().equals("Manchester City", ignoreCase = true) -> R.drawable.badge_manchester_city
            else -> null
        }
    }
}

@Composable
internal fun CompetitionArtwork(
    url: String?,
    badgeRes: Int?,
    country: String,
    modifier: Modifier,
    placeholder: @Composable () -> Unit = {},
) {
    FootballBadge(url, modifier) {
        if (badgeRes != null) {
            Image(painterResource(badgeRes), contentDescription = null, modifier = modifier, contentScale = ContentScale.Fit)
        } else {
            SportsFlag(SportsRegions.code(country), modifier, placeholder)
        }
    }
}

@Composable
internal fun MatchCompetitionArtwork(
    match: MatchCardModel,
    modifier: Modifier,
    placeholder: @Composable () -> Unit = {},
) = CompetitionArtwork(match.competitionBadge?.url, BundledFootballBadges.competition(match), match.country, modifier, placeholder)
