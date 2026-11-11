package com.nextpari.app.feature.sportsbook

import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.session.InMemoryCookiePersistence
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
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
        val handicap = fixture.markets.single { it.marketId == "1_2" }.outcomes.first().selection!!
        assertEquals("-0.5,0", handicap.line)
        assertEquals("home", handicap.outcomeId)
        assertEquals("inplay", handicap.feedType)
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
            val pick = live.toFixture()!!.markets.last().outcomes.first().selection!!
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
            assertEquals(JsonPrimitive("-0.5,0"), leg["line"])
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
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository)
            vm.setPlayer("player-one")
            vm.refreshFeed()
            assertTrue(vm.state.value.loading)
            advanceUntilIdle()
            assertEquals(listOf("100"), vm.live().map { it.id })
            vm.loadEvent("100")
            advanceUntilIdle()
            assertEquals(3, vm.marketsFor("100").size)
            repository.readFailure = true
            vm.refreshFeed()
            vm.loadEvent("100")
            advanceUntilIdle()
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
            val vm = SportsbookViewModel(FakeHomeCatalogRepository(), repository, { accepted++ })
            vm.setPlayer("player-one")
            vm.refreshFeed()
            advanceUntilIdle()
            vm.toggle(fixture.match.outcomes.first().selection!!)
            vm.setStake("1")
            vm.submit("wallet-one")
            vm.submit("wallet-one")
            advanceUntilIdle()
            assertTrue(vm.state.value.retryRequired)
            assertEquals(0, accepted)
            vm.submit("wallet-two")
            advanceUntilIdle()
            assertEquals(1, repository.requests.size)
            repository.result = SportsBetResult.Accepted("receipt")
            vm.submit("wallet-one")
            advanceUntilIdle()
            assertEquals(repository.requests[0], repository.requests[1])
            assertEquals(1, accepted)
            assertEquals("receipt", vm.state.value.acceptedBetId)
            assertTrue(vm.state.value.selections.isEmpty())
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

    private class RecordingFootballRepository(private val snapshot: FootballSnapshot) : FootballRepository {
        var readFailure = false
        var result: SportsBetResult = SportsBetResult.Unconfirmed
        val requests = mutableListOf<SportsBetRequest>()
        override suspend fun read(eventId: String?): FootballSnapshot {
            if (readFailure) throw IOException()
            return snapshot
        }
        override suspend fun place(request: SportsBetRequest): SportsBetResult {
            requests += request
            return result
        }
    }

    private fun jsonResponse(body: String, status: Int = 200): MockResponse =
        MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body)
}
