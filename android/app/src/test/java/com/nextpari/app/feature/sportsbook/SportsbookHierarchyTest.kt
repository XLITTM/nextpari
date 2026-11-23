package com.nextpari.app.feature.sportsbook

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.BuildConfig
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.OddsMovement
import org.junit.Test

class SportsbookHierarchyTest {
    private val spainA = MatchCardModel(id = "1", sport = "football", league = "Ла Лига", country = "Испания", team1 = "A", team2 = "B")
    private val spainB = MatchCardModel(id = "2", sport = "football", league = "Ла Лига", country = "Испания", team1 = "C", team2 = "D")
    private val england = MatchCardModel(id = "3", sport = "football", league = "АПЛ", country = "Англия", team1 = "E", team2 = "F")
    private val copa = MatchCardModel(id = "4", sport = "football", league = "Кубок", country = "Испания", team1 = "G", team2 = "H")

    @Test
    fun countryGroupingCountsAndFirstExpanded() {
        val groups = CountryGrouping.groupByCountry(listOf(spainA, spainB, england, copa))
        assertThat(groups.map { it.country }).containsExactly("Англия", "Испания").inOrder()
        assertThat(groups.first().count).isEqualTo(1)
        assertThat(groups[1].leagues.map { it.name to it.count }).containsExactly("Кубок" to 1, "Ла Лига" to 2).inOrder()
        assertThat(groups[1].count).isEqualTo(3)
        assertThat(CountryGrouping.initialExpanded(groups)).isEqualTo("Англия")
        assertThat(CountryGrouping.nextExpanded(groups, "Испания")).isEqualTo("Испания")
        assertThat(CountryGrouping.nextExpanded(groups, "Франция")).isEqualTo("Англия")
        assertThat(CountryGrouping.initialExpanded(emptyList())).isEmpty()
    }

    @Test
    fun verifiedCompetitionIdentityRanksEnglandAheadOfAnotherPremierLeague() {
        val england = MatchCardModel(id = "epl", eventId = "epl", sport = "football", provider = "oddspapi-v5",
            league = "Premier League", country = "England", team1 = "Arsenal", team2 = "Manchester City")
        val lebanon = england.copy(id = "leb", eventId = "leb", country = "Lebanon", team1 = "A", team2 = "B")
        val champions = england.copy(id = "ucl", eventId = "ucl", league = "UEFA Champions League", country = "International", team1 = "C", team2 = "D")
        val tennis = england.copy(id = "tt", eventId = "tt", sport = "table-tennis", league = "TT Cup", country = "International", team1 = "E", team2 = "F")
        assertThat(CompetitionOrder.rank(england)).isLessThan(CompetitionOrder.rank(lebanon))
        assertThat(CompetitionOrder.rank(lebanon)).isEqualTo(Int.MAX_VALUE)
        assertThat(FeaturedSports.tier(england)).isEqualTo(0)
        assertThat(FeaturedSports.tier(lebanon)).isEqualTo(1)
        val groups = CountryGrouping.groupByCountry(listOf(lebanon, tennis, champions, england))
        val directory = CompetitionDirectory.organize(groups, setOf(CompetitionOrder.leagueKey(england)))
        assertThat(directory.favorites.map { it.name }).containsExactly("Premier League")
        assertThat(directory.top.map { it.name }).containsExactly("UEFA Champions League")
        assertThat(directory.countries.flatMap { it.leagues }.map { it.name }).containsExactly("Premier League")
        assertThat(directory.countries.flatMap { it.leagues }.map { it.name }).doesNotContain("UEFA Champions League")
        val listed = GameListLayout.entries(listOf(tennis, lebanon, england)).filterIsInstance<GameListEntry.Fixture>().map { it.match.eventId }
        val nba = MatchCardModel("nba", eventId = "nba", sport = "basketball", league = "NBA", country = "USA", team1 = "Lakers", team2 = "Celtics")
        val mixed = GameListLayout.entries(listOf(nba, tennis, england)).filterIsInstance<GameListEntry.Fixture>().map { it.match.eventId }
        assertThat(mixed).containsExactly("epl", "nba", "tt").inOrder()
        assertThat(listed).containsExactly("epl", "leb", "tt").inOrder()
        assertThat(GameListLayout.entries(listOf(england, tennis)).filterIsInstance<GameListEntry.Heading>().map { it.title })
            .containsAtLeast("Футбол", "Premier League", "Настольный теннис", "TT Cup")
    }

