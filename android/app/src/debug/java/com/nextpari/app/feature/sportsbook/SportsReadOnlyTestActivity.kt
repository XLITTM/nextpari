package com.nextpari.app.feature.sportsbook

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.FakeHomeCatalogRepository

/** Instrumentation-only host for the existing screens; never supplies preview fixtures. */
class SportsReadOnlyTestActivity : ComponentActivity() {
    companion object {
        internal var snapshot: FootballSnapshot? = null
        internal var screen by mutableStateOf("sports")
        internal var dark by mutableStateOf(false)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val source = checkNotNull(snapshot) { "Only a production-read instrumentation session can open this activity" }
        val repository = object : FootballRepository {
            override suspend fun read(eventId: String?): FootballSnapshot = source.copy(fixtures=source.fixtures.filter { eventId==null || it.match.eventId==eventId })
            override suspend fun readOdds(eventIds: List<String>) = FootballOddsBatch(emptyMap())
            override suspend fun place(request: SportsBetRequest): SportsBetResult = SportsBetResult.Rejected("SPORTS_BET_DISABLED")
        }
        val vm=ViewModelProvider(this,object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T = SportsbookViewModel(FakeHomeCatalogRepository(),repository).also {
                it.setPlayer("instrumentation-public-read");it.refreshFeed()
            } as T
        })[SportsbookViewModel::class.java]
        setContent {
            NextpariTheme(darkTheme=dark) {
                val nav=rememberNavController()
                androidx.compose.runtime.LaunchedEffect(screen) { nav.navigate(screen) }
                NavHost(nav,"sports",modifier=Modifier.systemBarsPadding()) {
                    composable("sports") { SportsListScreen("line",{finish()},nav::navigate,vm) }
                    composable(Destinations.CHAMPIONSHIPS) { entry -> ChampionshipsScreen(entry.arguments?.getString("sport").orEmpty(),entry.arguments?.getString("mode").orEmpty(),{nav.popBackStack()},nav::navigate,vm) }
                    composable("league/{leagueId}") { entry -> LeagueScreen(entry.arguments?.getString("leagueId").orEmpty(),"line",{nav.popBackStack()},nav::navigate,vm) }
                    composable(Destinations.MATCH) { entry -> MatchDetailsScreen(entry.arguments?.getString("matchId").orEmpty(),{nav.popBackStack()},nav::navigate,vm) }
                }
            }
        }
    }
}
