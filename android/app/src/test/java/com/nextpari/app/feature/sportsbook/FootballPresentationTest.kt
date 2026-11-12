package com.nextpari.app.feature.sportsbook

import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FootballPresentationTest {
    private val receipt = Instant.parse("2026-11-12T12:00:12Z").toEpochMilli()
    private val tick = 5_000L
    private val approved = "https://nextpari.net/media/football/approved.png"

    private fun clock(running: Boolean = true, stale: Boolean = false, observedAt: String = "2026-11-12T12:00:00Z", minute: Int = 32) =
        Json.parseToJsonElement("""{"minute":$minute,"second":54,"running":$running,"observedAt":"$observedAt","stale":$stale}""")

    @Test
    fun runningClockStartsAtTheServerObservationAndAcceptsCorrections() {
        val running = FootballLiveClock.fromWire(clock(), receipt, tick)
        assertEquals("33:06", running?.labelAt(tick))
        assertEquals("33:13", running?.labelAt(tick + 7_000))
        val corrected = FootballLiveClock.fromWire(clock(minute = 31), receipt + 7_000, tick + 7_000)
        assertEquals("32:13", corrected?.labelAt(tick + 7_000))
    }

    @Test
    fun pausedClockStaysFixedAndResumedSnapshotStartsFromNewObservation() {
        val paused = FootballLiveClock.fromWire(clock(running = false), receipt, tick)
        assertEquals("32:54", paused?.labelAt(tick + 15_000))
        val resumed = FootballLiveClock.fromWire(clock(observedAt = "2026-11-12T12:00:27Z"), receipt + 15_000, tick + 15_000)
        assertEquals("32:55", resumed?.labelAt(tick + 16_000))
        assertNull(paused?.labelAt(tick + 78_001))
    }

    @Test
    fun absentMalformedAndStaleClocksNeverProduceAMinute() {
        assertNull(FootballLiveClock.fromWire(null, receipt, tick))
        assertNull(FootballLiveClock.fromWire(Json.parseToJsonElement("""{"minute":"32"}"""), receipt, tick))
        assertNull(FootballLiveClock.fromWire(clock(stale = true), receipt, tick))
        assertNull(FootballLiveClock.fromWire(clock(), receipt + 90_001, tick))
        assertNull(FootballLiveClock.fromWire(clock(observedAt = "2026-11-12T12:00:20Z"), receipt, tick))
    }

    @Test
    fun feedAndExactEventDetailDecodeClockAndApprovedCatalogRoles() {
        val feed = Json { ignoreUnknownKeys = true }.decodeFromString<FootballFeedDto>(
            """{"ok":true,"events":[{"id":"10","league":"Premier League","country":"eng","home":"Arsenal",
              "away":"Manchester City","live":true,"liveClock":${clock()},
              "logos":{"competitionId":"football:eng:premier-league","competition":"$approved",
              "home":"https://nextpari.net/media/football/arsenal.webp","away":null}}]}"""
        )
        for (id in listOf(null, "10")) {
            val match = feed.toSnapshot(id, receipt, tick).fixtures.single().match
            assertEquals("33:06", match.liveClock?.labelAt(tick))
            assertEquals("https://nextpari.net/media/football/arsenal.webp", match.homeBadgeUrl)
            assertNull(match.awayBadgeUrl)
            assertEquals("football:eng:premier-league", match.competitionBadge?.canonicalId)
        }
        assertNull(feed.copy(stale = true).toSnapshot(null, receipt, tick).fixtures.single().match.liveClock)
        assertNull(feed.events.single().copy(live = false).toFixture(receipt, tick)?.match?.liveClock)
    }

    @Test
    fun badgeSourceAndCanonicalLeagueIdentityFailClosed() {
        for (url in listOf("http://nextpari.net/badge.png", "https://football-logos.cc/badge.png",
            "https://nextpari.net.attacker.example/badge.png", "https://nextpari.net/badge.svg",
            "https://nextpari.net/badge.png?token=1", "https://nextpari.net:8443/badge.png")) {
            assertNull(ownedBadgeUrl(url))
        }
        val noIdentity = Json.parseToJsonElement("""{"competition":"$approved"}""")
        assertNull(FootballBadges.fromCatalog(noIdentity)?.competition)
        val match = FootballEventDto("10", league = "United", country = "eng", home = "Home", away = "Away", live = true)
            .toFixture()!!.match
        val first = FootballCompetitionBadge("league:one", approved)
        val other = FootballCompetitionBadge("league:two", approved)
        fun leagueBadge(vararg badges: FootballCompetitionBadge?) = CountryGrouping.groupByCountry(
            badges.map { match.copy(competitionBadge = it) }
        ).single().leagues.single().badge
        assertEquals(first, leagueBadge(first, first))
        assertNull(leagueBadge(first, other, first))
        assertNull(leagueBadge(first, null))
    }
}
