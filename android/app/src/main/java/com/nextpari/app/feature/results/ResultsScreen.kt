package com.nextpari.app.feature.results

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchTeamArtwork
import com.nextpari.app.feature.sportsbook.SportsbookScreenHeader
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class SportsResultEvent(
    val canonicalEventId: String,
    val sport: String,
    val competition: String,
    val homeTeam: String,
    val awayTeam: String,
    val homeLogoUrl: String?,
    val awayLogoUrl: String?,
    val homeScore: String?,
    val awayScore: String?,
    val status: String,
    val kickoffAt: String?,
)

data class ResultsPage(
    val configured: Boolean,
    val notice: String,
    val events: List<SportsResultEvent>,
)

interface ResultsRepository {
    suspend fun load(window: String, sport: String?): ResultsPage
}

class EmptyResultsRepository : ResultsRepository {
    override suspend fun load(window: String, sport: String?): ResultsPage =
        ResultsPage(false, "Источник результатов не подключён.", emptyList())
}

class RemoteResultsRepository(
    private val api: PlayerApi,
) : ResultsRepository {
    override suspend fun load(window: String, sport: String?): ResultsPage {
        val response = api.sportsResults(window, sport)
        val body = response.body() ?: return EmptyResultsRepository().load(window, sport)
        val data = body["data"]?.jsonObject ?: return EmptyResultsRepository().load(window, sport)
        val configured = data["configured"]?.jsonPrimitive?.booleanOrNull == true ||
            data["configured"]?.jsonPrimitive?.contentOrNull == "true"
        val notice = data["notice"]?.jsonPrimitive?.contentOrNull
            ?: if (configured) "Результатов нет." else "Источник результатов не подключён."
        val events = (data["events"] as? JsonArray)?.mapNotNull { parseResultEvent(it.jsonObject) }.orEmpty()
        return ResultsPage(configured, notice, events)
    }
}

internal fun parseResultEvent(row: JsonObject): SportsResultEvent? {
    val id = row["canonicalEventId"]?.jsonPrimitive?.contentOrNull ?: return null
    fun str(key: String) = row[key]?.jsonPrimitive?.contentOrNull
    fun score(key: String): String? {
        val primitive = row[key]?.jsonPrimitive ?: return null
        return primitive.contentOrNull ?: primitive.intOrNull?.toString()
    }
    return SportsResultEvent(
        canonicalEventId = id,
        sport = str("sport").orEmpty(),
        competition = str("competition").orEmpty(),
        homeTeam = str("homeTeam").orEmpty(),
        awayTeam = str("awayTeam").orEmpty(),
        homeLogoUrl = str("homeLogoUrl"),
        awayLogoUrl = str("awayLogoUrl"),
        homeScore = score("homeScore"),
        awayScore = score("awayScore"),
        status = str("status").orEmpty(),
        kickoffAt = str("kickoffAt"),
    )
}

private val windows = listOf("live" to "LIVE", "today" to "Сегодня", "yesterday" to "Вчера", "archive" to "Архив")
private val sports = listOf(null to "Все", "football" to "Футбол", "basketball" to "Баскетбол", "tennis" to "Теннис", "esports" to "Киберспорт")

@Composable
fun ResultsScreen(
    onBack: () -> Unit,
    repository: ResultsRepository = AppGraph.resultsRepository,
) {
    val colors = NextpariTheme.colors
    var window by remember { mutableStateOf("today") }
    var sport by remember { mutableStateOf<String?>(null) }
    var page by remember { mutableStateOf(ResultsPage(false, "Источник результатов не подключён.", emptyList())) }

    LaunchedEffect(window, sport) {
        page = runCatching { repository.load(window, sport) }.getOrDefault(
            ResultsPage(false, "Источник результатов не подключён.", emptyList()),
        )
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        SportsbookScreenHeader("Результаты", onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FilterRow(windows, window) { window = it }
            FilterRow(sports.map { (id, label) -> (id ?: "") to label }, sport.orEmpty()) {
                sport = it.ifBlank { null }
            }
            Text(page.notice, color = colors.textSecondary, fontSize = 14.sp)
            page.events.forEach { event ->
                ResultMatchCard(event)
            }
        }
    }
}

@Composable
private fun FilterRow(items: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.forEach { (id, label) ->
            val active = selected == id
            Text(
                label,
                color = if (active) colors.accentInk else colors.textSecondary,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier
                    .background(if (active) colors.surfaceMuted else colors.surface, RoundedCornerShape(12.dp))
                    .clickable { onSelect(id) }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun ResultMatchCard(event: SportsResultEvent) {
    val colors = NextpariTheme.colors
    val model = MatchCardModel(
        id = event.canonicalEventId,
        sport = event.sport.ifBlank { "football" },
        league = event.competition,
        country = "",
        team1 = event.homeTeam,
        team2 = event.awayTeam,
        isLive = event.status == "live",
        score = listOfNotNull(event.homeScore, event.awayScore).joinToString(":").ifBlank { null },
        homeBadgeUrl = event.homeLogoUrl,
        awayBadgeUrl = event.awayLogoUrl,
    )
    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.surface, RoundedCornerShape(16.dp))
            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(event.competition, color = colors.textSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            ResultTeam(model, home = true, modifier = Modifier.weight(1f))
            Column(
                Modifier.padding(horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    if (event.homeScore != null || event.awayScore != null) "${event.homeScore ?: "—"}:${event.awayScore ?: "—"}" else "—",
                    color = colors.text,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                )
                Text(
                    statusLabel(event.status),
                    color = if (event.status == "live") colors.accentInk else colors.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            ResultTeam(model, home = false, modifier = Modifier.weight(1f))
        }
        event.kickoffAt?.let {
            Text(it, color = colors.textSecondary, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ResultTeam(model: MatchCardModel, home: Boolean, modifier: Modifier) {
    val name = if (home) model.team1 else model.team2
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        MatchTeamArtwork(model, home, Modifier.size(36.dp))
        Text(
            name,
            color = NextpariTheme.colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

internal fun statusLabel(status: String): String = when (status) {
    "live" -> "LIVE"
    "completed" -> "Завершён"
    "scheduled" -> "Не начался"
    "cancelled" -> "Отменён"
    else -> status
}
