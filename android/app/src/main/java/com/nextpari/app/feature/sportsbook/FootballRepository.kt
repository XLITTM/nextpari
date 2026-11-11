package com.nextpari.app.feature.sportsbook

import com.nextpari.app.core.network.ApiErrorMapper
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.userMessage
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchOutcome
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

internal val footballEventId = Regex("[0-9]{1,20}")
private val exactLine = Regex("[+-]?\\d+(?:\\.\\d+)?(?:,[+-]?\\d+(?:\\.\\d+)?)?")
private val kickoffFormat = DateTimeFormatter.ofPattern("dd.MM HH:mm")

interface FootballRepository {
    suspend fun read(eventId: String? = null): FootballSnapshot
    suspend fun place(request: SportsBetRequest): SportsBetResult
}

data class FootballSnapshot(
    val fixtures: List<FootballFixture> = emptyList(),
    val notice: String? = null,
) {
    fun locked(message: String) = copy(
        fixtures = fixtures.map(FootballFixture::locked),
        notice = message,
    )
}

data class FootballFixture(
    val match: MatchCardModel,
    val markets: List<MarketGroup>,
) {
    fun locked() = copy(
        match = match.copy(outcomes = match.outcomes.map { it.copy(odds = null, locked = true, selection = null) }),
        markets = markets.map { group ->
            group.copy(outcomes = group.outcomes.map { it.copy(odds = null, locked = true, selection = null) })
        },
    )
}

@Serializable
data class SportsBetSelection(
    val fixtureId: String,
    val feedType: String,
    val marketId: String,
    val marketKey: String,
    val line: String,
    val outcomeId: String,
    val price: Double,
    val matchLabel: String,
    val league: String,
    val outcomeName: String,
    val provider: String = "betsapi",
) {
    val identity: String
        get() = listOf(fixtureId, marketId, line, outcomeId).joinToString("|")
}

@Serializable
data class SportsBetRequest(
    val stake: Double,
    val mode: String,
    val idempotencyKey: String,
    val selections: List<SportsBetSelection>,
)

sealed interface SportsBetResult {
    data class Accepted(val betId: String) : SportsBetResult
    data class Rejected(val code: String) : SportsBetResult
    data object Unconfirmed : SportsBetResult
}

