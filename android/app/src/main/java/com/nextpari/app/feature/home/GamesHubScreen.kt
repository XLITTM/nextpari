package com.nextpari.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun GamesHubScreen(
    games: List<HubGame>,
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar("Games", Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Мини-игры и аркады. Движки в A002 не портируются.", color = colors.textMuted)
            games.forEach { game ->
                NextpariCard(onClick = { onOpen(game.route) }) {
                    Text(game.name, color = colors.text, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}
