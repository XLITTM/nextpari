package com.nextpari.app.feature.sportsbook

import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.feature.home.MatchCardModel
import java.time.Instant
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.resetMain
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

class OddsPapiAndroidTest {
    private val fixture="oddspapi-v5:id1000000872478708"
    private val at="2026-11-21T02:00:00Z"
    private val epoch=Instant.parse(at).toEpochMilli()
    private fun group(line:String="2.5",id:String="1010",period:String="fulltime",book:String="1xbet",name:String="Тотал · $line") = OddsPapiGroupDto(
        id="$fixture:market:$id",name=name,marketFamily="totals",bookmakerId=book,externalPeriodId=period,externalMarketId=id,
        outcomes=listOf(OddsPapiOutcomeDto("ТБ",JsonPrimitive("1.925"),"${fixture.removePrefix("oddspapi-v5:")}:$book:$id:0",at),
            OddsPapiOutcomeDto("ТМ",JsonPrimitive("1.875"),"${fixture.removePrefix("oddspapi-v5:")}:$book:${id}1:0",at)))
    private fun event(sport:String="football",groups:List<OddsPapiGroupDto> = listOf(group())) = FootballEventDto(id=fixture,
        sport=sport,league="Observed league",country="International",home="Home",away="Away",live=true,
        provider="oddspapi-v5",priceState="open",displayGroups=groups)

