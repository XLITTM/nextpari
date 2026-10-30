package com.nextpari.app.feature.favorites

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
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

@Composable
fun FavoritesScreen() {
    val favorites by AppGraph.sportsFavorites.favorites.collectAsStateWithLifecycle()
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
        if (favorites.leagueIds.isEmpty() && favorites.sportIds.isEmpty() && favorites.matchIds.isEmpty()) {
            Text(
                "В избранном пока нет событий. Лента матчей не подключена, поэтому сюда попадают только сохранённые виды спорта и чемпионаты.",
                color = colors.textMuted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(top = 12.dp),
            )
        } else {
            favorites.sportIds.forEach { id ->
                Text(id, color = colors.text, modifier = Modifier.padding(top = 12.dp))
            }
            favorites.leagueIds.forEach { id ->
                Text(id, color = colors.text, modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
}