class RemoteFootballRepository(
    private val api: PlayerApi,
    private val json: Json,
) : FootballRepository {
    override suspend fun read(eventId: String?): FootballSnapshot {
        if (eventId != null && !footballEventId.matches(eventId)) return FootballSnapshot()
        val response = api.footballFeed(eventId)
        val body = response.body()
        if (response.code() == 404 && eventId != null) return FootballSnapshot()
        check(response.isSuccessful && body != null) {
            if (response.code() == 401) "Сессия недействительна" else "Футбольная лента недоступна"
        }
        val feed = json.decodeFromJsonElement<FootballFeedDto>(body)
        return feed.toSnapshot(eventId)
    }

    override suspend fun place(request: SportsBetRequest): SportsBetResult {
        return try {
            val response = api.placeSportsBet(json.encodeToJsonElement(request).jsonObject)
            if (response.code() >= 500) return SportsBetResult.Unconfirmed
            val body = if (response.isSuccessful) response.body() else {
                response.errorBody()?.use { json.parseToJsonElement(it.string()) as? JsonObject }
            }
            val betId = (body?.get("betId") as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
            val ok = (body?.get("ok") as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull
            val error = (body?.get("error") as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
            when {
                response.isSuccessful && ok == true && !betId.isNullOrBlank() -> SportsBetResult.Accepted(betId)
                error == "INTERNAL_ERROR" || error == "GAME_RPC_FAILED" -> SportsBetResult.Unconfirmed
                !error.isNullOrBlank() && (!response.isSuccessful || ok == false) -> SportsBetResult.Rejected(error)
                else -> SportsBetResult.Unconfirmed
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            SportsBetResult.Unconfirmed
        }
    }
}

internal fun footballReadMessage(error: Exception): String =
    if (error is IllegalStateException) error.message ?: "Футбольная лента недоступна"
    else when (error) {
        is java.io.IOException -> ApiErrorMapper.fromThrowable(error).userMessage()
        else -> "Футбольная лента недоступна"
    }

@Serializable
internal data class FootballFeedDto(
    val ok: Boolean = false,
    val error: String? = null,
    val stale: Boolean = false,
    val events: List<FootballEventDto> = emptyList(),
) {
    fun toSnapshot(eventId: String?): FootballSnapshot {
        val issue = when {
            stale -> "Лента устарела. Коэффициенты временно закрыты"
            !ok || error != null -> "Футбольная лента временно недоступна"
            else -> null
        }
        val fixtures = events.filter { eventId == null || it.id == eventId }
            .mapNotNull(FootballEventDto::toFixture)
            .groupBy { it.match.id }
            .values.map { copies ->
                val current = copies.filter { it.match.isLive }.ifEmpty { copies }
                val fixture = current.first()
                if (issue != null || current.any { it != fixture }) fixture.locked() else fixture
            }
        return FootballSnapshot(fixtures, issue)
    }
}

@Serializable
internal data class FootballScoreDto(val home: Int, val away: Int)

@Serializable
internal data class FootballOutcomeDto(val key: String, val price: Double? = null)

@Serializable
internal data class FootballMarketDto(
    val key: String,
    val line: String = "",
    val status: String,
    val outcomes: List<FootballOutcomeDto> = emptyList(),
)

private enum class FootballMarket(
    val key: String,
    val id: String,
    val title: String,
    val category: String,
    val labels: Map<String, String>,
) {
    Result("1x2", "1_1", "1X2", "main", linkedMapOf("home" to "П1", "draw" to "X", "away" to "П2")),
    Total("over_under", "1_3", "Тотал", "totals", linkedMapOf("over" to "ТБ", "under" to "ТМ")),
    Handicap("asian_handicap", "1_2", "Азиатская фора", "handicaps", linkedMapOf("home" to "Ф1", "away" to "Ф2")),
}

@Serializable
internal data class FootballEventDto(
    val id: String,
    val league: String = "",
    val country: String = "",
    val home: String,
    val away: String,
    val kickoff: String? = null,
    val live: Boolean,
    val score: FootballScoreDto? = null,
    val markets: List<FootballMarketDto> = emptyList(),
) {
    fun toFixture(): FootballFixture? {
        if (!footballEventId.matches(id) || home.isBlank() || away.isBlank()) return null
        val groups = FootballMarket.entries.mapNotNull(::marketGroup)
        val mainOdds = groups.firstOrNull { it.marketId == FootballMarket.Result.id }?.outcomes.orEmpty()
        val kickoffLabel = kickoff?.let {
            try {
                Instant.parse(it).atZone(ZoneId.systemDefault()).format(kickoffFormat)
            } catch (_: java.time.DateTimeException) {
                null
            }
        }
        val match = MatchCardModel(
            id = id,
            sport = "football",
            league = league.ifBlank { "Футбол" },
            country = country,
            team1 = home,
            team2 = away,
            isLive = live,
            score = score?.takeIf { it.home >= 0 && it.away >= 0 }?.let { "${it.home} : ${it.away}" },
            kickoffLabel = kickoffLabel,
            marketTitle = "1X2",
            outcomes = FootballMarket.Result.labels.map { (key, label) ->
                val outcome = mainOdds.firstOrNull { it.outcomeId == key }
                MatchOutcome(label, outcome?.odds, locked = outcome?.selection == null, selection = outcome?.selection)
            },
            extraMarkets = groups.filter { it.marketId != FootballMarket.Result.id }.sumOf { it.lineCount },
        )
        return FootballFixture(match, groups)
    }

    private fun marketGroup(market: FootballMarket): MarketGroup? {
        val lines = markets.filter {
            it.key == market.key && if (market == FootballMarket.Result) it.line.isEmpty() else exactLine.matches(it.line)
        }.groupBy { it.line }
        if (lines.isEmpty()) return null
        val outcomes = lines.flatMap { (line, quotes) ->
            val quote = quotes.singleOrNull()?.takeIf { it.status == "open" }
            val prices = quote?.outcomes.orEmpty().groupBy { it.key }
            market.labels.map { (key, shortLabel) ->
                val label = if (line.isEmpty()) shortLabel else "$shortLabel $line"
                val price = prices[key]?.singleOrNull()?.price?.takeIf { it.isFinite() && it > 1 }
                val selection = price?.let {
                    SportsBetSelection(id, if (live) "inplay" else "prematch", market.id, market.key, line, key, it,
                        "$home — $away", league, label)
                }
                MarketOutcome(
                    eventId = id, marketId = market.id, marketKey = market.key, line = line,
                    outcomeId = key, label = label, odds = price?.let(::decimalOdds),
                    locked = selection == null, selection = selection,
                )
            }
        }
        return MarketGroup(market.key, market.title, market.id, market.category, lines.size, outcomes)
    }
}

private fun decimalOdds(price: Double): String {
    val decimal = BigDecimal.valueOf(price).stripTrailingZeros()
    return decimal.setScale(maxOf(2, decimal.scale())).toPlainString()
}
