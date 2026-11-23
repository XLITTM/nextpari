package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchOutcome
import com.nextpari.app.feature.home.NextpariMatchCard
import com.nextpari.app.feature.home.OddsMovement
import com.nextpari.app.feature.home.carouselCardWidth

/**
 * Debug-only layout host. Not a launcher. Does not place wagers or load the sports feed.
 */
class MatchCardHeightCheckActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val widthDp = intent.getIntExtra("widthDp", 390).coerceIn(360, 430)
        val dark = intent.getBooleanExtra("dark", true)
        enableEdgeToEdge()
        setContent {
            NextpariTheme(darkTheme = dark) {
                MatchCardHeightGallery(viewportWidth = widthDp.dp)
            }
        }
    }
}

@Composable
private fun MatchCardHeightGallery(viewportWidth: Dp) {
    val colors = NextpariTheme.colors
    val carouselWidth = carouselCardWidth(viewportWidth)
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(colors.bg),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(
                "Popular LIVE — Home  ${viewportWidth.value.toInt()}.dp",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
        item { MeasuredCard("Short Chelsea FC", liveShort, carousel = true, carouselWidth = carouselWidth) }
        item { MeasuredCard("Medium Werder Bremen", liveMedium, carousel = true, carouselWidth = carouselWidth) }
        item { MeasuredCard("Long Mönchengladbach", liveLong, carousel = true, carouselWidth = carouselWidth) }
        item { MeasuredCard("Mixed short / long", liveMixed, carousel = true, carouselWidth = carouselWidth) }
        item {
            Text(
                "Prematch Line — Game List  ${viewportWidth.value.toInt()}.dp",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
        item { MeasuredCard("Forest / Polissya", lineLong, carousel = false, viewportWidth = viewportWidth) }
        item { MeasuredCard("Short Line Chelsea", lineShort, carousel = false, viewportWidth = viewportWidth) }
        item { MeasuredCard("Esports long names", esportsLong, carousel = false, viewportWidth = viewportWidth) }
    }
}

@Composable
private fun MeasuredCard(
    label: String,
    model: MatchCardModel,
    carousel: Boolean,
    carouselWidth: Dp = 320.dp,
    viewportWidth: Dp = 390.dp,
) {
    val density = LocalDensity.current
    var heightDp by remember { mutableStateOf<Dp?>(null) }
    val colors = NextpariTheme.colors
    Column(Modifier.wrapContentHeight()) {
        Text(
            buildString {
                append(label)
                heightDp?.let { append("  ${it.value.toInt()}.dp") }
            },
            color = colors.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        Box(
            Modifier
                .then(if (carousel) Modifier.width(carouselWidth) else Modifier.width(viewportWidth - 24.dp))
                .wrapContentHeight()
                .onGloballyPositioned { heightDp = with(density) { it.size.height.toDp() } },
        ) {
            NextpariMatchCard(
                model = model,
                carousel = carousel,
                onOpen = {},
                carouselWidth = carouselWidth,
            )
        }
    }
}

private val liveOutcomes = listOf(
    MatchOutcome("1", "1.90", movement = OddsMovement.Up),
    MatchOutcome("X", "3.40"),
    MatchOutcome("2", "4.10", movement = OddsMovement.Down),
)

private val liveShort = MatchCardModel(
    id = "verify-live-short",
    sport = "football",
    league = "Premier League",
    country = "England",
    team1 = "Chelsea FC",
    team2 = "Arsenal",
    isLive = true,
    score = "1 : 0",
    period = "1-й тайм",
    marketTitle = "1X2",
    outcomes = liveOutcomes,
)

private val liveMedium = liveShort.copy(
    id = "verify-live-medium",
    team1 = "Werder Bremen",
    team2 = "Nottingham Forest",
    score = "0 : 0",
)

private val liveLong = liveShort.copy(
    id = "verify-live-long",
    team1 = "Borussia Mönchengladbach",
    team2 = "FC Polissya Zhytomyr",
    score = "2 : 1",
)

private val liveMixed = liveShort.copy(
    id = "verify-live-mixed",
    team1 = "Chelsea FC",
    team2 = "Borussia Mönchengladbach",
    score = "1 : 1",
)

private val lineShort = MatchCardModel(
    id = "verify-line-short",
    sport = "football",
    league = "Premier League",
    country = "England",
    team1 = "Chelsea FC",
    team2 = "Arsenal",
    kickoffLabel = "19:00",
    marketTitle = "1X2",
    outcomes = listOf(
        MatchOutcome("1", "1.55"),
        MatchOutcome("X", "4.20"),
        MatchOutcome("2", "6.50"),
    ),
)

private val lineLong = lineShort.copy(
    id = "verify-line-long",
    league = "Bundesliga",
    country = "Germany",
    team1 = "Nottingham Forest",
    team2 = "FC Polissya Zhytomyr",
    kickoffLabel = "Tomorrow 04:30",
)

private val esportsLong = MatchCardModel(
    id = "verify-esports-long",
    sport = "esports",
    league = "ESL Pro League",
    country = "World",
    team1 = "Natus Vincere",
    team2 = "Team Falcons Esports Club",
    kickoffLabel = "21:00",
    marketTitle = "Победитель",
    outcomes = listOf(
        MatchOutcome("П1", "1.72"),
        MatchOutcome("П2", "2.10"),
    ),
)
