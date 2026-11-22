package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
                "0.2.3 forced ${LEGACY_MIN_HEIGHT.value.toInt()}.dp — empty bottom",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
        item {
            LegacyMinHeightFrame(viewportWidth) {
                MeasuredCard("Home LIVE 1-line", liveOneLine, carousel = true, carouselWidth = carouselWidth)
            }
        }
        item {
            Text(
                "Popular LIVE — Home  ${viewportWidth.value.toInt()}.dp",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
        item { MeasuredCard("LIVE 1-line 1X2", liveOneLine, carousel = true, carouselWidth = carouselWidth) }
        item { MeasuredCard("LIVE 2-line names", liveTwoLine, carousel = true, carouselWidth = carouselWidth) }
        item { MeasuredCard("LIVE locked 1X2", liveLocked, carousel = true, carouselWidth = carouselWidth) }
        item {
            Text(
                "Prematch Line — Game List  ${viewportWidth.value.toInt()}.dp",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
        item { MeasuredCard("Line 1-line 1X2", lineOneLine, carousel = false, viewportWidth = viewportWidth) }
        item { MeasuredCard("Line 2-line names", lineTwoLine, carousel = false, viewportWidth = viewportWidth) }
        item { MeasuredCard("Esports winner", esportsWinner, carousel = false, viewportWidth = viewportWidth) }
        item { MeasuredCard("Esports locked", esportsLocked, carousel = false, viewportWidth = viewportWidth) }
    }
}

@Composable
private fun LegacyMinHeightFrame(viewportWidth: Dp, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Box(
        Modifier
            .width(viewportWidth)
            .height(LEGACY_MIN_HEIGHT)
            .border(2.dp, Color(0xFFFF555F), shape)
            .padding(2.dp),
    ) {
        content()
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

private val LEGACY_MIN_HEIGHT = 210.dp

private val liveOneLine = MatchCardModel(
    id = "verify-live-1",
    sport = "football",
    league = "Premier League",
    country = "England",
    team1 = "Arsenal",
    team2 = "Chelsea",
    isLive = true,
    score = "1 : 0",
    period = "1-й тайм",
    marketTitle = "1X2",
    outcomes = listOf(
        MatchOutcome("1", "1.90", movement = OddsMovement.Up),
        MatchOutcome("X", "3.40"),
        MatchOutcome("2", "4.10", movement = OddsMovement.Down),
    ),
)

private val liveTwoLine = liveOneLine.copy(
    id = "verify-live-2",
    team1 = "Brighton & Hove Albion",
    team2 = "Wolverhampton Wanderers",
    score = "2 : 2",
    period = "2-й тайм",
)

private val liveLocked = liveOneLine.copy(
    id = "verify-live-locked",
    team1 = "Liverpool",
    team2 = "Everton",
    score = "0 : 0",
    outcomes = listOf("1", "X", "2").map { MatchOutcome(it, locked = true) },
)

private val lineOneLine = MatchCardModel(
    id = "verify-line-1",
    sport = "football",
    league = "LaLiga",
    country = "Spain",
    team1 = "Real Madrid",
    team2 = "Sevilla",
    kickoffLabel = "19:00",
    marketTitle = "1X2",
    outcomes = listOf(
        MatchOutcome("1", "1.55"),
        MatchOutcome("X", "4.20"),
        MatchOutcome("2", "6.50"),
    ),
)

private val lineTwoLine = lineOneLine.copy(
    id = "verify-line-2",
    sport = "basketball",
    league = "NBA",
    country = "USA",
    team1 = "Golden State Warriors",
    team2 = "Los Angeles Lakers",
    kickoffLabel = "Tomorrow 04:30",
)

private val esportsWinner = MatchCardModel(
    id = "verify-esports",
    sport = "esports",
    league = "ESL Pro League",
    country = "World",
    team1 = "Natus Vincere",
    team2 = "FaZe Clan",
    kickoffLabel = "21:00",
    marketTitle = "Победитель",
    outcomes = listOf(
        MatchOutcome("П1", "1.72"),
        MatchOutcome("П2", "2.10"),
    ),
)

private val esportsLocked = esportsWinner.copy(
    id = "verify-esports-locked",
    team1 = "Team Spirit",
    team2 = "G2 Esports",
    outcomes = listOf("П1", "П2").map { MatchOutcome(it, locked = true) },
)
