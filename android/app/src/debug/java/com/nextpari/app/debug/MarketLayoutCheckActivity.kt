package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.sportsbook.MarketGroup
import com.nextpari.app.feature.sportsbook.MarketLine
import com.nextpari.app.feature.sportsbook.MarketOutcome
import com.nextpari.app.feature.sportsbook.MarketsGrid

/**
 * Debug-only football market layout host. Not a launcher. Does not place wagers.
 */
class MarketLayoutCheckActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val widthDp = intent.getIntExtra("widthDp", 390).coerceIn(360, 430)
        val dark = intent.getBooleanExtra("dark", true)
        enableEdgeToEdge()
        setContent {
            NextpariTheme(darkTheme = dark) {
                MarketLayoutGallery(viewportWidth = widthDp)
            }
        }
    }
}

@Composable
private fun MarketLayoutGallery(viewportWidth: Int) {
    val colors = NextpariTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(top = 24.dp, bottom = 24.dp),
    ) {
        Text(
            "Football markets  ${viewportWidth}.dp",
            color = colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        )
        Column(Modifier.width(viewportWidth.dp).fillMaxWidth()) {
            MarketsGrid(
                sport = "football",
                markets = layoutCheckMarkets,
                initialPinned = setOf("totals", "handicap"),
            )
        }
    }
}

private const val EVENT = "oddspapi-v5:id1"

private fun outcome(
    marketId: String,
    family: String,
    line: String?,
    outcomeId: String,
    label: String,
    odds: String,
) = MarketOutcome(
    eventId = EVENT,
    marketId = marketId,
    marketKey = family,
    line = line,
    outcomeId = outcomeId,
    label = label,
    odds = odds,
    locked = false,
    periodId = "fulltime",
)

private fun pair(
    key: String,
    name: String,
    family: String,
    category: String,
    marketId: String,
    lines: List<Triple<String, String, String>>,
    homeId: String,
    awayId: String,
    homeLabel: String,
    awayLabel: String,
): MarketGroup {
    val rows = lines.map { (line, homeOdds, awayOdds) ->
        val home = outcome(marketId, family, line, homeId, homeLabel, homeOdds)
        val away = outcome(marketId, family, line, awayId, awayLabel, awayOdds)
        MarketLine(line, listOf(home, away))
    }
    return MarketGroup(
        key = key,
        name = name,
        marketId = marketId,
        category = category,
        lineCount = rows.size,
        outcomes = rows.flatMap(MarketLine::outcomes),
        family = family,
        periodId = "fulltime",
        rows = rows,
    )
}

private val layoutCheckMarkets = listOf(
    MarketGroup(
        key = "result",
        name = "1X2",
        marketId = "1",
        category = "main",
        lineCount = 1,
        family = "result",
        periodId = "fulltime",
        outcomes = listOf(
            outcome("1", "result", null, "home", "1", "1.90"),
            outcome("1", "result", null, "draw", "X", "3.40"),
            outcome("1", "result", null, "away", "2", "4.10"),
        ),
    ),
    MarketGroup(
        key = "double-chance",
        name = "Двойной шанс",
        marketId = "10",
        category = "double-chance",
        lineCount = 1,
        family = "double-chance",
        periodId = "fulltime",
        outcomes = listOf(
            outcome("10", "double-chance", null, "1x", "1X", "1.28"),
            outcome("10", "double-chance", null, "12", "12", "1.35"),
            outcome("10", "double-chance", null, "x2", "X2", "1.72"),
        ),
    ),
    pair(
        key = "totals",
        name = "Тотал",
        family = "totals",
        category = "totals",
        marketId = "2",
        lines = listOf(
            Triple("0.5", "1.001", "11.6"),
            Triple("1", "1.021", "10.4"),
            Triple("1.5", "1.254", "3.76"),
            Triple("2", "1.395", "2.975"),
            Triple("2.5", "1.82", "1.99"),
        ),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
    MarketGroup(
        key = "btts",
        name = "Обе забьют",
        marketId = "4",
        category = "btts",
        lineCount = 1,
        family = "btts",
        periodId = "fulltime",
        outcomes = listOf(
            outcome("4", "btts", null, "yes", "Да", "1.80"),
            outcome("4", "btts", null, "no", "Нет", "1.90"),
        ),
    ),
    pair(
        key = "handicap",
        name = "Фора",
        family = "handicap",
        category = "handicaps",
        marketId = "3",
        lines = listOf(
            Triple("-2.5", "8.55", "1.033"),
            Triple("-2", "7.85", "1.055"),
            Triple("-1.5", "4.14", "1.217"),
            Triple("-1", "3.34", "1.325"),
            Triple("0", "1.615", "2.31"),
            Triple("1", "1.128", "5.78"),
            Triple("1.5", "1.072", "6.56"),
        ),
        homeId = "home",
        awayId = "away",
        homeLabel = "П1",
        awayLabel = "П2",
    ),
    pair(
        key = "team-totals-1",
        name = "Индивидуальный тотал 1",
        family = "team-totals",
        category = "totals",
        marketId = "21",
        lines = listOf(Triple("1.5", "1.72", "2.05")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
    pair(
        key = "team-totals-2",
        name = "Индивидуальный тотал 2",
        family = "team-totals",
        category = "totals",
        marketId = "22",
        lines = listOf(Triple("0.5", "1.40", "2.80")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
    pair(
        key = "asian-totals",
        name = "Азиатский тотал",
        family = "asian-totals",
        category = "totals",
        marketId = "31",
        lines = listOf(Triple("2.25", "1.90", "1.90")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
    pair(
        key = "asian-handicap",
        name = "Азиатская фора",
        family = "asian-handicap",
        category = "handicaps",
        marketId = "32",
        lines = listOf(
            Triple("-0.25", "1.95", "1.85"),
            Triple("-0.75", "2.10", "1.72"),
        ),
        homeId = "home",
        awayId = "away",
        homeLabel = "П1",
        awayLabel = "П2",
    ),
    MarketGroup(
        key = "european-handicap",
        name = "Европейская фора",
        marketId = "33",
        category = "handicaps",
        lineCount = 1,
        family = "european-handicap",
        periodId = "fulltime",
        outcomes = listOf(
            outcome("33", "european-handicap", "-1", "home", "П1", "2.40"),
            outcome("33", "european-handicap", "-1", "draw", "X", "3.50"),
            outcome("33", "european-handicap", "-1", "away", "П2", "2.80"),
        ),
        rows = listOf(
            MarketLine(
                "-1",
                listOf(
                    outcome("33", "european-handicap", "-1", "home", "П1", "2.40"),
                    outcome("33", "european-handicap", "-1", "draw", "X", "3.50"),
                    outcome("33", "european-handicap", "-1", "away", "П2", "2.80"),
                ),
            ),
        ),
    ),
    pair(
        key = "totals-p1",
        name = "1-й тайм · Тотал",
        family = "totals",
        category = "totals",
        marketId = "41",
        lines = listOf(Triple("0.5", "1.45", "2.60")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ).copy(periodId = "p1"),
    pair(
        key = "totals-corners",
        name = "Тотал угловых",
        family = "totals-corners",
        category = "corners",
        marketId = "51",
        lines = listOf(Triple("8.5", "1.85", "1.95")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
    pair(
        key = "totals-bookings",
        name = "Тотал карточек",
        family = "totals-bookings",
        category = "cards",
        marketId = "61",
        lines = listOf(Triple("3.5", "1.80", "2.00")),
        homeId = "over",
        awayId = "under",
        homeLabel = "ТБ",
        awayLabel = "ТМ",
    ),
)
