package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.sportsbook.ChampionshipsDirectory
import com.nextpari.app.feature.sportsbook.CompetitionDirectory
import com.nextpari.app.feature.sportsbook.CountryGrouping

/**
 * Debug-only championships directory host. Not a launcher. Does not place wagers.
 */
class ChampionshipsDirectoryCheckActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val widthDp = intent.getIntExtra("widthDp", 390).coerceIn(360, 430)
        val dark = intent.getBooleanExtra("dark", true)
        val live = intent.getBooleanExtra("live", true)
        val expanded = intent.getStringExtra("expanded").orEmpty()
        enableEdgeToEdge()
        setContent {
            NextpariTheme(darkTheme = dark) {
                ChampionshipsDirectoryGallery(widthDp, live, expanded)
            }
        }
    }
}

@Composable
private fun ChampionshipsDirectoryGallery(widthDp: Int, live: Boolean, initialExpanded: String) {
    val colors = NextpariTheme.colors
    val matches = if (live) liveFixtures else lineFixtures
    val directory = CompetitionDirectory.organize(CountryGrouping.groupByCountry(matches), emptySet())
    var expanded by rememberSaveable { mutableStateOf(initialExpanded) }
    LaunchedEffect(directory.countries.map { it.country }, initialExpanded) {
        expanded = if (initialExpanded.isNotEmpty()) {
            directory.countries.firstOrNull { it.country.equals(initialExpanded, true) }?.country ?: initialExpanded
        } else {
            CountryGrouping.nextExpanded(directory.countries, expanded)
        }
    }
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(top = 24.dp),
    ) {
        Text(
            "Championships ${if (live) "LIVE" else "Line"}  ${widthDp}.dp",
            color = colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Column(Modifier.width(widthDp.dp).fillMaxSize()) {
            ChampionshipsDirectory(
                directory = directory,
                dark = true,
                favorites = emptySet(),
                expanded = expanded,
                onToggle = { country -> expanded = if (expanded == country) "" else country },
                onLeague = {},
                onFavorite = {},
            )
        }
    }
}

private fun fixture(id: String, league: String, country: String, live: Boolean, competitionId: String? = null) =
    MatchCardModel(
        id = id,
        eventId = id,
        sport = "football",
        league = league,
        country = country,
        team1 = "Home $id",
        team2 = "Away $id",
        isLive = live,
        competitionId = competitionId,
    )

private val liveFixtures = listOf(
    fixture("ucl-1", "UEFA Champions League", "International", true),
    fixture("ucl-2", "UEFA Champions League", "International", true),
    fixture("uel-1", "UEFA Europa League", "Europe", true),
    fixture("uecl-1", "UEFA Conference League", "UEFA", true),
    fixture("unl-1", "UEFA Nations League", "World", true, "football:int:uefa-nations-league"),
    fixture("pl-1", "Premier League", "England", true),
    fixture("pl-2", "Premier League", "England", true),
    fixture("fa-1", "FA Cup", "England", true),
    fixture("ch-1", "Championship", "England", true),
    fixture("bl-1", "Bundesliga", "Germany", true),
    fixture("bl-2", "Bundesliga", "Germany", true),
    fixture("bl2-1", "2. Bundesliga", "Germany", true),
    fixture("ll-1", "LaLiga", "Spain", true),
    fixture("ll-2", "LaLiga", "Spain", true),
    fixture("seg-1", "Segunda División", "Spain", true),
)

private val lineFixtures = liveFixtures.mapIndexed { index, match ->
    match.copy(id = "line-$index", eventId = "line-$index", isLive = false)
} + listOf(
    fixture("pl-line", "Premier League", "England", false),
    fixture("bl-line", "Bundesliga", "Germany", false),
)
