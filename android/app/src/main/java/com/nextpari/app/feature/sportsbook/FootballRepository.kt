package com.nextpari.app.feature.sportsbook

import android.os.SystemClock
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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

internal const val FOOTBALL_BATCH_SIZE = 8
internal val footballEventId = Regex("[0-9]{1,20}")
internal val additionalSportEventId = Regex("betsapi:([0-9]{1,3}):([0-9]{1,20})")
internal fun isSportsFeedEventId(id: String) = footballEventId.matches(id) || additionalSportEventId.matches(id)
private val exactLine = Regex("[+-]?\\d+(?:\\.\\d+)?(?:,[+-]?\\d+(?:\\.\\d+)?)?")
private val kickoffFormat = DateTimeFormatter.ofPattern("dd.MM HH:mm")

interface FootballRepository {
    suspend fun read(eventId: String? = null): FootballSnapshot
    suspend fun readOdds(eventIds: List<String>): FootballOddsBatch
    suspend fun place(request: SportsBetRequest): SportsBetResult
}

data class FootballSnapshot(
    val fixtures: List<FootballFixture> = emptyList(),
    val notice: String? = null,
    val canPrice: Boolean = true,
    val retryable: Boolean = false,
) {
    fun locked(message: String, canRetry: Boolean = true) = copy(
        fixtures = fixtures.map(FootballFixture::locked),
        notice = message,
        canPrice = false,
        retryable = canRetry,
    )
}

enum class FootballPriceState(val notice: String?) {
    Unpriced("Коэффициенты загружаются"),
    Open(null),
    Unavailable("Коэффициенты недоступны"),
    Suspended("Коэффициенты приостановлены"),
    Stale("Коэффициенты устарели"),
    RateLimited("Лимит запросов. Повтор позже"),
    Deferred("Коэффициенты ожидают обновления"),
    Upstream("Не удалось обновить коэффициенты");

    companion object {
        fun fromWire(state: String, stale: Boolean = false): FootballPriceState = if (stale) Stale else when (state) {
            "open" -> Open
            "unpriced" -> Unpriced
            "suspended" -> Suspended
            "stale" -> Stale
            "rate_limited" -> RateLimited
            "deferred" -> Deferred
            "upstream" -> Upstream
            else -> Unavailable
        }
    }
}

data class FootballOddsBatch(
    val quotes: Map<String, FootballOddsQuote> = emptyMap(),
    val fallback: FootballPriceState = FootballPriceState.Unavailable,
)

@Serializable
data class FootballOddsQuote(
    val id: String,
    val priceState: String,
    val stale: Boolean = false,
    val markets: List<FootballMarketDto> = emptyList(),
) {
    val availability: FootballPriceState get() = FootballPriceState.fromWire(priceState, stale)
}

