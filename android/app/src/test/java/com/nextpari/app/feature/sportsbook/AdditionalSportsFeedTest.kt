package com.nextpari.app.feature.sportsbook

import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdditionalSportsFeedTest {
    private val time = Instant.parse("2026-11-12T21:10:00Z").toEpochMilli()
    private val basketball = FootballEventDto(
        id = "betsapi:18:42", sport = "basketball", tier = 0, league = "NBA",
        home = "Home", away = "Away", live = true, score = FootballScoreDto(32, 29),
        markets = listOf(FootballMarketDto(
            key = "moneyline", status = "open", externalMarketId = "18_1",
            updatedAt = "2026-11-12T21:09:50Z",
            outcomes = listOf(FootballOutcomeDto("home", 1.95), FootballOutcomeDto("away", 2.02)),
        )),
    )

    @Test
    fun exactEventAndMarketStayReadOnlyAndExpire() {
        val fixture = basketball.toFixture(time, 5_000)!!
        assertEquals("32 : 29", fixture.match.score)
        assertEquals("basketball", fixture.match.sport)
        val outcome = fixture.markets.single().outcomes.first()
        assertEquals("1.95", outcome.odds)
        assertEquals(25_000L, outcome.observedUntil)
        assertTrue(outcome.locked)
        assertNull(outcome.selection)
        assertTrue(footballOddsCandidates(listOf(fixture), listOf(fixture.match.id), fixture, true).isEmpty())
        assertNull(basketball.toFixture(time + 20_000, 5_000)!!.markets.single().outcomes.first().odds)
    }

    @Test
    fun mismatchedSportOrSourceMarketCannotReuseAnotherEvent() {
        assertNull(basketball.copy(id = "betsapi:13:42").toFixture(time, 5_000))
        val wrong = basketball.markets.single().copy(externalMarketId = "1_1")
        assertTrue(basketball.copy(markets = listOf(wrong)).toFixture(time, 5_000)!!.markets.isEmpty())
    }
    @Test
    fun missingCatalogBadgeDoesNotFallBackToATeamName() {
        val football = FootballEventDto(
            id = "7", home = "Arsenal", away = "Manchester City", league = "England Premier League",
            country = "GB", live = true,
            logos = Json.parseToJsonElement("""{"competitionId":"football:eng:premier-league","home":null,"away":null}"""),
        ).toFixture(time, 5_000)!!.match
        assertTrue(football.hasLogoCatalog)
        assertNull(BundledFootballBadges.team(football, football.team1, home = true))
        assertNull(BundledFootballBadges.team(football, football.team2, home = false))
    }

}
