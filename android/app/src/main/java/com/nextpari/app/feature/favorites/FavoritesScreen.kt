package com.nextpari.app.feature.favorites

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.sportsbook.SportsbookViewModel

@Composable
fun FavoritesScreen(sportsbook: SportsbookViewModel, onOpenMatch: (String) -> Unit,
    onOpenLeague: (String) -> Unit = {}, onOpenSport: (String) -> Unit = {}) {
    val favorites by AppGraph.sportsFavorites.favorites.collectAsStateWithLifecycle()
    val sports by sportsbook.state.collectAsStateWithLifecycle()
    val matches = (sportsbook.live() + sportsbook.line()).filter { it.id in sports.favoriteMatchIds }.distinctBy { it.id }
    val colors = NextpariTheme.colors
    LaunchedEffect(Unit) { AppGraph.sportsFavorites.load() }
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 16.dp),
    ) {
        Text("Избранное", color = colors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        if (favorites.leagueIds.isEmpty() && favorites.sportIds.isEmpty() && sports.favoriteMatchIds.isEmpty()) {
            Text(
                "В избранном пока нет событий.",
                color = colors.textMuted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(top = 12.dp),
            )
        } else {
            matches.forEach { match ->
                TextButton(onClick = { onOpenMatch(match.id) }) { Text("${match.team1} — ${match.team2}") }
            }
            if (sports.favoriteMatchIds.isNotEmpty() && matches.isEmpty()) {
                Text("Сохранённые матчи сейчас вне ленты", color = colors.textMuted, modifier = Modifier.padding(top = 12.dp))
            }
            favorites.sportIds.forEach { id ->
                TextButton(onClick={onOpenSport(id)}) { Text(com.nextpari.app.feature.sportsbook.SportsListCatalog.sportName(id),color=colors.text) }
            }
            favorites.leagueIds.forEach { id ->
                val active = (sportsbook.leagueMatches(id,"live")+sportsbook.leagueMatches(id,"line")).firstOrNull()
                TextButton(onClick={onOpenLeague(id)},enabled=active!=null) {
                    Text(active?.league ?: if(id.startsWith("canonical:")||id.startsWith("source:")||id.startsWith("display|"))"Турнир сейчас вне ленты" else id,color=colors.text)
                }
            }
        }
    }
}
