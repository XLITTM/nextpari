package com.nextpari.app.feature.sportsbook

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.feature.home.MatchCardModel
import java.io.File
import org.junit.Test

class CompetitionDirectoryTest {
    private fun match(
        id: String,
        league: String,
        country: String,
        live: Boolean = true,
        competitionId: String? = null,
    ) = MatchCardModel(
        id = id,
        eventId = id,
        sport = "football",
        league = league,
        country = country,
        team1 = "Home $id",
        team2 = "Away $id",
        isLive = live,
        competitionId = competitionId,
    )

    @Test
    fun topAndFavoritesStayInsideCountryAccordionsWithoutDuplicatingEvents() {
        val matches = listOf(
            match("pl1", "Premier League", "England"),
            match("pl2", "Premier League", "England"),
            match("fa", "FA Cup", "England"),
            match("ucl1", "UEFA Champions League", "England"),
            match("bl1", "Bundesliga", "Germany"),
            match("bl2", "2. Bundesliga", "Germany"),
            match("laliga", "LaLiga", "Spain"),
        )
        val groups = CountryGrouping.groupByCountry(matches)
        val englandId = CompetitionOrder.leagueKey(matches.first())
        val directory = CompetitionDirectory.organize(groups, setOf(englandId))
        val england = directory.countries.single { it.country == "England" }
        val germany = directory.countries.single { it.country == "Germany" }
        val spain = directory.countries.single { it.country == "Spain" }
        assertThat(directory.favorites.single().id).isEqualTo(englandId)
        assertThat(directory.top.map { it.name }).containsAtLeast("UEFA Champions League", "Bundesliga", "LaLiga")
        assertThat(directory.top.map { it.id }).doesNotContain(englandId)
        assertThat(england.leagues.map { it.name }).containsExactly("Premier League", "FA Cup")
        assertThat(england.count).isEqualTo(3)
        assertThat(germany.leagues.map { it.name }).containsExactly("Bundesliga", "2. Bundesliga")
        assertThat(germany.count).isEqualTo(2)
        assertThat(spain.leagues.map { it.name }).containsExactly("LaLiga")
        assertThat(england.leagues.sumOf { it.count } + germany.leagues.sumOf { it.count } + spain.leagues.sumOf { it.count })
            .isEqualTo(matches.filter { it.league != "UEFA Champions League" }.distinctBy { it.eventId }.size)
        assertThat(directory.countries.flatMap { it.leagues }.map { it.name }).doesNotContain("UEFA Champions League")
        assertThat(LeagueMatches.filter(matches, englandId).map { it.eventId }).containsExactly("pl1", "pl2")
        assertThat(LeagueMatches.filter(matches, directory.top.first { it.name == "UEFA Champions League" }.id).map { it.eventId })
            .containsExactly("ucl1")
    }

    @Test
    fun internationalCompetitionsAreRecognizedEvenWithADomesticCountryLabel() {
        assertThat(CompetitionOrder.rank(match("nl", "UEFA Nations League", "England")))
            .isEqualTo(CompetitionOrder.rank("football", "football:int:uefa-nations-league"))
        assertThat(CompetitionOrder.isInternationalLeague("UEFA Champions League", "England", null)).isTrue()
        assertThat(CompetitionOrder.isInternationalLeague("Premier League", "England", null)).isFalse()
        assertThat(CompetitionOrder.isInternationalCountry("World")).isTrue()
        assertThat(CompetitionOrder.isInternationalCountry("Europe")).isTrue()
        assertThat(CompetitionOrder.isInternationalCountry("UEFA")).isTrue()
        assertThat(CompetitionOrder.isInternationalCountry("Международные")).isTrue()
        val groups = CountryGrouping.groupByCountry(
            listOf(
                match("ucl", "UEFA Champions League", "International"),
                match("unl", "UEFA Nations League", "World", competitionId = "football:int:uefa-nations-league"),
                match("friendly", "Club Friendlies", "World"),
                match("pl", "Premier League", "England"),
            ),
        )
        val directory = CompetitionDirectory.organize(groups, emptySet())
        assertThat(directory.top.map { it.name }).containsAtLeast("UEFA Champions League", "UEFA Nations League")
        assertThat(directory.international.map { it.name }).containsExactly("Club Friendlies")
        assertThat(directory.countries.map { it.country }).containsExactly("England")
        assertThat(CompetitionDirectory.organize(emptyList(), emptySet()).international).isEmpty()
        assertThat(CompetitionDirectory.organize(emptyList(), emptySet()).countries).isEmpty()
    }

    @Test
    fun liveAndLineCountsStayOnUniqueFixturesAndSearchKeepsCountries() {
        val live = listOf(match("pl-live", "Premier League", "England", live = true), match("bl-live", "Bundesliga", "Germany", live = true))
        val line = listOf(match("pl-line", "Premier League", "England", live = false), match("pl-line-2", "Premier League", "England", live = false))
        val liveGroups = CountryGrouping.groupByCountry(SportsbookCatalog.pool("live", live, line))
        val lineGroups = CountryGrouping.groupByCountry(SportsbookCatalog.pool("line", live, line))
        assertThat(liveGroups.single { it.country == "England" }.count).isEqualTo(1)
        assertThat(lineGroups.single { it.country == "England" }.count).isEqualTo(2)
        val searched = CountryGrouping.search(liveGroups, "Англия", countryOnly = true)
        assertThat(searched.map { it.country }).containsExactly("England")
        val leagueSearch = CountryGrouping.search(liveGroups, "Bundesliga", countryOnly = false)
        assertThat(leagueSearch.map { it.country }).containsExactly("Germany")
        assertThat(CountryGrouping.nextExpanded(liveGroups, "Germany")).isEqualTo("Germany")
        assertThat(CountryGrouping.nextExpanded(liveGroups, "Spain")).isEqualTo(CountryGrouping.initialExpanded(liveGroups))
        val screen = moduleFile("src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt").readText()
        assertThat(screen).contains("ChampionshipsDirectory(")
        assertThat(screen).contains("CompetitionCard(")
        assertThat(screen).contains("items(directory.top")
        assertThat(screen).doesNotContain("CompetitionSection(")
        assertThat(screen).contains("shadow(2.dp")
        assertThat(BundledFootballBadges.competition(match("missing", "Unknown Cup", "Atlantis"))).isNull()
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File("app/$relative"), File("android/app/$relative"), File(relative))
        return candidates.first { it.exists() }
    }
}
