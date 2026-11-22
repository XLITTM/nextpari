package com.nextpari.app.feature.casino

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import kotlinx.coroutines.test.runTest
import org.junit.Test

class CasinoLibraryAndTournamentsTest {
    @Test
    fun favoritesPersistPerPlayerAndRecentIsNotInvented() = runTest {
        val storage = InMemoryPreferencesStorage()
        var player = "one"
        CasinoLibraryStore.preferences = { storage }
        CasinoLibraryStore.playerId = { player }
        CasinoLibraryStore.clearMemory()
        CasinoLibraryStore.load()
        assertThat(CasinoLibraryStore.peek().favoriteIds).isEmpty()
        assertThat(CasinoLibraryStore.peek().recentIds).isEmpty()

        val wolf = CasinoDemoGame("wolf", "Wolf Gold", "Pragmatic Play", "slots", mobile = true)
        CasinoLibraryStore.toggleFavorite(wolf)
        CasinoLibraryStore.recordPlayed(wolf)
        assertThat(CasinoLibraryStore.peek().favoriteIds).containsExactly("wolf")
        assertThat(CasinoLibraryStore.peek().recentIds).containsExactly("wolf")

        player = "two"
        CasinoLibraryStore.clearMemory()
        CasinoLibraryStore.load()
        assertThat(CasinoLibraryStore.peek().favoriteIds).isEmpty()
        assertThat(CasinoLibraryStore.peek().recentIds).isEmpty()

        player = "one"
        CasinoLibraryStore.load()
        assertThat(CasinoLibraryStore.peek().favoriteIds).containsExactly("wolf")
        assertThat(CasinoLibraryStore.games(CasinoLibraryStore.peek().favoriteIds).single().title).isEqualTo("Wolf Gold")
    }

    @Test
    fun tournamentScreenReportsMissingBackendContract() {
        assertThat(CasinoTournamentContract.MISSING_ENDPOINT).contains("/api/player/casino/real")
        assertThat(CasinoTournamentContract.MISSING_ENDPOINT).contains("tournaments")
        assertThat(CasinoTournamentContract.EMPTY_COPY).contains("сервер не отдаёт турнирные данные")
    }

    @Test
    fun browseTitleUsesCatalogLabels() {
        assertThat(CasinoBrowseLogic.title("slots")).isEqualTo("Слоты")
        assertThat(CasinoBrowseLogic.title("live")).isEqualTo("Лайв казино")
        assertThat(CasinoBrowseLogic.title("", "Evolution")).isEqualTo("Evolution")
    }
}
