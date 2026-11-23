package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.MatchCardModel
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FootballScoreboardTest {
    private val observed = "2026-11-21T21:10:00.000Z"
    private val later = "2026-11-21T21:11:00.000Z"
    private val receipt = Instant.parse("2026-11-21T21:10:12.000Z").toEpochMilli()
    private val tick = 5_000L

    private fun clockJson(
        minute: Int = 69,
        second: Int = 35,
        running: Boolean = true,
        stale: Boolean = false,
        observedAt: String = observed,
    ) = Json.parseToJsonElement(
        """{"minute":$minute,"second":$second,"running":$running,"observedAt":"$observedAt","stale":$stale}""",
    )

    private fun event(
        home: Int,
        away: Int,
        observedAt: String = observed,
        minute: Int = 69,
        second: Int = 35,
        extraMarkets: List<MarketGroup> = emptyList(),
    ): FootballFixture {
        val at = Instant.parse(observedAt).toEpochMilli()
        val clock = FootballLiveClock.fromWire(clockJson(minute, second, observedAt = observedAt), at + 12_000, tick)
        val match = MatchCardModel(
            id = "oddspapi-v5:id1000000872478722",
            sport = "football",
            league = "LaLiga",
            country = "Spain",
            team1 = "Real Madrid",
            team2 = "RC Celta de Vigo",
            isLive = true,
            score = "$home : $away",
            period = "second_half",
            liveClock = clock,
            outcomes = listOf(
                com.nextpari.app.feature.home.MatchOutcome("П1", "1.80"),
                com.nextpari.app.feature.home.MatchOutcome("X", "3.40"),
                com.nextpari.app.feature.home.MatchOutcome("П2", "4.20"),
            ),
            extraMarkets = extraMarkets.size,
            scoreObservedAtEpochMs = at,
        )
        return FootballFixture(match, extraMarkets, FootballPriceState.Open, fullMarkets = extraMarkets.size > 1)
    }

    @Test
    fun goalUpdateReplacesTheScoreboardOnEveryLiveView() {
        val previous = event(0, 1)
        val incoming = event(1, 1, later, minute = 70, second = 5)
        val board = applyLiveBoard(listOf(previous), listOf(incoming))
        val listed = applyLiveBoard(listOf(previous), listOf(incoming))
        val detail = mergeDetailScoreboard(previous.match, incoming.match)
        assertEquals("1 : 1", listed.single().match.score)
        assertEquals("1 : 1", board.single().match.score)
        assertEquals("1 : 1", detail?.score)
        assertEquals(listed.single().match.eventId, board.single().match.eventId)
        assertEquals("70:17", board.single().match.liveClock?.labelAt(tick))
    }

    @Test
    fun oddsRefreshCannotChangeTheLiveScore() {
        val match = event(1, 1, later)
        val quote = FootballOddsQuote(
            id = match.match.eventId,
            priceState = "open",
            markets = listOf(
                FootballMarketDto(
                    "1x2", "", "open",
                    listOf(
                        FootballOutcomeDto("home", 1.55),
                        FootballOutcomeDto("draw", 4.2),
                        FootballOutcomeDto("away", 8.1),
                    ),
                    bookmakerId = "1xbet",
                    externalPeriodId = "fulltime",
                    externalMarketId = "101",
                    updatedAt = later,
                ).checkedAt(Instant.parse(later).toEpochMilli(), tick),
            ),
        )
        val quoted = match.withQuote(quote, FootballPriceState.Unavailable, 2, tick + 30_000)
        assertEquals("1 : 1", quoted.match.score)
        assertEquals(match.match.liveClock?.observedAtEpochMs, quoted.match.liveClock?.observedAtEpochMs)
        assertEquals("second_half", quoted.match.period)
    }

    @Test
    fun olderOddsSnapshotCannotRevertANewerScore() {
        val current = event(1, 1, later, minute = 70, second = 5)
        val older = event(0, 1, observed)
        val merged = current.withScoreboard(fresherScoreboard(current.match, older.match, preferIncoming = true))
        assertEquals("1 : 1", merged.match.score)
        assertEquals(current.match.liveClock?.observedAtEpochMs, merged.match.liveClock?.observedAtEpochMs)
    }

    @Test
    fun olderCachedDetailCannotOverrideNewerListing() {
        val listed = event(1, 1, later, minute = 70, second = 5)
        val detail = event(0, 1, observed)
        val merged = mergeDetailScoreboard(listed.match, detail.match)
        assertEquals("1 : 1", merged?.score)
        assertEquals(listed.match.liveClock?.observedAtEpochMs, merged?.liveClock?.observedAtEpochMs)
    }

    @Test
    fun liveMinuteAndPeriodStayConsistentAcrossListingAndDetail() {
        val listed = event(2, 1, later, minute = 87, second = 40)
        val detail = event(0, 1, observed, minute = 69, second = 10)
        val merged = mergeListingIntoDetail(detail, listed, keepInsights = true)
        assertEquals("2 : 1", merged.match.score)
        assertEquals("second_half", merged.match.period)
        assertEquals(listed.match.liveClock?.observedAtEpochMs, merged.match.liveClock?.observedAtEpochMs)
    }

    @Test
    fun pausedClockDoesNotContinueTicking() {
        val paused = FootballLiveClock.fromWire(
            clockJson(minute = 45, second = 0, running = false, observedAt = Instant.ofEpochMilli(receipt - 8_000).toString()),
            receipt,
            tick,
        )
        assertEquals("45:00", paused?.labelAt(tick))
        assertEquals("45:00", paused?.labelAt(tick + 15_000))
        assertFalse(paused?.stale == true)
    }

    @Test
    fun staleSnapshotKeepsTheLastVerifiedScoreAndHidesTheTickingMinute() {
        val shown = FootballLiveClock.fromWire(
            clockJson(observedAt = Instant.ofEpochMilli(receipt - 120_000).toString()),
            receipt,
            tick,
        )
        assertTrue(shown?.stale == true)
        assertNull(shown?.labelAt(tick))
        val kept = applyLiveBoard(listOf(event(0, 1)), emptyList())
        assertEquals("0 : 1", kept.single().match.score)
        val marked = markLiveBoardStale(listOf(event(0, 1)))
        assertEquals("0 : 1", marked.single().match.score)
        assertTrue(marked.single().match.boardStale)
        assertNull(marked.single().match.liveClock?.labelAt(tick))
    }

    @Test
    fun duplicateFixtureIdentityIsCollapsedToOneEvent() {
        val first = event(0, 1)
        val copy = event(1, 1, later)
        val merged = applyLiveBoard(listOf(first, first), listOf(copy))
        assertEquals(2, merged.size)
        assertEquals(1, merged.map { it.match.eventId }.distinct().size)
        assertEquals("1 : 1", merged[0].match.score)
        assertEquals("1 : 1", merged[1].match.score)
    }

    @Test
    fun viewModelKeepsNewerScoreWhenOddsHydrateAndOlderBoardArrives() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val current = event(1, 1, later, minute = 70, second = 5)
            val olderBoard = event(0, 1, observed)
            val repository = object : FootballRepository {
                override suspend fun read(eventId: String?) = FootballSnapshot(listOf(current))
                override suspend fun readLiveBoard() = FootballSnapshot(listOf(olderBoard))
                override suspend fun readOdds(eventIds: List<String>) = FootballOddsBatch(
                    mapOf(
                        current.match.eventId to FootballOddsQuote(
                            current.match.eventId, "open",
                            markets = listOf(
                                FootballMarketDto(
                                    "1x2", "", "open",
                                    listOf(
                                        FootballOutcomeDto("home", 1.04),
                                        FootballOutcomeDto("draw", 13.0),
                                        FootballOutcomeDto("away", 151.0),
                                    ),
                                    bookmakerId = "1xbet",
                                    externalPeriodId = "fulltime",
                                    externalMarketId = "101",
                                    updatedAt = later,
                                ).checkedAt(Instant.parse(later).toEpochMilli(), 1_000),
                            ),
                        ),
                    ),
                )
                override suspend fun place(request: SportsBetRequest) = SportsBetResult.Rejected("SPORTS_BET_DISABLED")
            }
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("native-read")
            vm.refreshFeed()
            runCurrent()
            vm.visibleMatches("test", listOf(current.match.eventId))
            advanceTimeBy(250)
            runCurrent()
            vm.refreshLiveBoard()
            runCurrent()
            assertEquals("1 : 1", vm.live().single().score)
            vm.loadEvent(current.match.eventId)
            runCurrent()
            assertEquals("1 : 1", vm.matchById(current.match.eventId)?.score)
            assertEquals(vm.live().single().score, vm.matchById(current.match.eventId)?.score)
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun rateLimitedBoardPreservesScoreAndMarksItStale() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val live = event(0, 1)
            val repository = object : FootballRepository {
                override suspend fun read(eventId: String?) = FootballSnapshot(listOf(live))
                override suspend fun readLiveBoard() = FootballSnapshot(notice = "RATE_LIMITED", retryable = true)
                override suspend fun readOdds(eventIds: List<String>) = FootballOddsBatch()
                override suspend fun place(request: SportsBetRequest) = SportsBetResult.Rejected("SPORTS_BET_DISABLED")
            }
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("native-read")
            vm.refreshFeed()
            runCurrent()
            vm.refreshLiveBoard()
            runCurrent()
            assertEquals("0 : 1", vm.live().single().score)
            assertTrue(vm.live().single().boardStale)
            assertNotEquals("Коэффициенты устарели", vm.live().single().priceNote)
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
