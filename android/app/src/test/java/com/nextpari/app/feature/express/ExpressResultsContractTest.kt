package com.nextpari.app.feature.express

import com.nextpari.app.feature.menu.MenuCatalog
import com.nextpari.app.feature.results.EmptyResultsRepository
import com.nextpari.app.feature.results.parseResultEvent
import com.nextpari.app.feature.results.statusLabel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExpressResultsContractTest {
    @Test
    fun unpublishedExpressRepositoryStaysEmpty() = runBlocking {
        val empty = EmptyExpressRepository()
        assertTrue(empty.published().isEmpty())
        val (express, message) = empty.validateForCoupon("missing")
        assertNull(express)
        assertEquals("Экспресс недоступен.", message)
    }

    @Test
    fun resultsStayHonestWhenProviderIsMissing() = runBlocking {
        val page = EmptyResultsRepository().load("today", "football")
        assertFalse(page.configured)
        assertTrue(page.events.isEmpty())
        assertTrue(page.notice.contains("не подключён"))
        assertEquals("LIVE", statusLabel("live"))
        assertEquals("Завершён", statusLabel("completed"))
    }

    @Test
    fun resultsParserKeepsCanonicalIdsAndScores() {
        val row = Json.parseToJsonElement(
            """{"canonicalEventId":"football:eng:event-1","sport":"football","competition":"Premier League","homeTeam":"Arsenal","awayTeam":"Chelsea","homeScore":2,"awayScore":1,"status":"completed","kickoffAt":"2026-11-22T15:00:00Z"}""",
        ).jsonObject
        val event = parseResultEvent(row)!!
        assertEquals("football:eng:event-1", event.canonicalEventId)
        assertEquals("Arsenal", event.homeTeam)
        assertEquals("2", event.homeScore)
        assertEquals("completed", event.status)
    }

    @Test
    fun expressJsonDoesNotTrustClientCombinedOddsAlone() {
        val body = Json.parseToJsonElement(
            """{"data":{"id":"ex1","title":"День","description":"","status":"published","combinedOdds":9.99,"selections":[{"id":"s1","sortOrder":0,"canonicalEventId":"e1","provider":"lsports","feedType":"prematch","fixtureId":"1","marketId":"1","marketKey":"1x2","selectionId":"a","outcomeId":"1","line":"","oddsSnapshot":1.5,"oddsSnapshotAt":"","matchLabel":"A — B","league":"PL","outcomeName":"П1"}]}}""",
        ) as JsonObject
        val parsed = parseExpressList(body).single()
        assertEquals("ex1", parsed.id)
        assertEquals(9.99, parsed.combinedOdds!!, 0.0)
        assertEquals(1, parsed.selections.size)
        assertEquals("e1", parsed.selections.single().canonicalEventId)
    }

    @Test
    fun sportsMenuActivatesExpressAndResultsAndKeepsStreamSoon() {
        val sport = MenuCatalog.itemsFor("Спорт")
        assertEquals("sports/express", sport.first { it.label == "Экспресс дня" }.route)
        assertFalse(sport.first { it.label == "Экспресс дня" }.soon)
        assertEquals("sports/results", sport.first { it.label == "Результаты" }.route)
        assertFalse(sport.first { it.label == "Результаты" }.soon)
        assertTrue(sport.first { it.label == "Стрим" }.soon)
        assertEquals("sports/live", sport.first { it.label == "LIVE" }.route)
        assertEquals("sports/line", sport.first { it.label == "Линия" }.route)
        assertEquals("sports/cybers", sport.first { it.label == "Киберспорт" }.route)
        assertEquals("provider-sportsbook", sport.first { it.label == "Спортбук провайдера" }.route)
    }
}
