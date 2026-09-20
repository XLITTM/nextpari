package com.nextpari.app.feature.home

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProductSectionsTest {
    @Test
    fun homeSectionOrderMatchesProductSpec() {
        assertThat(HomeSectionOrder.top).containsExactly(
            "sports",
            "promos",
            "live",
            "line",
            "champs",
            "esports-disciplines",
            "esports-live",
            "esports-line",
            "esports-tournaments",
        ).inOrder()
        assertThat(HomeSectionOrder.sport).containsExactly("sports", "live", "line", "champs").inOrder()
        assertThat(HomeSectionOrder.esports).containsExactly(
            "esports-disciplines",
            "esports-live",
            "esports-line",
            "esports-tournaments",
        ).inOrder()
        assertThat(HomeSectionOrder.casino).containsExactly(
            "casino-entries",
            "casino-featured",
            "casino-tournaments",
            "casino-categories",
        ).inOrder()
    }

    @Test
    fun esportsSectionLabelsMatchWeb() {
        assertThat(HomeSectionOrder.esportsLabels).containsExactly(
            "Киберспорт LIVE",
            "Киберспорт Линия",
            "Турниры LIVE",
        ).inOrder()
    }

    @Test
    fun championshipsMapperAggregatesLiveEvents() {
        val live = listOf(
            MatchCardModel(id = "1", sport = "football", league = "А", country = "Испания", team1 = "A", team2 = "B"),
            MatchCardModel(id = "2", sport = "football", league = "А", country = "Испания", team1 = "C", team2 = "D"),
            MatchCardModel(id = "3", sport = "esports", league = "CS", country = "World", team1 = "X", team2 = "Y"),
        )
        val all = ChampionshipsMapper.fromLive(live, excludeEsports = false)
        assertThat(all).hasSize(2)
        assertThat(all.first { it.name == "А" }.count).isEqualTo(2)
        assertThat(all.first { it.name == "А" }.country).isEqualTo("Испания")
        assertThat(all.first { it.name == "А" }.color).isEqualTo(ChampionshipColors.colorFromName("А"))

        val sportsOnly = ChampionshipsMapper.fromLive(live, excludeEsports = true)
        assertThat(sportsOnly.map { it.name }).containsExactly("А")
        assertThat(ChampionshipsMapper.fromLive(emptyList())).isEmpty()
    }

    @Test
    fun casinoCategoryLabelsAndOrderMatchWeb() {
        assertThat(CasinoHomeCatalog.categories.map { it.name }).containsExactly(
            "Слоты",
            "Лайв казино",
            "TV игры",
            "Бинго",
        ).inOrder()
        assertThat(CasinoHomeCatalog.categories.map { it.id }).containsExactly("slots", "live", "tv", "bingo").inOrder()
    }

    @Test
    fun tournamentStatusLabelsAreProductCopy() {
        assertThat(CasinoTournamentStatus.ACTIVE.label).isEqualTo("Активный")
        assertThat(CasinoTournamentStatus.SOON.label).isEqualTo("Скоро")
        assertThat(CasinoTournamentStatus.FINISHED.label).isEqualTo("Завершён")
        CasinoHomeCatalog.tournaments.forEach { item ->
            assertThat(item.status).isEqualTo(CasinoTournamentStatus.SOON)
            assertThat(item.status.label).isEqualTo("Скоро")
        }
    }

    @Test
    fun runtimeCatalogHasNoFakeOdds() {
        val repo = FakeHomeCatalogRepository()
        assertThat(repo.liveMatches()).isEmpty()
        assertThat(repo.lineMatches()).isEmpty()
        assertThat(repo.esportsLiveMatches()).isEmpty()
        assertThat(repo.esportsLineMatches()).isEmpty()
        val allMatches = repo.liveMatches() + repo.lineMatches() + repo.esportsLiveMatches() + repo.esportsLineMatches()
        assertThat(allMatches.flatMap { it.outcomes }.mapNotNull { it.odds }).isEmpty()
        assertThat(ChampionshipsMapper.fromLive(repo.liveMatches())).isEmpty()
        assertThat(SampleMatchCards.previewLive.outcomes.map { it.odds }).isNotEmpty()
        assertThat(repo.liveMatches()).doesNotContain(SampleMatchCards.previewLive)
    }

    @Test
    fun runtimeCatalogHasNoFakeTournamentPrizes() {
        val repo = FakeHomeCatalogRepository()
        assertThat(repo.esportsTournaments()).isEmpty()
        repo.casinoTournaments().forEach { item ->
            assertThat(item.prizePool).isNull()
            assertThat(item.countdown).isNull()
        }
        val blob = repo.casinoTournaments().joinToString { "${it.title} ${it.prizePool} ${it.countdown}" }
        assertThat(blob).doesNotContain("50,000")
        assertThat(blob).doesNotContain("€")
        assertThat(blob).doesNotContain("\$50")
    }

    @Test
    fun catalogsHaveNoCompetitorBranding() {
        val repo = FakeHomeCatalogRepository()
        val blob = buildString {
            appendLine(HomeSectionOrder.top)
            appendLine(HomeSectionOrder.esportsLabels)
            repo.promos().forEach { appendLine(it.title) }
            repo.esportsDisciplines().forEach { appendLine(it.name) }
            repo.casinoFeatures().forEach { appendLine("${it.title} ${it.subtitle} ${it.badge}") }
            repo.casinoTournaments().forEach { appendLine("${it.title} ${it.prizePool} ${it.status.label}") }
            repo.casinoCategories().forEach { appendLine(it.name) }
            appendLine(SampleMatchCards.previewLive.league)
        }
        listOf("YOHOHO", "Yohoho", "YohohoGames").forEach { token ->
            assertThat(blob).doesNotContain(token)
        }
    }
}
