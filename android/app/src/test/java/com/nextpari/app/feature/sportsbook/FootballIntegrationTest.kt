package com.nextpari.app.feature.sportsbook

import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.session.InMemoryCookiePersistence
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cookie
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FootballIntegrationTest {
    private val json = NetworkModule.json
    private val live = FootballEventDto(
        id = "100", league = "Test league", country = "GB", home = "A", away = "B", live = true,
        score = FootballScoreDto(0, 1),
        markets = listOf(
            FootballMarketDto("1x2", "", "open", listOf(FootballOutcomeDto("away", 3.1),
                FootballOutcomeDto("draw", 3.3), FootballOutcomeDto("home", 2.01))),
            FootballMarketDto("over_under", "2.25", "open", listOf(FootballOutcomeDto("over", 1.95),
                FootballOutcomeDto("under", 1.9))),
            FootballMarketDto("over_under", "2.5", "suspended"),
            FootballMarketDto("asian_handicap", "-0.5,0", "open", listOf(FootballOutcomeDto("home", 2.0),
                FootballOutcomeDto("away", 1.9))),
        ),
    )

    @Test
    fun fixtureMappingPreservesScoreLinesAndExactOutcomes() {
        val fixture = live.toFixture()!!
        assertEquals("0 : 1", fixture.match.score)
        assertEquals(listOf("2.01", "3.30", "3.10"), fixture.match.outcomes.map { it.odds })
        val totals = fixture.markets.single { it.marketId == "1_3" }
        assertEquals(2, totals.lineCount)
        assertEquals(listOf("2.25", "2.25", "2.5", "2.5"), totals.outcomes.map { it.line })
        assertTrue(totals.outcomes.takeLast(2).all { it.locked && it.odds == null })
        val handicap = fixture.markets.single { it.marketId == "1_2" }
        assertEquals(listOf("-0.5,0", "-0.5,0"), handicap.outcomes.map { it.line })
        assertEquals(listOf("home", "away"), handicap.outcomes.map { it.outcomeId })
        assertTrue(handicap.outcomes.all { it.locked && it.odds == null && it.selection == null })
        assertEquals("inplay", fixture.match.outcomes.first().selection?.feedType)
        assertEquals("prematch", live.copy(live = false).toFixture()!!.match.outcomes.first().selection?.feedType)
    }

    @Test
    fun missingAndAmbiguousPricesAreNeverFilled() {
        val main = live.markets.first()
        val broken = live.copy(markets = listOf(main.copy(outcomes = listOf(
            FootballOutcomeDto("home", 1.8), FootballOutcomeDto("home", 1.9), FootballOutcomeDto("draw", 1.0),
        ))))
        assertTrue(broken.toFixture()!!.match.outcomes.all { it.locked })
        assertTrue(live.copy(markets = listOf(main, main)).toFixture()!!.match.outcomes.all { it.locked })
        assertTrue(live.copy(markets = emptyList()).toFixture()!!.match.outcomes.all { it.locked })
    }

    @Test
    fun staleAndPartialEnvelopesLockAllOddsAndKeepRealScores() {
        val stale = FootballFeedDto(ok = true, stale = true, events = listOf(live)).toSnapshot(null)
        assertEquals("0 : 1", stale.fixtures.single().match.score)
        assertTrue(stale.fixtures.single().markets.flatMap { it.outcomes }.all { it.locked && it.selection == null })
        val partial = FootballFeedDto(ok = true, error = "UPSTREAM", events = listOf(live)).toSnapshot(null)
        assertNotNull(partial.notice)
        assertTrue(partial.fixtures.single().match.outcomes.all { it.locked })
        assertTrue(FootballFeedDto(ok = true, events = listOf(live)).toSnapshot("200").fixtures.isEmpty())
    }

    @Test
    fun authenticatedReadsUseExistingEndpointAndExactEventQuery() = runBlocking {
        MockWebServer().use { server ->
            val url = server.url("/")
            val jar = SecureCookieJar(InMemoryCookiePersistence())
            jar.saveFromResponse(url, listOf(Cookie.Builder().hostOnlyDomain(url.host).path("/")
                .name("test-player-session").value("test-value").build()))
            val api = NetworkModule.playerApi(NetworkModule.okHttpClient(jar), url.toString())
            val repository = RemoteFootballRepository(api, json)
            val fixture = """{"id":"100","home":"A","away":"B","live":true,"markets":[]}"""
            server.enqueue(jsonResponse("""{"ok":true,"stale":false,"events":[$fixture]}"""))
            assertTrue(repository.read().fixtures.single().match.isLive)
            val list = server.takeRequest()
            assertEquals("/api/player/sports/football-feed", list.path)
            assertEquals("test-player-session=test-value", list.getHeader("Cookie"))
            server.enqueue(jsonResponse("""{"ok":true,"events":[$fixture]}"""))
            assertEquals("100", repository.read("100").fixtures.single().match.id)
            assertEquals("/api/player/sports/football-feed?eventId=100", server.takeRequest().path)
            assertTrue(repository.read("malformed").fixtures.isEmpty())
            assertEquals(2, server.requestCount)
        }
    }

    @Test
    fun placementSerializesExactProviderIdentityAndTrustsOnlyServerReceipts() = runBlocking {
        MockWebServer().use { server ->
            var cleared = 0
            val api = NetworkModule.playerApi(NetworkModule.okHttpClient(unauthorizedHandler = { cleared++ }), server.url("/").toString())
            val repository = RemoteFootballRepository(api, json)
            val handicap = live.markets.last().copy(line = "0", bookmakerId = "16", externalMarketId = "1_2")
            val pick = live.copy(markets = listOf(handicap)).toFixture()!!.markets.single().outcomes.first().selection!!
            val request = sportsBetRequest("2,50", listOf(pick), "test-idempotency")!!
            server.enqueue(jsonResponse("""{"ok":false,"error":"SPORTSBOOK_ACCOUNT_NOT_AUTHORIZED"}""", 403))
            assertEquals(SportsBetResult.Rejected("SPORTSBOOK_ACCOUNT_NOT_AUTHORIZED"), repository.place(request))
            assertEquals(0, cleared)
            val call = server.takeRequest()
            assertEquals("POST", call.method)
            assertEquals("/api/player/sports/place", call.path)
            val body = json.parseToJsonElement(call.body.readUtf8()).jsonObject
            assertEquals("test-idempotency", body["idempotencyKey"]!!.jsonPrimitive.content)
            assertEquals(JsonPrimitive(2.5), body["stake"])
            val leg = body["selections"]!!.jsonArray.single().jsonObject
            assertEquals(JsonPrimitive("betsapi"), leg["provider"])
            assertEquals(JsonPrimitive("1_2"), leg["marketId"])
            assertEquals(JsonPrimitive("0"), leg["line"])
            assertEquals(JsonPrimitive("16"), leg["bookmakerId"])
            assertEquals(JsonPrimitive("home"), leg["outcomeId"])
            server.enqueue(jsonResponse("""{"ok":true}"""))
            assertEquals(SportsBetResult.Unconfirmed, repository.place(request))
            server.enqueue(jsonResponse("""{"ok":true,"betId":"real-server-receipt"}"""))
            assertEquals(SportsBetResult.Accepted("real-server-receipt"), repository.place(request))
            server.enqueue(jsonResponse("""{"ok":false,"error":"JWT_REQUIRED"}""", 401))
            assertEquals(SportsBetResult.Rejected("JWT_REQUIRED"), repository.place(request))
            assertEquals(1, cleared)
        }
    }

    @Test
    fun refreshFailureLocksLastRealDataAndAnotherPlayerStartsEmpty() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordingFootballRepository(FootballSnapshot(listOf(live.toFixture()!!)))
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            assertTrue(vm.state.value.loading)
            runCurrent()
            assertEquals(listOf("100"), vm.live().map { it.id })
            vm.loadEvent("100")
            runCurrent()
            assertEquals(3, vm.marketsFor("100").size)
            repository.readFailure = true
            vm.refreshFeed()
            vm.loadEvent("100")
            runCurrent()
            assertNotNull(vm.state.value.feed.notice)
            assertTrue(vm.live().single().outcomes.all { it.locked })
            assertTrue(vm.marketsFor("100").flatMap { it.outcomes }.all { it.locked })
            vm.setPlayer("player-two")
            assertTrue(vm.live().isEmpty())
            assertTrue(vm.marketsFor("100").isEmpty())
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun unknownSubmissionRetriesSameRequestAndOnlyAcceptanceClearsCoupon() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fixture = live.toFixture()!!
            val repository = RecordingFootballRepository(FootballSnapshot(listOf(fixture)))
            var accepted = 0
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, { accepted++ }, now = { testScheduler.currentTime })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            runCurrent()
            vm.toggle(fixture.match.outcomes.first().selection!!)
            vm.setStake("1")
            vm.submit("wallet-one")
            vm.submit("wallet-one")
            runCurrent()
            assertTrue(vm.state.value.retryRequired)
            assertEquals(0, accepted)
            vm.submit("wallet-two")
            runCurrent()
            assertEquals(1, repository.requests.size)
            repository.result = SportsBetResult.Accepted("receipt")
            vm.submit("wallet-one")
            runCurrent()
            assertEquals(repository.requests[0], repository.requests[1])
            assertEquals(1, accepted)
            assertEquals("receipt", vm.state.value.acceptedBetId)
            assertTrue(vm.state.value.selections.isEmpty())
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun couponUsesSingleOrExpressAndReplacesPicksFromSameFixture() {
        val picks = live.toFixture()!!.match.outcomes.map { it.selection!! }
        assertEquals(listOf(picks[1]), toggleSportsSelection(listOf(picks[0]), picks[1]))
        assertTrue(toggleSportsSelection(listOf(picks[0]), picks[0]).isEmpty())
        assertEquals("single", sportsBetRequest("2", listOf(picks[0]), "key")?.mode)
        assertEquals("express", sportsBetRequest("2", listOf(picks[0], picks[1].copy(fixtureId = "200")), "key")?.mode)
        assertNull(sportsBetRequest("2", picks, "key"))
        assertNull(sportsBetRequest("NaN", listOf(picks[0]), "key"))
    }

    @Test
    fun oddsForUsesSameEndpointWithEightUniqueExactProviderIds() = runBlocking {
        MockWebServer().use { server ->
            val api = NetworkModule.playerApi(NetworkModule.okHttpClient(), server.url("/").toString())
            val repository = RemoteFootballRepository(api, json)
            server.enqueue(jsonResponse("""{"ok":true,"quotes":[
                {"id":"001","priceState":"open","markets":[]},
                {"id":"2","priceState":"deferred","markets":[]},
                {"id":"3","priceState":"open","markets":[]},
                {"id":"3","priceState":"suspended","markets":[]},
                {"id":"999","priceState":"open","markets":[]}
            ]}"""))
            val batch = repository.readOdds(listOf("001", "001", "bad", "2", "3", "4", "5", "6", "7", "8", "9"))
            val request = server.takeRequest()
            assertEquals("/api/player/sports/football-feed", request.requestUrl?.encodedPath)
            assertEquals("001,2,3,4,5,6,7,8", request.requestUrl?.queryParameter("oddsFor"))
            assertEquals(setOf("001", "2"), batch.quotes.keys)
            assertEquals(FootballPriceState.Deferred, batch.quotes["2"]?.availability)
            server.enqueue(jsonResponse("{}", 429))
            assertEquals(FootballPriceState.RateLimited, repository.readOdds(listOf("2")).fallback)
        }
    }

    @Test
    fun delayedBatchUsesItsOwnReadTimeout() = runBlocking {
        MockWebServer().use { server ->
            val client = NetworkModule.okHttpClient().newBuilder().readTimeout(100, TimeUnit.MILLISECONDS).build()
            val repository = RemoteFootballRepository(NetworkModule.playerApi(client, server.url("/").toString()), json)
            server.enqueue(jsonResponse("""{"ok":true,"quotes":[{"id":"100","priceState":"open"}]}""")
                .setBodyDelay(400, TimeUnit.MILLISECONDS))
            assertEquals(FootballPriceState.Open, repository.readOdds(listOf("100")).quotes["100"]?.availability)
            server.enqueue(jsonResponse("""{"ok":true,"events":[]}""").setBodyDelay(400, TimeUnit.MILLISECONDS))
            try {
                repository.read()
                fail("The normal football list must keep the shared read timeout")
            } catch (_: java.net.SocketTimeoutException) {
                // Only the oddsFor call has the longer timeout.
            }
        }
    }

    @Test
    fun quoteGroupsAndCouponKeepExactBookmakerPeriodAndSelectionIdentity() {
        val market = live.markets.first()
        val row = market.copy(bookmakerId = "16", externalPeriodId = "end", externalMarketId = "1_1",
            updatedAt = "2026-11-12T10:00:00Z",
            outcomes = market.outcomes.map { it.copy(sourceSelectionId = "source-${it.key}") })
        val second = row.copy(bookmakerId = "17")
        val third = row.copy(externalPeriodId = "start")
        val fixture = live.copy(markets = emptyList()).toFixture()!!.withQuote(
            FootballOddsQuote("100", "open", markets = listOf(row, second, third)),
            FootballPriceState.Unavailable, 1, 500,
        )
        val home = fixture.markets.map { it.outcomes.first().selection!! }
        assertEquals(3, home.map { it.identity }.toSet().size)
        assertEquals("16", home[0].bookmakerId)
        assertEquals("end", home[0].externalPeriodId)
        assertEquals("1_1", home[0].externalMarketId)
        assertEquals("source-home", home[0].sourceSelectionId)
        assertEquals("2026-11-12T10:00:00Z", home[0].updatedAt)
        assertEquals(home[0], fixture.match.outcomes.first().selection)
        val stale = fixture.withQuote(FootballOddsQuote("100", "open", stale = true, markets = listOf(row)),
            FootballPriceState.Unavailable, 2, 500)
        assertEquals(FootballPriceState.Stale, stale.priceState)
        assertTrue(stale.markets.flatMap { it.outcomes }.all { it.odds == null && it.locked })
    }

    @Test
    fun visibleLivePricesPrecedePrematchAndOpeningKnownEventReusesDetailedMarkets() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fixtures = (100..110).map { id -> live.copy(id = id.toString(), live = id % 2 == 0, markets = emptyList()).toFixture()!! }
            val repository = RecordingFootballRepository(FootballSnapshot(fixtures))
            repository.odds = { ids -> FootballOddsBatch(ids.associateWith { FootballOddsQuote(it, "open", markets = live.markets) }) }
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            runCurrent()
            vm.visibleMatches("test", listOf("107", "106", "103", "110", "104", "102", "101", "108", "105"))
            advanceTimeBy(250)
            runCurrent()
            assertEquals(listOf("106", "110", "104", "102", "108", "107", "103", "101"), repository.batches.single())
            assertNotNull(vm.live().first { it.id == "106" }.outcomes.first().selection)
            assertEquals("prematch", vm.line().first { it.id == "107" }.outcomes.first().selection?.feedType)
            vm.loadEvent("106")
            runCurrent()
            assertEquals(setOf("1_1", "1_2", "1_3"), vm.marketsFor("106").map { it.marketId }.toSet())
            assertEquals(listOf<String?>(null), repository.reads)
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun delayedBatchCannotPriceAnotherPhaseOrReplacementAccount() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val prematch = live.copy(live = false, markets = emptyList()).toFixture()!!
            val inPlay = live.copy(markets = emptyList()).toFixture()!!
            val repository = RecordingFootballRepository(FootballSnapshot(listOf(prematch)))
            lateinit var response: Continuation<FootballOddsBatch>
            repository.odds = { suspendCoroutine { response = it } }
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            advanceTimeBy(250)
            runCurrent()
            repository.snapshot = FootballSnapshot(listOf(inPlay))
            vm.refreshFeed()
            runCurrent()
            response.resume(FootballOddsBatch(mapOf("100" to FootballOddsQuote("100", "open", markets = live.markets))))
            runCurrent()
            assertTrue(vm.live().single().outcomes.all { it.locked })
            vm.visibleMatches("test", listOf("100"))
            advanceTimeBy(FOOTBALL_ODDS_GAP_MS)
            runCurrent()
            assertEquals(2, repository.batches.size)
            vm.setPlayer("player-two")
            vm.refreshFeed()
            runCurrent()
            response.resume(FootballOddsBatch(mapOf("100" to FootballOddsQuote("100", "open", markets = live.markets))))
            runCurrent()
            assertTrue(vm.live().single().outcomes.all { it.locked })
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun rateLimitPausesRequestsAndExpiredPricesCannotBeSubmitted() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fixture = live.copy(markets = emptyList()).toFixture()!!
            val repository = RecordingFootballRepository(FootballSnapshot(listOf(fixture)))
            repository.odds = { FootballOddsBatch(mapOf("100" to FootballOddsQuote("100", "open", markets = live.markets))) }
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, now = { testScheduler.currentTime })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            advanceTimeBy(250)
            runCurrent()
            vm.toggle(vm.live().single().outcomes.first().selection!!)
            vm.setStake("1")
            vm.visibleMatches("test", listOf("100"))
            repository.odds = { FootballOddsBatch(fallback = FootballPriceState.RateLimited) }
            advanceTimeBy(FOOTBALL_QUOTE_MAX_AGE_MS)
            runCurrent()
            assertEquals(2, repository.batches.size)
            assertEquals(FootballPriceState.RateLimited, vm.state.value.feed.fixtures.single().priceState)
            assertFalse(vm.state.value.picksCurrent)
            vm.submit("wallet")
            assertTrue(repository.requests.isEmpty())
            advanceTimeBy(FOOTBALL_ODDS_BACKOFF_MS - 1)
            runCurrent()
            assertEquals(2, repository.batches.size)
            vm.setPlayer(null)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private class RecordingFootballRepository(var snapshot: FootballSnapshot) : FootballRepository {
        var readFailure = false
        var result: SportsBetResult = SportsBetResult.Unconfirmed
        val requests = mutableListOf<SportsBetRequest>()
        val reads = mutableListOf<String?>()
        val batches = mutableListOf<List<String>>()
        var odds: suspend (List<String>) -> FootballOddsBatch = { FootballOddsBatch() }
        override suspend fun read(eventId: String?): FootballSnapshot {
            reads += eventId
            if (readFailure) throw IOException()
            return snapshot
        }
        override suspend fun readOdds(eventIds: List<String>): FootballOddsBatch {
            batches += eventIds
            return odds(eventIds)
        }
        override suspend fun place(request: SportsBetRequest): SportsBetResult {
            requests += request
            return result
        }
    }

    private fun jsonResponse(body: String, status: Int = 200): MockResponse =
        MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body)
}