data class FootballFixture(
    val match: MatchCardModel,
    val markets: List<MarketGroup>,
    val priceState: FootballPriceState = FootballPriceState.Unpriced,
    val quoteOrder: Long = 0,
    val validUntil: Long = 0,
    val fullMarkets: Boolean = false,
) {
    fun locked(state: FootballPriceState = FootballPriceState.Stale) = copy(
        match = match.copy(
            outcomes = match.outcomes.map { it.copy(odds = null, locked = true, selection = null) },
            priceNote = state.notice,
        ),
        markets = markets.map { group ->
            group.copy(outcomes = group.outcomes.map { it.copy(odds = null, locked = true, selection = null) })
        },
        priceState = state,
        validUntil = 0,
    )

    fun sameEvent(other: FootballFixture): Boolean =
        match.eventId == other.match.eventId && match.isLive == other.match.isLive &&
            match.team1 == other.match.team1 && match.team2 == other.match.team2

    fun hasPrice(now: Long): Boolean = priceState == FootballPriceState.Open && validUntil > now

    fun withPrices(from: FootballFixture): FootballFixture = from.copy(
        match = match.copy(
            outcomes = from.match.outcomes,
            extraMarkets = from.match.extraMarkets,
            priceNote = from.match.priceNote,
        ),
    )

    fun withQuote(quote: FootballOddsQuote?, fallback: FootballPriceState, order: Long, until: Long): FootballFixture {
        val exactQuote = quote?.takeIf { it.id == match.eventId }
        val availability = exactQuote?.availability ?: fallback
        return withMarkets(exactQuote?.markets.orEmpty(), availability).copy(
            quoteOrder = order,
            fullMarkets = exactQuote != null && availability == FootballPriceState.Open,
            validUntil = if (availability == FootballPriceState.Open) until else 0,
        )
    }
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
    val bookmakerId: String? = null,
    val externalPeriodId: String? = null,
    val externalMarketId: String? = null,
    val sourceSelectionId: String? = null,
    val updatedAt: String? = null,
) {
    val identity: String
        get() = quoteIdentity(provider, fixtureId, feedType, marketId, marketKey, line, outcomeId,
            bookmakerId, externalPeriodId, externalMarketId, sourceSelectionId)
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
        if (eventId != null && !isSportsFeedEventId(eventId)) return FootballSnapshot()
        val response = api.footballFeed(eventId, includeSports = if (eventId == null) "1" else null)
        val body = response.body()
        if (response.code() == 404 && eventId != null) return FootballSnapshot()
        if (!response.isSuccessful || body == null) throw FootballFeedHttpException(response.code())
        val feed = json.decodeFromJsonElement<FootballFeedDto>(body)
        val serverTimeMs = response.raw().headers["Date"]?.let {
            runCatching { Instant.from(DateTimeFormatter.RFC_1123_DATE_TIME.parse(it)).toEpochMilli() }.getOrNull()
        } ?: System.currentTimeMillis()
        val snapshot = feed.toSnapshot(eventId, serverTimeMs, SystemClock.elapsedRealtime())
        if (eventId == null) return snapshot
        if (additionalSportEventId.matches(eventId)) return snapshot.copy(canPrice = false, fixtures = snapshot.fixtures.map { it.copy(fullMarkets = true) })
        val direct = feed.events.singleOrNull { it.id == eventId }
        // The detail endpoint's live=false also covers finished events. A direct link
        // without a future kickoff cannot establish that the fixture is prematch.
        if (direct != null && !direct.live && !isFutureKickoff(direct.kickoff)) {
            return snapshot.copy(
                fixtures = snapshot.fixtures.map { it.locked(FootballPriceState.Unavailable) },
                canPrice = false,
            )
        }
        return snapshot.copy(fixtures = snapshot.fixtures.map { it.copy(fullMarkets = true) })
    }

    override suspend fun readOdds(eventIds: List<String>): FootballOddsBatch {
        val ids = eventIds.asSequence().filter(footballEventId::matches).distinct().take(FOOTBALL_BATCH_SIZE).toList()
        if (ids.isEmpty()) return FootballOddsBatch()
        val response = api.footballOdds(ids.joinToString(","))
        if (response.code() == 429) return FootballOddsBatch(fallback = FootballPriceState.RateLimited)
        val body = response.body()?.takeIf { response.isSuccessful }
            ?: return FootballOddsBatch(fallback = FootballPriceState.Upstream)
        val batch = json.decodeFromJsonElement<FootballOddsDto>(body)
        if (!batch.ok || batch.error != null) return FootballOddsBatch(fallback = FootballPriceState.Upstream)
        val byId = batch.quotes.filter { it.id in ids }.groupBy { it.id }
        return FootballOddsBatch(byId.mapNotNull { (id, rows) ->
            rows.singleOrNull()?.let { id to it }
        }.toMap())
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

internal class FootballFeedHttpException(status: Int) : IllegalStateException(
    if (status == 401) "Сессия недействительна" else "Футбольная лента недоступна",
) {
    val retryable = status == 408 || status in 500..599
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
    fun toSnapshot(
        eventId: String?,
        receiptEpochMs: Long = 0,
        receiptElapsedMs: Long = 0,
    ): FootballSnapshot {
        val issue = when {
            stale -> "Лента устарела. Коэффициенты временно закрыты"
            !ok || error != null -> "Футбольная лента временно недоступна"
            else -> null
        }
        val fixtures = events.filter { eventId == null || it.id == eventId }
            .mapNotNull { it.toFixture(receiptEpochMs, receiptElapsedMs, allowClock = issue == null) }
            .groupBy { it.match.id }
            .values.map { copies ->
                val current = copies.filter { it.match.isLive }.ifEmpty { copies }
                val fixture = current.first()
                when {
                    stale -> fixture.locked()
                    issue != null -> fixture.locked(FootballPriceState.Upstream)
                    current.any { it != fixture } -> fixture.locked(FootballPriceState.Unavailable).let {
                        it.copy(match = it.match.copy(liveClock = null, homeBadgeUrl = null,
                            awayBadgeUrl = null, competitionBadge = null, competitionId = null))
                    }
                    else -> fixture
                }
            }
        return FootballSnapshot(fixtures, issue,
            canPrice = ok && !stale && error !in setOf("TOKEN_MISSING", "RATE_LIMITED"),
            retryable = !stale && error !in setOf("TOKEN_MISSING", "RATE_LIMITED") && (!ok || error != null))
    }
}

@Serializable
private data class FootballOddsDto(
    val ok: Boolean = false,
    val error: String? = null,
    val quotes: List<FootballOddsQuote> = emptyList(),
)

@Serializable
internal data class FootballScoreDto(val home: Int, val away: Int)

@Serializable
data class FootballOutcomeDto(val key: String, val price: Double? = null, val sourceSelectionId: String? = null)

@Serializable
data class FootballMarketDto(
    val key: String,
    val line: String = "",
    val status: String,
    val outcomes: List<FootballOutcomeDto> = emptyList(),
    val bookmakerId: String? = null,
    val externalPeriodId: String? = null,
    val externalMarketId: String? = null,
    val updatedAt: String? = null,
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
    val sport: String = "football",
    val tier: Int? = null,
    val league: String = "",
    val country: String = "",
    val home: String,
    val away: String,
    val kickoff: String? = null,
    val live: Boolean,
    val score: FootballScoreDto? = null,
    val markets: List<FootballMarketDto> = emptyList(),
    val priceState: String? = null,
    val period: String? = null,
    val liveClock: JsonElement? = null,
    val logos: JsonElement? = null,
) {
    fun toFixture(receiptEpochMs: Long = 0, receiptElapsedMs: Long = 0, allowClock: Boolean = true): FootballFixture? {
        if (!isSportsFeedEventId(id) || home.isBlank() || away.isBlank()) return null
        val readOnly = additionalSportEventId.matchEntire(id)
        val expectedSport = readOnly?.groupValues?.get(1)?.let(providerSports::get)
        if (readOnly != null && (expectedSport == null || (expectedSport != sport && !(sport == "esports" && tier == 3)))) return null
        val kickoffTime = kickoff?.let { runCatching { Instant.parse(it) }.getOrNull() }
        val kickoffLabel = kickoffTime?.atZone(ZoneId.systemDefault())?.format(kickoffFormat)
        val badges = FootballBadges.fromCatalog(logos)
        val match = MatchCardModel(
            id = id,
            sport = if (FeaturedSports.isVirtualFootball(league)) "esports" else sport,
            serverTier = tier,
            league = league.ifBlank { "Футбол" },
            country = country,
            team1 = home,
            team2 = away,
            isLive = live,
            score = score?.takeIf { it.home >= 0 && it.away >= 0 }?.let { "${it.home} : ${it.away}" },
            period = period,
            kickoffLabel = kickoffLabel,
            kickoffEpochMs = kickoffTime?.toEpochMilli(),
            marketTitle = "1X2".takeIf { readOnly == null },
            liveClock = if (live && allowClock && sport == "football") FootballLiveClock.fromWire(liveClock, receiptEpochMs, receiptElapsedMs) else null,
            homeBadgeUrl = badges?.home,
            awayBadgeUrl = badges?.away,
            competitionBadge = badges?.competition,
            competitionId = badges?.competitionId,
            hasLogoCatalog = badges != null,
        )
        val availability = FootballPriceState.fromWire(priceState ?: if (markets.any { it.status == "open" }) "open" else "unpriced")
        val fixture = FootballFixture(match, emptyList())
        return if (readOnly == null) fixture.withMarkets(markets, availability)
        else fixture.withObservedMarkets(markets, readOnly.groupValues[1], receiptEpochMs, receiptElapsedMs)

    }
}

private val providerSports = mapOf(
    "13" to "tennis", "18" to "basketball", "17" to "hockey", "91" to "volleyball",
    "92" to "table-tennis", "78" to "handball", "16" to "baseball", "94" to "badminton",
    "14" to "snooker", "83" to "futsal", "15" to "darts", "3" to "cricket",
    "12" to "american-football", "8" to "rugby", "19" to "rugby-league", "36" to "aussie-rules",
    "90" to "floorball", "95" to "beach-volleyball", "110" to "polo", "107" to "squash",
    "151" to "esports", "162" to "mma", "2" to "horse-racing", "4" to "greyhounds",
    "66" to "bowls", "9" to "boxing", "75" to "gaelic-sports",
)

private fun FootballFixture.withObservedMarkets(
    rows: List<FootballMarketDto>, sportId: String, epochNow: Long, elapsedNow: Long,
): FootballFixture {
    val labels = mapOf("home" to "П1", "draw" to "X", "away" to "П2", "over" to "ТБ", "under" to "ТМ")
    val limit = if (match.isLive) 30_000L else 180_000L
    val groups = rows.groupBy { quoteIdentity(it.key, it.externalMarketId, it.externalPeriodId, it.bookmakerId, it.line) }
        .mapNotNull { (identity, candidates) ->
            val row = candidates.singleOrNull() ?: return@mapNotNull null
            val marketId = row.externalMarketId ?: return@mapNotNull null
            val (suffix, title, category) = when (row.key) {
                "1x2", "moneyline" -> Triple("1", "Исход", "main")
                "asian_handicap" -> Triple("2", "Фора", "handicaps")
                "over_under" -> Triple("3", "Тотал", "totals")
                else -> return@mapNotNull null
            }
            if (marketId != "${sportId}_$suffix") return@mapNotNull null
            val observedAt = row.updatedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            val age = observedAt?.let { epochNow - it }?.takeIf { it in 0 until limit }
            val validUntil = if (row.status == "open" && age != null) elapsedNow + limit - age else null
            val outcomes = row.outcomes.groupBy(FootballOutcomeDto::key).mapNotNull outcome@{ (key, matches) ->
                val label = labels[key] ?: return@outcome null
                val outcome = matches.singleOrNull() ?: return@outcome null
                val price = outcome.price?.takeIf { validUntil != null && it.isFinite() && it > 1 }
                MarketOutcome(eventId = match.eventId, marketId = marketId, marketKey = row.key, line = row.line,
                    outcomeId = key, label = listOf(label, row.line).filter(String::isNotBlank).joinToString(" "),
                    odds = price?.let(::decimalOdds), locked = true, observedUntil = validUntil)
            }
            if (outcomes.isEmpty()) return@mapNotNull null
            MarketGroup(identity, listOf(title, row.line).filter(String::isNotBlank).joinToString(" · "),
                marketId, category, 1, outcomes)
        }
    return copy(markets = groups, fullMarkets = groups.isNotEmpty(), priceState = FootballPriceState.Unavailable)
}

private fun FootballFixture.withMarkets(rows: List<FootballMarketDto>, state: FootballPriceState): FootballFixture {
    val groups = FootballMarket.entries.flatMap { market ->
        rows.filter { row ->
            row.key == market.key && (row.externalMarketId.isNullOrEmpty() || row.externalMarketId == market.id) &&
                (if (market == FootballMarket.Result) row.line.isEmpty() else exactLine.matches(row.line))
        }.groupBy { quoteIdentity(market.key, it.bookmakerId, it.externalPeriodId, it.externalMarketId) }
            .map { (groupKey, sourcedRows) ->
                val lines = sourcedRows.groupBy { it.line }
                val outcomes = lines.flatMap { (line, quotes) ->
                    val quote = quotes.singleOrNull()?.takeIf { it.status == "open" && state == FootballPriceState.Open }
                    val prices = quote?.outcomes.orEmpty().groupBy { it.key }
                    market.labels.map { (key, shortLabel) ->
                        // The normalized legacy wire carries only a market line, with no signed per-outcome handicap.
                        val ambiguous = market == FootballMarket.Handicap &&
                            line.split(',').any { it.toBigDecimalOrNull()?.signum() != 0 }
                        val label = when {
                            line.isEmpty() -> shortLabel
                            ambiguous -> "$shortLabel · линия $line"
                            else -> "$shortLabel $line"
                        }
                        val outcome = prices[key]?.singleOrNull()
                        val price = outcome?.price?.takeIf { !ambiguous && it.isFinite() && it > 1 }
                        val selection = if (price != null && quote != null && match.sport == "football") SportsBetSelection(
                            fixtureId = match.eventId, feedType = if (match.isLive) "inplay" else "prematch",
                            marketId = market.id, marketKey = market.key, line = line, outcomeId = key, price = price,
                            matchLabel = "${match.team1} — ${match.team2}", league = match.league, outcomeName = label,
                            bookmakerId = quote.bookmakerId, externalPeriodId = quote.externalPeriodId,
                            externalMarketId = quote.externalMarketId, sourceSelectionId = outcome?.sourceSelectionId,
                            updatedAt = quote.updatedAt,
                        ) else null
                        MarketOutcome(
                            eventId = match.eventId, marketId = market.id, marketKey = market.key, line = line,
                            outcomeId = key, label = label, odds = price?.let(::decimalOdds),
                            locked = selection == null, selection = selection,
                        )
                    }
                }
                MarketGroup(groupKey, market.title, market.id, market.category, lines.size, outcomes)
            }
    }
    // A card uses one complete 1X2 source. It never fills a missing outcome from a different source.
    val main = groups.firstOrNull { it.marketId == FootballMarket.Result.id && it.outcomes.all { out -> out.selection != null } }
        ?: groups.firstOrNull { it.marketId == FootballMarket.Result.id && it.outcomes.any { out -> out.selection != null } }
    val effectiveState = if (state == FootballPriceState.Open && groups.none { group ->
        group.outcomes.any { it.selection != null }
    }) FootballPriceState.Unavailable else state
    return copy(
        match = match.copy(
            outcomes = FootballMarket.Result.labels.map { (key, label) ->
                val outcome = main?.outcomes?.firstOrNull { it.outcomeId == key }
                MatchOutcome(label, outcome?.odds, locked = outcome?.selection == null, selection = outcome?.selection)
            },
            extraMarkets = groups.filter { it.marketId != FootballMarket.Result.id }.sumOf { it.lineCount },
            priceNote = effectiveState.notice,
        ),
        markets = groups,
        priceState = effectiveState,
    )
}

private fun quoteIdentity(vararg parts: String?): String =
    parts.joinToString("") { if (it == null) "-:" else "${it.length}:$it" }

private fun isFutureKickoff(value: String?): Boolean = value?.let {
    try {
        Instant.parse(it).isAfter(Instant.now())
    } catch (_: java.time.DateTimeException) {
        false
    }
} == true

private fun decimalOdds(price: Double): String {
    val decimal = BigDecimal.valueOf(price).stripTrailingZeros()
    return decimal.setScale(maxOf(2, decimal.scale())).toPlainString()
}
