package com.nextpari.app.feature.sportsbook

import androidx.compose.ui.unit.dp
import com.nextpari.app.R
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.feature.favorites.SportsFavoritesStore
import com.nextpari.app.feature.home.MatchCardHeight
import com.nextpari.app.feature.home.MatchCardModel
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
        val reserve = nations.copy(id = "101", league = "Argentina Nacional Reserve League", country = "AR")
        val low = nations.copy(id = "102", league = "2. Bundesliga", country = "DE")
        val youth = nations.copy(id = "103", league = "UEFA Nations League U17")
        val virtual = nations.copy(id = "104", league = "Esoccer GT Leagues – 12 mins play")
        val basketball = nations.copy(id = "105", league = "NBA", sport = "basketball")
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
        val early = nations.copy(id = "1", isLive = false, kickoffEpochMs = 1L, outcomes = emptyList())
        val late = early.copy(id = "2", kickoffEpochMs = 2L)
        val other = early.copy(id = "3", league = "Regional Cup")
        assertEquals(listOf(early, late, other), FeaturedSports.ordered(listOf(other, late, early)))
    }

    @Test
    fun featuredSectionsRankRealMajorEventsAndLimitLineToTheNextDay() {
        val now = 1_000_000L
        val nextDay = now + 86_400_000
        val youth = nations.copy(id = "200", league = "U-20 World Cup", serverTier = 2)
        val nba = nations.copy(id = "201", sport = "basketball", league = "NBA", serverTier = 0)
        val friendly = nations.copy(id = "202", league = "Club Friendlies", serverTier = 2)
        val virtual = nations.copy(id = "203", league = "Esoccer GT Leagues", serverTier = 1)
        assertEquals(listOf(nba, nations, youth, friendly),
            FeaturedSports.popularLive(listOf(youth, nba, virtual, friendly, nations)))

        val early = friendly.copy(isLive = false, kickoffEpochMs = now + 1)
        val major = nba.copy(isLive = false, kickoffEpochMs = nextDay)
        val past = nations.copy(isLive = false, kickoffEpochMs = now)
        val later = nations.copy(isLive = false, kickoffEpochMs = nextDay + 1)
        assertEquals(listOf(major, early), FeaturedSports.popularLine(
            listOf(early, past, major, later, nations, virtual.copy(isLive = false, kickoffEpochMs = now + 1),
                youth.copy(isLive = false, kickoffEpochMs = null)),
            now,
        ))
    }

    @Test
    fun liveStatusShowsOnlyKnownPhaseAndObservedTime() {
        assertEquals("1-й тайм · 34:12", liveStatusText("first_half", "34:12"))
        assertEquals("2-й тайм · 63:38", liveStatusText("second_half", "63:38"))
        assertEquals("2-й тайм", liveStatusText("second_half", null))
        assertEquals("63:38", liveStatusText(null, "63:38"))
        assertNull(liveStatusText("LIVE", null))
        assertNull(liveStatusText(null, null))
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
        assertEquals("🇹🇷", SportsRegions.emoji("tr"))
    }

    @Test
    fun bundledClubAndLeagueArtUsesReviewedAliasesAndRefusesConflictingIdentity() {
        val premier = nations.copy(league = "Premier League", country = "ENG", team1 = "Arsenal", team2 = "Manchester City")
        assertEquals(R.drawable.badge_premier_league, BundledFootballBadges.competition(premier))
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(premier, premier.team1))
        assertEquals(R.drawable.badge_manchester_city, BundledFootballBadges.team(premier, premier.team2))
        assertNull(BundledFootballBadges.team(premier, "Arsenal U21"))
        assertNull(BundledFootballBadges.team(premier.copy(country = "AR"), "Arsenal"))
        assertNull(BundledFootballBadges.team(premier.copy(competitionId = "football:other:premier-league"), "Arsenal"))
    }

    @Test
    fun carouselFitsCommonPhoneWidthsWithASharedHeight() {
        assertEquals(288.dp, carouselCardWidth(320.dp))
        assertEquals(320.dp, carouselCardWidth(360.dp))
        assertEquals(320.dp, carouselCardWidth(412.dp))
        assertEquals(148.dp, MatchCardHeight)
        val source = File("src/main/java/com/nextpari/app/feature/home/MatchCard.kt").readText()
        assertEquals(2, Regex("\\.height\\(MatchCardHeight\\)").findAll(source).count())
        assertFalse(source.contains("priceNote"))
        assertFalse(source.contains("extraMarkets"))
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
        assertEquals(listOf("all", "handicaps"), MarketTabs.available("football", fixture.markets).map { it.id })
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