    @Test
    fun leagueCountAndRouteRoundTrip() {
        val id = LeagueIds.toLeagueId("Испания", "Ла Лига")
        assertThat(id).isEqualTo("Испания|Ла Лига")
        assertThat(LeagueIds.fromLeagueId(id)).isEqualTo("Испания" to "Ла Лига")
        val matches = LeagueMatches.filter(listOf(spainA, spainB, england, copa), id)
        assertThat(matches.map { it.id }).containsExactly("1", "2")
        assertThat(Destinations.league(id)).startsWith("league/")
        assertThat(Destinations.league("epl")).isEqualTo("league/epl")
    }

    @Test
    fun marketTabsAreSpecificToEachSport() {
        assertThat(MarketTabs.forSport("football").map { it.id }).containsAtLeast("main", "1st-half", "2nd-half", "corners", "cards")
        assertThat(MarketTabs.modes("football").map { it.id }).containsExactly("all", "players", "popular").inOrder()
        for(sport in listOf("tennis", "basketball", "hockey", "volleyball", "table-tennis", "esports")) {
            val ids=MarketTabs.forSport(sport).map { it.id }
            assertThat(ids).containsAtLeast("all", "main", "handicaps")
            assertThat(ids).containsNoneOf("corners", "cards", "1st-half", "2nd-half")
        }
        assertThat(MarketTabs.forSport("basketball").map { it.id }).containsAtLeast("quarters", "halves", "players")
        assertThat(MarketTabs.forSport("tennis").map { it.id }).containsAtLeast("sets", "games", "tiebreaks", "aces")
        assertThat(MarketTabs.forSport("esports").map { it.id }).containsAtLeast("maps", "rounds", "kills")
    }

    @Test
    fun firstTwoMarketsOpenOnInitialTabAndTogglePinSort() {
        val markets = SportsbookPreviewData.markets
        val open = MarketAccordionLogic.initialOpenKeys(markets)
        assertThat(open).containsExactly("1x2", "total")
        val afterToggle = MarketAccordionLogic.toggle(open, "1x2")
        assertThat(afterToggle).containsExactly("total")
        val pinned = MarketAccordionLogic.togglePin(emptySet(), "handicap")
        assertThat(MarketAccordionLogic.isOpen("handicap", afterToggle, pinned)).isTrue()
        assertThat(MarketAccordionLogic.isOpen("1x2", afterToggle, pinned)).isFalse()
        assertThat(MarketAccordionLogic.sortPinnedFirst(markets, pinned).map { it.key }.first()).isEqualTo("handicap")
        assertThat(MarketAccordionLogic.isOpen("total", afterToggle, pinned)).isTrue()
    }

    @Test
    fun gridSizingLockedAndOddsMovement() {
        val moneyline = SportsbookPreviewData.markets.first { it.key == "1x2" }
        val totals = SportsbookPreviewData.markets.first { it.key == "total" }
        val handicap = SportsbookPreviewData.markets.first { it.key == "handicap" }
        val btts = SportsbookPreviewData.markets.first { it.key == "btts" }
        assertThat(MarketAccordionLogic.columns(moneyline)).isEqualTo(3)
        assertThat(MarketAccordionLogic.columns(totals)).isEqualTo(2)
        assertThat(MarketAccordionLogic.columns(handicap)).isEqualTo(2)
        assertThat(CompactMarketLayout.buttonLabel(totals, "2.5", totals.outcomes[0])).isEqualTo("(2.5) Б")
        assertThat(CompactMarketLayout.buttonLabel(totals, "2.5", totals.outcomes[1])).isEqualTo("(2.5) М")
        assertThat(CompactMarketLayout.hideLineColumn(totals)).isTrue()
        assertThat(CompactMarketLayout.buttonLabel(handicap, "-0.5", handicap.outcomes[0])).isEqualTo("1 (-0.5)")
        assertThat(CompactMarketLayout.buttonLabel(handicap, "-0.5", handicap.outcomes[1])).isEqualTo("2 (0.5)")
        assertThat(CompactMarketLayout.hideLineColumn(handicap)).isTrue()
        assertThat(btts.outcomes.map { it.label }).containsExactly("Да", "Нет").inOrder()
        assertThat(btts.outcomes.first { it.outcomeId == "no" }.locked).isTrue()
        assertThat(moneyline.outcomes.first { it.label == "1" }.movement).isEqualTo(OddsMovement.Up)
        assertThat(moneyline.outcomes.first { it.label == "2" }.movement).isEqualTo(OddsMovement.Down)
        val twoWay = moneyline.copy(outcomes = moneyline.outcomes.take(2), name = "Победитель")
        assertThat(MarketAccordionLogic.columns(twoWay)).isEqualTo(2)
    }

