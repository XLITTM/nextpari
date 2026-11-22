package com.nextpari.app.feature.casino

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)

class CasinoCatalogStoreTest {
    private fun page(id: String = "nile") = CasinoDemoPage(
        ok = true,
        games = listOf(CasinoDemoGame(id, "Nile Fortunes", "Pragmatic Play", "slots", mobile = true)),
    )

    @Test
    fun coalescesIdenticalInFlightRequestsAndReusesFreshCache() = runTest {
        var calls = 0
        val cache = CasinoCatalogCache(
            clock = { testScheduler.currentTime },
            freshnessMs = 90_000,
            sessionId = { "player-1" },
            fetch = { _, _, _ ->
                calls += 1
                delay(120)
                page()
            },
        )
        val first = async { cache.list("", "slots", 1) }
        val second = async { cache.list("", "slots", 1) }
        assertThat(first.await().games.single().title).isEqualTo("Nile Fortunes")
        assertThat(second.await().games.single().id).isEqualTo("nile")
        assertThat(calls).isEqualTo(1)
        assertThat(cache.networkCalls).isEqualTo(1)
        assertThat(cache.coalescedWaits).isEqualTo(1)
        assertThat(cache.lastNetworkMs).isEqualTo(120)

        val warmStart = testScheduler.currentTime
        val warm = cache.list("", "slots", 1)
        assertThat(warm.games).hasSize(1)
        assertThat(testScheduler.currentTime - warmStart).isEqualTo(0)
        assertThat(cache.cacheHits).isEqualTo(1)
        assertThat(calls).isEqualTo(1)
    }

    @Test
    fun scopesCacheToSessionAndClearsOnLogout() = runTest {
        var session = "one"
        var calls = 0
        val cache = CasinoCatalogCache(
            clock = { testScheduler.currentTime },
            freshnessMs = 90_000,
            sessionId = { session },
            fetch = { _, category, _ ->
                calls += 1
                delay(40)
                page(category)
            },
        )
        cache.list("", "slots", 1)
        cache.list("", "slots", 1)
        assertThat(calls).isEqualTo(1)
        session = "two"
        cache.list("", "slots", 1)
        assertThat(calls).isEqualTo(2)
        cache.clear()
        cache.list("", "slots", 1)
        assertThat(calls).isEqualTo(3)
        assertThat(cache.peek("", "live", 1)).isNull()
    }

    @Test
    fun keepsLastSuccessfulPageWhileALaterRefreshWouldRun() = runTest {
        val cache = CasinoCatalogCache(
            clock = { testScheduler.currentTime },
            freshnessMs = 90_000,
            sessionId = { "player-1" },
            fetch = { _, _, _ -> delay(10); page("good-luck") },
        )
        cache.list("", "live", 1)
        assertThat(cache.peek("", "live", 1)?.games?.single()?.id).isEqualTo("good-luck")
        assertThat(cache.peekFresh("", "live", 1)).isNotNull()
        testScheduler.advanceTimeBy(91_000)
        assertThat(cache.peek("", "live", 1)?.games?.single()?.title).isEqualTo("Nile Fortunes")
        assertThat(cache.peekFresh("", "live", 1)).isNull()
    }

    @Test
    fun sampleSizeStopsOversizedThumbnails() {
        assertThat(CasinoArtworkPolicy.sampleSize(1600, 1200, 480)).isEqualTo(4)
        assertThat(CasinoArtworkPolicy.sampleSize(320, 240, 480)).isEqualTo(1)
        assertThat(CasinoArtworkPolicy.diskKey("https://cdn.imagesai.org/a.png")).hasLength(64)
    }
}
