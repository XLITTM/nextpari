package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchOutcome
import com.nextpari.app.feature.home.OddsMovement

object SportsbookPreviewData {
    const val MATCH_ID = "preview-debug-football"

    val match = MatchCardModel(
        id = MATCH_ID,
        eventId = MATCH_ID,
        sport = "football",
        league = "Preview League",
        country = "Европа",
        team1 = "Alpha",
        team2 = "Beta",
        isLive = true,
        score = "1 : 0",
        period = "1-й тайм",
        marketTitle = "1X2",
        outcomes = listOf(
            MatchOutcome("1", "1.90", movement = OddsMovement.Up),
            MatchOutcome("X", "3.40"),
            MatchOutcome("2", "4.10", movement = OddsMovement.Down),
        ),
        extraMarkets = 8,
    )

    val markets: List<MarketGroup> = listOf(
        MarketGroup(
            key = "1x2",
            name = "1X2",
            marketId = "1",
            category = "main",
            lineCount = 1,
            outcomes = listOf(
                MarketOutcome(MATCH_ID, "1", "1x2", outcomeId = "1", label = "1", odds = "1.90", movement = OddsMovement.Up),
                MarketOutcome(MATCH_ID, "1", "1x2", outcomeId = "x", label = "X", odds = "3.40"),
                MarketOutcome(MATCH_ID, "1", "1x2", outcomeId = "2", label = "2", odds = "4.10", movement = OddsMovement.Down),
            ),
        ),
        MarketGroup(
            key = "total",
            name = "Тотал",
            marketId = "2",
            category = "totals",
            lineCount = 1,
            outcomes = listOf(
                MarketOutcome(MATCH_ID, "2", "total", line = "2.5", outcomeId = "over", label = "ТБ 2.5", odds = "1.85"),
                MarketOutcome(MATCH_ID, "2", "total", line = "2.5", outcomeId = "under", label = "ТМ 2.5", odds = "1.95"),
            ),
        ),
        MarketGroup(
            key = "handicap",
            name = "Фора",
            marketId = "3",
            category = "handicaps",
            lineCount = 1,
            outcomes = listOf(
                MarketOutcome(MATCH_ID, "3", "ah", line = "-0.5", outcomeId = "home", label = "П1 (-0.5)", odds = "1.72"),
                MarketOutcome(MATCH_ID, "3", "ah", line = "-0.5", outcomeId = "away", label = "П2 (+0.5)", odds = "2.10"),
            ),
        ),
        MarketGroup(
            key = "btts",
            name = "Обе забьют",
            marketId = "btts",
            category = "specials",
            lineCount = 1,
            outcomes = listOf(
                MarketOutcome(MATCH_ID, "btts", "btts", outcomeId = "yes", label = "Да", odds = "1.80"),
                MarketOutcome(MATCH_ID, "btts", "btts", outcomeId = "no", label = "Нет", odds = "1.90", locked = true),
            ),
        ),
    )

    val pinnedKey: String = "total"
}