    @Test fun providerIdsAndExactLinesArePreservedInsideOneFamilyTable() {
        val f=event(groups=listOf(group("10.5","1018"),group("0.5","106"),group("2.5","1010"))).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertTrue(isSportsFeedEventId(fixture)); assertTrue(f.match.readOnly)
        assertEquals(1,f.markets.size);assertEquals(listOf("0.5","2.5","10.5"),f.markets.single().rows.map{it.line})
        assertEquals(setOf("1018","106","1010"),f.markets.single().outcomes.map{it.marketId}.toSet())
        assertTrue(f.markets.single().outcomes.all{it.locked&&it.selection==null&&it.bookmakerId=="1xbet"&&it.sourceSelectionId!=null})
        assertEquals("1.925",f.markets.single().rows.first().outcomes.first().odds)
    }
    @Test fun periodsAndBookmakersNeverShareAnAccordion() {
        val f=event(groups=listOf(group(),group(period="p1"),group(book="second-source"))).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertEquals(3,f.markets.size)
        assertTrue(f.markets.all{g->g.outcomes.map{it.bookmakerId}.distinct().size==1&&g.outcomes.map{it.periodId}.distinct().size==1})
    }
    @Test fun matchingPrimaryAndDisplayViewsRetainOneResultButConflictingPricesDoNot() {
        val primary=FootballMarketDto("1x2","","open",listOf(
            FootballOutcomeDto("home",2.1,"id1000000872478708:1xbet:101:0"),
            FootballOutcomeDto("draw",3.2,"id1000000872478708:1xbet:102:0"),
            FootballOutcomeDto("away",4.3,"id1000000872478708:1xbet:103:0")),
            bookmakerId="1xbet",externalPeriodId="fulltime",externalMarketId="101",updatedAt=at)
        val display=OddsPapiGroupDto(name="Исход",marketFamily="1x2",bookmakerId="1xbet",externalPeriodId="fulltime",externalMarketId="101",
            outcomes=primary.outcomes.map { OddsPapiOutcomeDto(mapOf("home" to "П1","draw" to "X","away" to "П2").getValue(it.key),JsonPrimitive(it.price),it.sourceSelectionId,at) })
        val source=event(groups=listOf(display)).copy(markets=listOf(primary))
        val mapped=source.toFixture(epoch,1000,checkMarketAge=true)!!
        assertEquals("result",mapped.markets.single().family)
        assertEquals(listOf("2.10","3.20","4.30"),mapped.markets.single().outcomes.map { it.odds })
        assertEquals(3,mapped.match.outcomes.size)
        val conflict=display.copy(outcomes=display.outcomes.mapIndexed { i,o -> if(i==0)o.copy(odds=JsonPrimitive(99)) else o })
        assertTrue(source.copy(displayGroups=listOf(conflict)).toFixture(epoch,1000,checkMarketAge=true)!!.markets.isEmpty())
    }
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test fun prematchScheduleNeverFiltersTheLiveCompetitionPool() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val live=event(groups=emptyList()).toFixture()!!
            val line=event(groups=emptyList()).copy(id="oddspapi-v5:id1000000872478709",live=false).toFixture()!!
            val other=event("tennis",emptyList()).copy(id="oddspapi-v5:id1000000872478710",live=false).toFixture()!!
            val esports=event("esports",emptyList()).copy(id="oddspapi-v5:id1000000872478711",live=false).toFixture()!!
            val snapshot=FootballSnapshot(listOf(live,line,other,esports),schedule=listOf(line.match.eventId,esports.match.eventId))
            val repo=object:FootballRepository {
                override suspend fun read(eventId:String?)=snapshot
                override suspend fun readOdds(eventIds:List<String>)=FootballOddsBatch()
                override suspend fun place(request:SportsBetRequest)=SportsBetResult.Rejected("SPORTS_BET_DISABLED")
            }
            val vm=SportsbookViewModel(com.nextpari.app.feature.home.FakeHomeCatalogRepository(),repo,now={testScheduler.currentTime})
            try {
                vm.setPlayer("native-read");vm.refreshFeed();runCurrent()
                assertEquals(listOf(live.match.eventId),vm.pool("live").map { it.eventId })
                assertEquals(1,vm.championships("football","live").sumOf { it.count })
                assertEquals(listOf(line.match.eventId,esports.match.eventId),vm.pool("line").map { it.eventId })
            } finally { vm.setPlayer(null);runCurrent() }
        } finally { Dispatchers.resetMain() }
    }
    @Test fun allSevenSportsHaveSpecificPeriodNamesAndNoFootballOnlyTabs() {
        val words=mapOf("football" to "тайм","basketball" to "четверть","tennis" to "сет","hockey" to "период","volleyball" to "сет","table-tennis" to "партия","esports" to "карта")
        for((sport,word)in words) {
            assertTrue(SportMarketStructure.periodLabel(sport,"p1")!!.contains(word))
            val f=event(sport,listOf(group(period="p1",name="1-й период · Победитель").copy(marketFamily="main"))).toFixture(epoch,1_000,checkMarketAge=true)!!
            assertEquals(1,f.markets.size)
            val tabs=MarketTabs.available(sport,f.markets).map{it.id}
            if(sport!="football")assertFalse(tabs.any{it in setOf("corners","cards","1st-half","2nd-half")})
        }
    }
    @Test fun staleSuspendedAndCrossEventPricesAreClosedWithoutLosingIdentity() {
        val stale=event(groups=listOf(group().copy(outcomes=group().outcomes.map{it.copy(updatedAt="2026-11-20T00:00:00Z")}))).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertTrue(stale.markets.flatMap{it.outcomes}.all{it.odds==null&&it.sourceSelectionId!=null})
        val suspended=event().copy(priceState="suspended").toFixture(epoch,1_000,checkMarketAge=true)!!
        assertTrue(suspended.markets.flatMap{it.outcomes}.all{it.odds==null})
        val wrong=event(groups=listOf(group().copy(outcomes=group().outcomes.map{it.copy(sourceSelectionId="id1000099999999999:1xbet:1010:0")}))).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertTrue(wrong.markets.flatMap{it.outcomes}.all{it.odds==null})
    }
    @Test fun contradictorySourceLinesAreNotDisplayedTwice() {
        val original=group();val conflict=original.copy(outcomes=original.outcomes.map{it.copy(odds=JsonPrimitive(9.0))})
        assertTrue(event(groups=listOf(original,conflict)).toFixture(epoch,1_000,checkMarketAge=true)!!.markets.isEmpty())
    }
    @Test fun missingOrEmptyRefreshKeepsMarketIdentityAndClosesEveryCachedPrice() {
        val observed=event(groups=listOf(group(),group("3.5","1012"))).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertTrue(observed.markets.flatMap { it.outcomes }.any { it.odds!=null })
        val variants=listOf(
            observed.withQuote(null,FootballPriceState.RateLimited,2,9_000),
            observed.withQuote(FootballOddsQuote(fixture,"suspended"),FootballPriceState.Upstream,3,9_000),
            observed.withQuote(FootballOddsQuote(fixture,"open"),FootballPriceState.Upstream,4,9_000),
        )
        for(closed in variants) {
            assertEquals(observed.markets.map { it.key },closed.markets.map { it.key })
            assertEquals(observed.markets.flatMap { it.outcomes }.map { it.sourceSelectionId },closed.markets.flatMap { it.outcomes }.map { it.sourceSelectionId })
            assertEquals(listOf("2.5","3.5"),closed.markets.single().rows.map { it.line })
            assertTrue(closed.markets.flatMap { it.outcomes }.all { it.odds==null && it.locked && it.selection==null })
            assertTrue(closed.markets.flatMap { it.rows }.flatMap { it.outcomes }.all { it.odds==null })
            assertEquals(0L,closed.validUntil)
            assertFalse(closed.priceState==FootballPriceState.Open)
        }
        val refreshed=variants.first().withQuote(FootballOddsQuote(fixture,"open",displayGroups=listOf(group().checkedAt(epoch,5_000))),FootballPriceState.Upstream,5,20_000)
        assertTrue(refreshed.markets.flatMap { it.outcomes }.any { it.odds!=null })
        assertTrue(refreshed.markets.flatMap { it.outcomes }.all { it.selection==null && it.locked })
    }
    @Test fun hockeyRegulationAndOvertimeStaySeparateAndUnknownMarketsRemainOther() {
        val regulation=group(period="fulltime",name="1X2").copy(marketFamily="main")
        val overtime=group(period="result",name="Победитель").copy(marketFamily="main")
        val f=event("hockey",listOf(regulation,overtime)).toFixture(epoch,1_000,checkMarketAge=true)!!
        assertEquals(2,f.markets.size);assertTrue(f.markets.any{it.name.contains("ОТ")});assertTrue(f.markets.any{it.name.contains("основное время")})
        val unknown=SportMarketStructure.describe("tennis",group(name="Unmapped statistic").copy(marketFamily="unknown"))
        assertEquals("other",unknown.category)
    }
    @Test fun exactCompetitionIdsControlRankingAndFavoritesAcrossEqualNames() {
        val base=MatchCardModel(id="1",sport="football",league="Premier League",country="England",team1="A",team2="B")
        val ranked=base.copy(id="3",eventId="3",competitionId="football:eng:premier-league")
        val other=base.copy(id="2",eventId="2",sport="basketball")
        val groups=CountryGrouping.groupByCountry(listOf(base,ranked,other,ranked))
        assertEquals(1,CompetitionOrder.top(groups).size)
        assertEquals(3,groups.sumOf{it.count})
        assertNotEquals(CompetitionOrder.leagueKey(base),CompetitionOrder.leagueKey(other))
        assertEquals(listOf(ranked),LeagueMatches.filter(listOf(base,ranked,other),CompetitionOrder.leagueKey(ranked)))
        assertTrue(CompetitionOrder.top(CountryGrouping.groupByCountry(listOf(base))).isEmpty())
    }
    @Test fun productionCaptureDecodesAllActuallyObservedSportsWithoutDroppingV5Ids() {
        val capture=System.getenv("NEXTPARI_CAPTURE_FILE")
        assumeTrue(!capture.isNullOrBlank())
        val payload=java.io.File(capture!!).readText()
        val feed=NetworkModule.json.decodeFromJsonElement<FootballFeedDto>(NetworkModule.json.parseToJsonElement(payload))
        val snapshot=feed.toSnapshot(null)
        assertEquals(feed.events.size,snapshot.fixtures.size)
        assertTrue(snapshot.fixtures.all{oddsPapiEventId.matches(it.match.eventId)&&it.match.readOnly})
        assertTrue(snapshot.fixtures.map{it.match.sport}.toSet().containsAll(setOf("football","tennis","basketball","hockey","volleyball","table-tennis")))
    }
    @Test fun repositorySendsOpaqueV5IdsAndNeverPostsTheirBetSelections() = runBlocking {
        val server=MockWebServer();server.start()
        try {
            val api=NetworkModule.playerApi(NetworkModule.okHttpClient(),server.url("/").toString())
            val repo=RemoteFootballRepository(api,NetworkModule.json)
            server.enqueue(MockResponse().setBody("""{"ok":true,"quotes":[{"id":"$fixture","priceState":"suspended"}]}"""))
            val batch=repo.readOdds(listOf(fixture,"not-an-event"))
            assertEquals(FootballPriceState.Suspended,batch.quotes[fixture]?.availability)
            assertEquals(fixture,server.takeRequest().requestUrl?.queryParameter("oddsFor"))
            val pick=SportsBetSelection(fixture,"inplay","101","1x2","","101",2.0,"A — B","League","П1",provider="oddspapi-v5")
            assertEquals(SportsBetResult.Rejected("SPORTS_BET_DISABLED"),repo.place(SportsBetRequest(1.0,"single","blocked",listOf(pick))))
            assertEquals(1,server.requestCount)
        } finally {server.shutdown()}
    }
    @Test fun canonicalWireTypesKeepDifferentSportUnitsAndMapStatisticsSeparate() {
        fun family(sport:String,type:String)=SportMarketStructure.describe(sport,group(name="Тотал").copy(marketFamily=type)).family
        assertEquals("total-sets",family("tennis","totals"))
        assertEquals("total-sets",family("volleyball","totals"))
        assertEquals("total-maps",family("esports","totals"))
        assertEquals("totals-kills",family("esports","totals-kills"))
        assertEquals("totals-rounds",family("esports","totals-rounds"))
        assertEquals("totals-points",family("table-tennis","totals-points"))
        assertEquals("2-я половина с ОТ",SportMarketStructure.periodLabel("basketball","p3+p4+overtime"))
    }
    @Test fun unlabelledPlayerPropsNeverExposeAnUnattributedPrice() {
        val props=group(name="Автор гола").copy(marketFamily="players-anytimegoalscorer",
            outcomes=group().outcomes.map { it.copy(sourceSelectionId=it.sourceSelectionId!!.dropLast(1)+"12345") })
        val unavailable=event(groups=listOf(props)).toFixture(epoch,1000,checkMarketAge=true)!!
        assertTrue(unavailable.markets.flatMap { it.outcomes }.all { it.odds==null && it.sourceSelectionId!=null })
        val named=event(groups=listOf(props.copy(outcomes=props.outcomes.map { it.copy(playerName="Verified player") }))).toFixture(epoch,1000,checkMarketAge=true)!!
        assertTrue(named.markets.flatMap { it.outcomes }.all { it.odds!=null && it.label.startsWith("Verified player") && it.locked })
    }
    @Test fun actualProductionReadUsesTheExistingEndpoint() = runBlocking {
        assumeTrue(System.getenv("NEXTPARI_LIVE_SPORTS_CHECK")=="1")
        val builder=NetworkModule.okHttpClient().newBuilder()
        System.getenv("HTTPS_PROXY")?.let { raw -> val uri=java.net.URI(raw);builder.proxy(java.net.Proxy(java.net.Proxy.Type.HTTP,java.net.InetSocketAddress(uri.host,if(uri.port>0)uri.port else 80))) }
        val repo=RemoteFootballRepository(NetworkModule.playerApi(builder.build(),"https://nextpari.net/"),NetworkModule.json)
        val snapshot=repo.read()
        assertTrue("No real events received: ${snapshot.notice}",snapshot.fixtures.isNotEmpty())
        assertTrue(snapshot.fixtures.all{oddsPapiEventId.matches(it.match.eventId)})
        assertTrue(snapshot.fixtures.flatMap{it.markets}.flatMap{it.outcomes}.all{it.selection==null&&it.locked})
        println("REAL_PRODUCTION_EVENTS=${snapshot.fixtures.size};SPORTS=${snapshot.fixtures.map{it.match.sport}.toSet()}")
    }
}
