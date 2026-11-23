package com.nextpari.app.feature.sportsbook

import androidx.compose.ui.unit.dp
import com.nextpari.app.R
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.feature.favorites.SportsFavoritesStore
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.HomePromoLayout
import com.nextpari.app.feature.home.carouselCardWidth
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SportsPresentationTest {
    private val nations = MatchCardModel(
        "100", sport = "football", league = "UEFA Nations League", country = "EU",
        team1 = "Türkiye", team2 = "Belgium", isLive = true,
    )

    @Test
    fun serverOrderIsPreservedAndLegacyFeedIsPrioritized() {
        val reserve = nations.copy(id = "101", eventId = "101", league = "Argentina Nacional Reserve League", country = "AR")
        val low = nations.copy(id = "102", eventId = "102", league = "2. Bundesliga", country = "DE")
        val youth = nations.copy(id = "103", eventId = "103", league = "UEFA Nations League U17")
        val virtual = nations.copy(id = "104", eventId = "104", league = "Esoccer GT Leagues – 12 mins play")
        val basketball = nations.copy(id = "105", eventId = "105", league = "NBA", sport = "basketball")
        val verified = listOf(basketball, nations, youth, reserve, low)
        assertEquals(verified, FeaturedSports.ordered(verified))
        assertEquals(listOf(nations, basketball, low, reserve, youth, virtual),
            FeaturedSports.ordered(listOf(virtual, low, reserve, nations, youth, basketball)))
        assertEquals("EU", HomeChampionships.groups(listOf(virtual, reserve, nations), true).first().country)
        assertTrue(FeaturedSports.isEsports(virtual))
        assertFalse(FeaturedSports.isEsports(nations))
        assertEquals(1, FeaturedSports.tier(nations.copy(league = "Premier League", country = "AR")))
        assertEquals(1, FeaturedSports.tier(youth.copy(serverTier = 1)))
        assertTrue(FeaturedSports.isEsports(nations.copy(serverTier = 5)))
    }

    @Test
    fun missingOddsDoNotDemoteMajorPrematchAndLegacyTiesFollowKickoff() {
        val early = nations.copy(id = "1", eventId = "1", isLive = false, kickoffEpochMs = 1L, outcomes = emptyList())
        val late = early.copy(id = "2", eventId = "2", kickoffEpochMs = 2L)
        val other = early.copy(id = "3", eventId = "3", league = "Regional Cup")
        assertEquals(listOf(early, late, other), FeaturedSports.ordered(listOf(other, late, early)))
    }

    @Test
    fun featuredSectionsRankRealMajorEventsAndLimitLineToTheNextDay() {
        val now = 1_000_000L
        val nextDay = now + 86_400_000
        val youth = nations.copy(id = "200", eventId = "200", league = "U-20 World Cup", serverTier = 2)
        val nba = nations.copy(id = "201", eventId = "201", sport = "basketball", league = "NBA", serverTier = 0)
        val friendly = nations.copy(id = "202", eventId = "202", league = "Club Friendlies", serverTier = 2)
        val virtual = nations.copy(id = "203", eventId = "203", league = "Esoccer GT Leagues", serverTier = 1)
        assertEquals(listOf(nations, youth, friendly, nba),
            FeaturedSports.popularLive(listOf(youth, nba, virtual, friendly, nations)))

        val early = friendly.copy(isLive = false, kickoffEpochMs = now + 1)
        val major = nba.copy(isLive = false, kickoffEpochMs = nextDay)
        val past = nations.copy(isLive = false, kickoffEpochMs = now)
        val later = nations.copy(isLive = false, kickoffEpochMs = nextDay + 1)
        assertEquals(listOf(later, early, major), FeaturedSports.popularLine(
            listOf(early, past, major, later, nations, virtual.copy(isLive = false, kickoffEpochMs = now + 1),
                youth.copy(isLive = false, kickoffEpochMs = null)),
            now,
        ))
        assertEquals("football", FeaturedSports.popularLine(listOf(major, later), now).first().sport)
        assertTrue(FeaturedSports.featuredSportBucket("football") < FeaturedSports.featuredSportBucket("basketball"))
        assertTrue(FeaturedSports.featuredSportBucket("basketball") < FeaturedSports.featuredSportBucket("tennis"))

        val afc = nations.copy(
            id = "oddspapi-v5:id1000046373835908",
            eventId = "oddspapi-v5:id1000046373835908",
            league = "AFC Champions League Elite",
            country = "International Clubs",
            team1 = "Al-Ittihad Club",
            team2 = "Pakhtakor",
            provider = "oddspapi-v5",
            isLive = true,
        )
        val superLig = nations.copy(
            id = "oddspapi-v5:id1000005272723326",
            eventId = "oddspapi-v5:id1000005272723326",
            league = "Super Lig",
            country = "Turkey",
            team1 = "Istanbul Basaksehir",
            team2 = "Corum FK",
            provider = "oddspapi-v5",
            isLive = true,
        )
        val two = afc.copy(
            id = "oddspapi-v5:id1000066873835252",
            eventId = "oddspapi-v5:id1000066873835252",
            league = "AFC Champions League Two",
            team1 = "East Bengal FC",
            team2 = "Al Hussein Irbid",
        )
        val missing = afc.copy(id = "missing-afc", eventId = "missing-afc", league = "AFC Champions League Elite", isLive = false)
        assertEquals(0, FeaturedSports.tier(afc))
        assertEquals(0, FeaturedSports.tier(superLig))
        assertEquals(1, FeaturedSports.tier(two))
        val featured = FeaturedSports.selectFeatured(
            listOf(superLig, two, afc, virtual),
            live = true,
            featuredIds = listOf(superLig.eventId),
            nowMs = now,
        )
        assertEquals(listOf(afc.eventId, superLig.eventId, two.eventId), featured.map { it.eventId })
        assertEquals(emptyList<String>(), FeaturedSports.selectFeatured(listOf(missing), true, null, now).map { it.eventId })
        assertEquals(listOf(afc), FeaturedSports.popularLive(listOf(afc, virtual)))
        assertEquals("Международные", SportsRegions.name("International Clubs"))
    }

    @Test
    fun homeLiveChampionshipPreviewShowsFourOrFiveBlocksAndKeepsFullDirectory() {
        val premier = nations.copy(id = "pl", eventId = "pl", league = "Premier League", country = "England")
        val laliga = nations.copy(id = "es", eventId = "es", league = "La Liga", country = "Spain")
        val serie = nations.copy(id = "it", eventId = "it", league = "Serie A", country = "Italy")
        val bund = nations.copy(id = "de", eventId = "de", league = "Bundesliga", country = "Germany")
        val ligue = nations.copy(id = "fr", eventId = "fr", league = "Ligue 1", country = "France")
        val nba = nations.copy(id = "nba", eventId = "nba", sport = "basketball", league = "NBA", country = "USA")
        val china = nations.copy(id = "cn", eventId = "cn", league = "Super League", country = "China")
        val tt = nations.copy(id = "tt", eventId = "tt", sport = "table-tennis", league = "TT Cup", country = "International")
        val live = listOf(tt, china, nba, ligue, bund, serie, laliga, premier)
        val preview = HomeChampionships.preview(live, excludeEsports = true)
        assertEquals(HomeChampionships.PREVIEW_DEFAULT, preview.size)
        assertTrue(preview.size <= HomeChampionships.PREVIEW_MAX)
        assertFalse(preview.any { group -> group.leagues.any { it.name == "TT Cup" } })
        val full = HomeChampionships.groups(live, excludeEsports = true)
        assertTrue(full.size > preview.size)
        assertTrue(full.any { it.country == "International" || it.country == "China" })
    }

    @Test
    fun liveStatusShowsOnlyKnownPhaseAndObservedTime() {
        assertEquals("1-й тайм · 34:12", liveStatusText("first_half", "34:12"))
        assertEquals("2-й тайм · 63:38", liveStatusText("second_half", "63:38"))
        assertEquals("2-й тайм", liveStatusText("second_half", null))
        assertEquals("63:38", liveStatusText(null, "63:38"))
        assertNull(liveStatusText("LIVE", null))
        assertNull(liveStatusText(null, null))
        assertEquals("LIVE", liveCardStatus(null, null))
        assertEquals("1-й тайм · 34:12", liveCardStatus("first_half", "34:12"))
        assertEquals("2-й тайм", liveCardStatus("second_half", null))
    }

    @Test
    fun trackerHasSixPagesAndAnExplicitUnavailableStateForUnsupportedStats() {
        assertEquals(
            listOf("Счёт", "Периоды", "Статистика", "Хронология", "История", "О матче"),
            MatchTrackerPage.entries.map { it.label },
        )
        assertEquals("Статистика недоступна", MatchTrackerPage.Statistics.unavailable)
        assertEquals("История встреч недоступна", MatchTrackerPage.History.unavailable)
        val tracker = File("src/main/java/com/nextpari/app/feature/sportsbook/MatchTracker.kt").readText()
        assertTrue(tracker.contains("HorizontalPager("))
        assertTrue(tracker.contains("Трансляция недоступна"))
        assertTrue(tracker.contains("R.drawable.np_match_football_stadium"))
        val details = File("src/main/java/com/nextpari/app/feature/sportsbook/MatchDetailsScreen.kt").readText()
        assertTrue(details.contains("Destinations.BETSLIP"))
        assertTrue(details.contains("rememberSaveableStateHolder()"))
    }

    @Test
    fun flagsAreResolvedFromExactCompetitionAndCountryIdentities() {
        for ((team, flag) in mapOf("Türkiye" to "tr", "Belgium" to "be", "Italy" to "it", "France" to "fr",
            "England" to "eng", "Spain" to "es", "Armenia" to "am", "Cyprus" to "cy",
            "Czechia" to "cz", "Croatia" to "hr")) {
            assertEquals(flag, SportsRegions.nationalTeam(nations, team))
        }
        assertNull(SportsRegions.nationalTeam(nations, "Turkey U19"))
        assertNull(SportsRegions.nationalTeam(nations.copy(league = "Club Friendlies"), "Türkiye"))
        assertEquals("Аргентина", SportsRegions.name("AR"))
        assertEquals("Португалия", SportsRegions.name("PT"))
        assertEquals("Англия", SportsRegions.name("GB-ENG"))
        assertEquals("Международные", SportsRegions.name("World"))
        assertEquals("Европа", SportsRegions.name("UEFA"))
        assertEquals("Германия", SportsRegions.name("Германия"))
        assertEquals("🇹🇷", SportsRegions.emoji("tr"))
    }

    @Test
    fun bundledClubAndLeagueArtRequiresVerifiedCanonicalIdentity() {
        val names=nations.copy(league="Premier League",country="ENG",team1="Arsenal",team2="Manchester City")
        assertEquals(R.drawable.badge_premier_league, BundledFootballBadges.competition(names))
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(names, names.team1, home = true))
        assertEquals(R.drawable.badge_manchester_city, BundledFootballBadges.team(names, names.team2, home = false))
        assertNull(BundledFootballBadges.competition(names.copy(country = "Lebanon")))
        assertNull(BundledFootballBadges.competition(names.copy(league = "Premier League 2")))
        assertEquals(R.drawable.logo_fb_manchester_united, BundledFootballBadges.team(names, "Manchester United", home = true))
        assertNull(BundledFootballBadges.team(names, "Arsenal Women", home = true))
        assertEquals(R.drawable.logo_comp_la_liga, BundledFootballBadges.competition(names.copy(league = "LaLiga", country = "Spain")))
        val spain = names.copy(league = "LaLiga", country = "Spain", team1 = "Real Madrid", team2 = "Barcelona")
        assertEquals(R.drawable.logo_fb_real_madrid, BundledFootballBadges.team(spain, "Real Madrid", home = true))
        assertEquals(R.drawable.logo_fb_barcelona, BundledFootballBadges.team(spain, "Барселона", home = false))
        val verified=names.copy(competitionId="football:eng:premier-league",homeParticipantId="football:eng:arsenal",awayParticipantId="football:eng:manchester-city")
        assertEquals(R.drawable.badge_premier_league,BundledFootballBadges.competition(verified))
        assertEquals(R.drawable.badge_arsenal,BundledFootballBadges.team(verified,verified.team1,home=true))
        assertEquals(R.drawable.badge_manchester_city,BundledFootballBadges.team(verified,verified.team2,home=false))
        assertNull(BundledFootballBadges.competition(verified.copy(competitionId="football:other:premier-league")))
        assertNull(BundledFootballBadges.team(verified.copy(homeParticipantId="unverified"),verified.team1,home=true))
    }

    @Test
    fun carouselFitsCommonPhoneWidthsAndCardsUseIntrinsicHeight() {
        assertEquals(288.dp, carouselCardWidth(320.dp))
        assertEquals(320.dp, carouselCardWidth(360.dp))
        assertEquals(320.dp, carouselCardWidth(390.dp))
        assertEquals(320.dp, carouselCardWidth(430.dp))
        assertEquals(320.dp, carouselCardWidth(412.dp))
        assertEquals(105.dp, HomePromoLayout.cardWidth(360.dp))
        assertEquals(118.dp, HomePromoLayout.cardWidth(430.dp))
        val promo390 = HomePromoLayout.cardWidth(390.dp).value
        assertTrue(promo390 in 108f..112f)
        assertTrue(HomePromoLayout.cardWidth(360.dp) in HomePromoLayout.MinWidth..HomePromoLayout.MaxWidth)
        assertTrue(HomePromoLayout.cardWidth(390.dp) in HomePromoLayout.MinWidth..HomePromoLayout.MaxWidth)
        assertTrue(HomePromoLayout.cardWidth(430.dp) in HomePromoLayout.MinWidth..HomePromoLayout.MaxWidth)
        val homePromo = File("src/main/java/com/nextpari/app/feature/home/HomeScreen.kt").readText()
        assertTrue(homePromo.contains("HomePromoLayout.cardWidth"))
        assertFalse(homePromo.contains("coerceIn(110.dp, 168.dp)"))
        assertTrue(homePromo.contains("maxLines = 2"))
        assertTrue(homePromo.contains("onNavigate(promo.route)"))
        val source = File("src/main/java/com/nextpari/app/feature/home/MatchCard.kt").readText()
        assertEquals(0, Regex("heightIn\\(min = MatchCardHeight\\)").findAll(source).count())
        assertEquals(0, Regex("MatchCardHeight").findAll(source).count())
        assertFalse(source.contains("210.dp"))
        assertFalse(source.contains("heightIn(min = 72.dp)"))
        assertFalse(source.contains("heightIn(min = 16.dp)"))
        assertTrue(source.contains("MatchCardOddsBottom = 10.dp"))
        assertTrue(source.contains(".wrapContentHeight()"))
        assertTrue(source.contains("background(face, shape)"))
        assertTrue(source.contains("marketTitle"))
        assertTrue(source.contains("MatchCardLogoSize"))
        assertTrue(source.contains("horizontalAlignment = Alignment.CenterHorizontally"))
        assertTrue(source.contains("MatchTeamArtwork(model, home, Modifier.size(MatchCardLogoSize))"))
        assertTrue(source.contains("private fun TeamSide"))
        assertTrue(Regex("""Column\(\s*modifier,\s*horizontalAlignment = Alignment.CenterHorizontally""").containsMatchIn(source))
        assertTrue(source.contains("MatchCardTeamNameHeight = 18.dp"))
        assertTrue(source.contains("maxLines = 1"))
        assertTrue(source.contains("overflow = TextOverflow.Ellipsis"))
        assertFalse(Regex("""fun TeamSide[\s\S]*maxLines = 2""").containsMatchIn(source))
        assertFalse(source.contains("maxLines = 2"))
        assertTrue(source.contains("if (model.isLive) model.score ?: \"—\" else \"VS\""))
        assertTrue(source.contains("model.marketTitle"))
        assertFalse(source.contains("if (!home) MatchTeamArtwork"))
        assertFalse(source.contains(".clip(shape)\n            .background(face)"))
        assertFalse(source.contains("priceNote"))
        assertFalse(source.contains("extraMarkets"))
        val gameList = File("src/main/java/com/nextpari/app/feature/sportsbook/GameListScreen.kt").readText()
        assertTrue(gameList.contains("NextpariMatchCard("))
        assertFalse(gameList.contains("heightIn(min"))
        assertFalse(gameList.contains("MatchCardHeight"))
        val league = File("src/main/java/com/nextpari/app/feature/sportsbook/LeagueScreen.kt").readText()
        assertTrue(league.contains("NextpariMatchCard("))
        assertFalse(league.contains("heightIn(min"))
        val home = File("src/main/java/com/nextpari/app/feature/home/HomeScreen.kt").readText()
        assertTrue(home.contains("MatchCarousel("))
        assertFalse(home.contains("heightIn(min = 210"))
    }

    @Test
    fun marketNavigationShowsOnlyCategoriesWithRealRowsAndKeepsPricePrecision() {
        val fixture = FootballEventDto("20", home = "A", away = "B", live = true, markets = listOf(
            FootballMarketDto("asian_handicap", "0", "open", listOf(FootballOutcomeDto("home", 1.904))),
        )).toFixture()!!
        val outcome = fixture.markets.single().outcomes.first()
        assertEquals("Ф1 0", outcome.label)
        assertEquals("1.904", outcome.odds)
        assertEquals("1_2", outcome.selection?.marketId)
        assertEquals(listOf("main"), MarketTabs.available("football", fixture.markets).map { it.id })
        assertTrue(fixture.locked().markets.single().outcomes.all { it.selection == null && it.locked })
    }

    @Test
    fun matchFavoritesUseTheSameStoreAndAreIsolatedByPlayer() = runTest {
        var current = "one"
        val store = SportsFavoritesStore(InMemoryPreferencesStorage()) { current }
        store.toggleLeague("Premier League")
        assertEquals(setOf("100"), store.toggleMatch("100", "one"))
        current = "two"
        store.load()
        assertTrue(store.favorites.value.matchIds.isEmpty())
        assertEquals(setOf("200"), store.toggleMatch("200", "two"))
        assertEquals(setOf("100"), store.matchIds("one"))
        assertEquals(setOf("200"), store.favorites.value.matchIds)
        current = "one"
        store.load()
        assertEquals(setOf("100"), store.favorites.value.matchIds)
        assertEquals(setOf("Premier League"), store.favorites.value.leagueIds)
    }

    @Test
    fun retryIsReservedForActionableErrors() {
        assertFalse(FootballFeedDto(ok = true).toSnapshot(null).retryable)
        assertFalse(FootballFeedDto(ok = true, stale = true).toSnapshot(null).retryable)
        assertFalse(FootballFeedDto(error = "RATE_LIMITED").toSnapshot(null).retryable)
        assertFalse(FootballFeedHttpException(401).retryable)
        assertTrue(FootballFeedHttpException(503).retryable)
    }
}