    @Test
    fun runtimeRepositoryContainsNoPreviewOddsOrMatches() {
        val repo = FakeHomeCatalogRepository()
        assertThat(repo.liveMatches()).isEmpty()
        assertThat(repo.lineMatches()).isEmpty()
        assertThat(repo.esportsLiveMatches()).isEmpty()
        assertThat(repo.esportsLineMatches()).isEmpty()
        assertThat(repo.matchById(SportsbookPreviewData.MATCH_ID)).isNull()
        assertThat(repo.marketsFor(SportsbookPreviewData.MATCH_ID)).isEmpty()
        assertThat(repo.marketsFor("anything")).isEmpty()
        val vm = SportsbookViewModel(repo)
        assertThat(vm.live()).isEmpty()
        assertThat(vm.marketsFor(SportsbookPreviewData.MATCH_ID)).isEmpty()
        assertThat(SportsListCatalog.rows("live", vm.live(), vm.line()).all { it.count == 0 }).isTrue()
        assertThat(CountryGrouping.groupByCountry(vm.live())).isEmpty()
    }

    @Test
    fun previewDataIsDebugOnlyAndNotAPlayerRoute() {
        assertThat(Destinations.webPlayerRoutes).doesNotContain(Destinations.DEBUG_SPORTSBOOK_PREVIEW)
        assertThat(SportsbookPreviewData.match.id).isEqualTo("preview-debug-football")
        assertThat(SportsbookPreviewData.markets.map { it.name }).containsAtLeast("1X2", "Тотал", "Фора")
        assertThat(SportsbookPreviewData.markets.flatMap { it.outcomes }.any { it.odds != null }).isTrue()
        if (!BuildConfig.DEBUG) {
            assertThat(BuildConfig.DEBUG).isFalse()
        }
    }

    @Test
    fun bottomNavMappingUnchangedForSportsRoutes() {
        assertThat(Destinations.bottomNavActiveRoute(Destinations.MATCH)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.match("42"))).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.GAMELIST_LIVE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.GAMELIST_LINE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.LEAGUE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.league("epl"))).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SPORTS_LIVE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SPORTS_LINE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SPORTS_CYBERS)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.EXPRESS)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.RESULTS)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.CHAMPIONSHIPS)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.championships("football", "live"))).isEqualTo(Destinations.HOME)
        assertThat(Destinations.showsHeader(Destinations.SPORTS_LIVE)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.MATCH)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.CHAMPIONSHIPS)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.LEAGUE)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.HOME)).isTrue()
    }

    @Test
    fun sportSelectorAndListsShowObservedSportsInCatalogOrder() {
        val tennis = spainA.copy(id="4",eventId="4",sport="tennis",league="ATP")
        val handball = spainA.copy(id="5",eventId="5",sport="handball")
        val virtual = spainA.copy(id="6",eventId="6",sport="esports")
        val live=listOf(tennis,virtual,spainA)
        val line=listOf(handball)
        assertThat(SportsListCatalog.selector(emptyList(),emptyList()).map { it.id }).containsExactly("all")
        assertThat(SportsListCatalog.selector(live,line).map { it.id }).containsExactly("all","football","tennis","esports","handball").inOrder()
        assertThat(SportsListCatalog.rows("live",live,line).map { it.id to it.count }).containsExactly("football" to 1,"tennis" to 1).inOrder()
        assertThat(SportsListCatalog.rows("line",live,line).map { it.id }).containsExactly("handball")
        assertThat(SportsListCatalog.rows("cybers",live,line).map { it.id }).containsExactly("esports")
        assertThat(SportsListCatalog.rows("cybers",emptyList(),emptyList())).isEmpty()
    }

    @Test
    fun searchKeepsExactFixtureIdentityAndFindsDomesticLeagues() {
        val match = spainA.copy(id = "betsapi:13:1", eventId = "betsapi:13:1", team1 = "Barcelona")
        assertThat(SportsbookCatalog.search(listOf(match, england), " barcelona ").single().eventId)
            .isEqualTo("betsapi:13:1")
        assertThat(SportsbookCatalog.search(listOf(match, england), "ла лига")).containsExactly(match)
        val groups = CountryGrouping.groupByCountry(listOf(spainA, england, copa))
        assertThat(CountryGrouping.search(groups, "лига", countryOnly = false).single().leagues.map { it.name })
            .containsExactly("Ла Лига")
        assertThat(CountryGrouping.search(groups, "испания", countryOnly = true).single().count).isEqualTo(2)
        assertThat(CountryGrouping.search(groups, "ла лига", countryOnly = true)).isEmpty()
    }
}
