package com.nextpari.app.feature.sportsbook

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CompactMarketLayoutTest {
    private fun outcome(
        label: String,
        line: String? = "-1.5",
        outcomeId: String? = null,
        family: String = "handicap",
        odds: String? = "1.90",
    ) = MarketOutcome(
        eventId = "oddspapi-v5:id1",
        marketId = "20",
        marketKey = family,
        line = line,
        outcomeId = outcomeId,
        label = label,
        odds = odds,
        locked = odds == null,
    )

    private fun group(
        family: String,
        name: String,
        line: String?,
        outcomes: List<MarketOutcome>,
    ) = MarketGroup(
        key = family,
        name = name,
        marketId = "20",
        category = "main",
        lineCount = 1,
        outcomes = outcomes,
        family = family,
        rows = listOf(MarketLine(line, outcomes)),
    )

    @Test
    fun ordinaryHandicapUsesTeamNumbersAndParenthesesWithoutPlus() {
        val home = outcome("Ф1", "-2.5", "home")
        val away = outcome("Ф2", "-2.5", "away")
        val market = group("handicap", "Фора", "-2.5", listOf(away, home))
        assertEquals("1 (-2.5)", CompactMarketLayout.buttonLabel(market, "-2.5", home))
        assertEquals("2 (2.5)", CompactMarketLayout.buttonLabel(market, "-2.5", away))
        assertEquals(listOf(home, away), CompactMarketLayout.ordered(market, listOf(away, home)))
        assertTrue(CompactMarketLayout.hideLineColumn(market))
        assertFalse(CompactMarketLayout.buttonLabel(market, "-2.5", home).contains("Ф1"))
        assertFalse(CompactMarketLayout.buttonLabel(market, "-2.5", home).contains("K1"))
        assertEquals("1 (0)", CompactMarketLayout.handicapLabel("0", outcome("П1", "0", "1")))
        assertEquals("2 (0)", CompactMarketLayout.handicapLabel("0", outcome("П2", "0", "2")))
        assertEquals("1 (1)", CompactMarketLayout.handicapLabel("1", outcome("1", "1", "home")))
        assertEquals("2 (-1)", CompactMarketLayout.handicapLabel("1", outcome("2", "1", "away")))
        assertEquals("1 (1)", CompactMarketLayout.handicapLabel("+1", outcome("home", "+1", "home")))
        assertEquals("1.5", CompactMarketLayout.formatLine("+1.5"))
        assertFalse(CompactMarketLayout.formatLine("1.5")!!.startsWith("+"))
    }

    @Test
    fun asianQuarterLinesStaySignedAndSeparateFromEuropeanThreeWay() {
        val home = outcome("1", "-0.25", "home", "asian-handicap")
        val away = outcome("2", "-0.25", "away", "asian-handicap")
        val asian = group("asian-handicap", "Азиатская фора", "-0.25", listOf(home, away))
        assertEquals("1 (-0.25)", CompactMarketLayout.buttonLabel(asian, "-0.25", home))
        assertEquals("2 (0.25)", CompactMarketLayout.buttonLabel(asian, "-0.25", away))
        val europeanOutcomes = listOf(
            outcome("П1", "-1", "home", "european-handicap"),
            outcome("X", "-1", "draw", "european-handicap"),
            outcome("П2", "-1", "away", "european-handicap"),
        )
        val european = group("european-handicap", "Европейская фора", "-1", europeanOutcomes)
        assertEquals("П1", CompactMarketLayout.buttonLabel(european, "-1", europeanOutcomes[0]))
        assertEquals("X", CompactMarketLayout.buttonLabel(european, "-1", europeanOutcomes[1]))
        assertEquals("П2", CompactMarketLayout.buttonLabel(european, "-1", europeanOutcomes[2]))
        assertTrue(CompactMarketLayout.showEuropeanLine(european))
        assertFalse(CompactMarketLayout.hideLineColumn(european))
        assertEquals(listOf("П1", "X", "П2"), CompactMarketLayout.ordered(european, europeanOutcomes.reversed()).map { it.label })
    }

    @Test
    fun totalsUseCompactBmWithoutALineColumn() {
        fun total(family: String, name: String, line: String, over: String = "ТБ", under: String = "ТМ"): MarketGroup {
            val outcomes = listOf(
                outcome(under, line, "under", family),
                outcome(over, line, "over", family),
            )
            return group(family, name, line, outcomes)
        }
        val full = total("totals", "Тотал", "2.5", "Больше", "Меньше")
        assertEquals("(2.5) Б", CompactMarketLayout.buttonLabel(full, "2.5", full.outcomes[1]))
        assertEquals("(2.5) М", CompactMarketLayout.buttonLabel(full, "2.5", full.outcomes[0]))
        assertEquals(listOf("over", "under"), CompactMarketLayout.ordered(full, full.outcomes).map { it.outcomeId })
        assertTrue(CompactMarketLayout.hideLineColumn(full))
        assertEquals("(0.5) Б", CompactMarketLayout.totalLabel("0.5", outcome("ТБ", "0.5", "over", "totals")))
        assertEquals("(2.25) М", CompactMarketLayout.buttonLabel(total("asian-totals", "Азиатский тотал", "2.25"), "2.25", outcome("ТМ", "2.25", "under", "asian-totals")))
        assertEquals("(1.5) Б", CompactMarketLayout.buttonLabel(total("team-totals", "Индивидуальный тотал 1", "1.5"), "1.5", outcome("ТБ 1.5", "1.5", "over", "team-totals")))
        assertEquals("(0.5) М", CompactMarketLayout.buttonLabel(total("totals", "1-й тайм · Тотал", "0.5"), "0.5", outcome("ТМ", "0.5", "under", "totals")))
        assertEquals("(8.5) Б", CompactMarketLayout.buttonLabel(total("totals-corners", "Тотал угловых", "8.5"), "8.5", outcome("ТБ", "8.5", "over", "totals-corners")))
        assertEquals("(3.5) М", CompactMarketLayout.buttonLabel(total("totals-bookings", "Тотал карточек", "3.5"), "3.5", outcome("ТМ", "3.5", "under", "totals-bookings")))
    }

    @Test
    fun missingOppositeSelectionIsNotInventedAndRawLineStaysUnchanged() {
        val homeOnly = outcome("Ф1", "-1.5", "home")
        val market = group("handicap", "Фора", "-1.5", listOf(homeOnly))
        assertEquals(listOf(homeOnly), CompactMarketLayout.ordered(market, market.outcomes))
        assertEquals("1 (-1.5)", CompactMarketLayout.buttonLabel(market, "-1.5", homeOnly))
        assertEquals("-1.5", homeOnly.line)
        assertNull(CompactMarketLayout.handicapLabel("-1.5", outcome("Unknown", "-1.5", "other")))
        assertEquals("Unknown", CompactMarketLayout.buttonLabel(market.copy(outcomes = listOf(outcome("Unknown", "-1.5", "other"))), "-1.5", outcome("Unknown", "-1.5", "other")))
        val accordion = moduleFile("src/main/java/com/nextpari/app/feature/sportsbook/MarketAccordion.kt").readText()
        assertTrue(accordion.contains("CompactMarketLayout.buttonLabel"))
        assertTrue(accordion.contains("hideLineColumn"))
        assertFalse(accordion.contains("K1"))
        val grid = moduleFile("src/main/java/com/nextpari/app/feature/sportsbook/MarketsGrid.kt").readText()
        assertTrue(grid.contains("MarketModeControl"))
        assertTrue(grid.contains("DropdownMenu"))
        assertTrue(grid.contains("LayoutGrid"))
        assertFalse(grid.contains("items(modes"))
    }

    @Test
    fun oddsPapiNumericOutcomeIdsStillPairFromProviderLabels() {
        val home = outcome("П1", "-1.5", "16")
        val away = outcome("П2", "-1.5", "17")
        val market = group("handicap", "Фора", "-1.5", listOf(home, away))
        assertEquals("1 (-1.5)", CompactMarketLayout.buttonLabel(market, "-1.5", home))
        assertEquals("2 (1.5)", CompactMarketLayout.buttonLabel(market, "-1.5", away))
        assertEquals("-1.5", home.line)
        assertEquals("-1.5", away.line)
    }

    @Test
    fun footballMainOrderPlacesBttsImmediatelyAfterTotals() {
        val order = listOf(
            "result", "double-chance", "totals", "btts", "handicap",
            "team-totals", "correct-score", "asian-totals", "asian-handicap",
            "asian-team-totals", "odd-even", "european-handicap", "first-goal", "last-goal",
        )
        val ranks = order.map { SportMarketStructure.footballFamilyOrder(it) }
        assertEquals(ranks, ranks.sorted())
        assertEquals(6, SportMarketStructure.footballFamilyOrder("team-totals", "Индивидуальный тотал 1"))
        assertEquals(7, SportMarketStructure.footballFamilyOrder("team-totals", "Индивидуальный тотал 2"))
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File("app/$relative"), File("android/app/$relative"), File(relative))
        return candidates.first { it.exists() }
    }
}
