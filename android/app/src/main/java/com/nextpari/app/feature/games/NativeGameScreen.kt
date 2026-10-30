package com.nextpari.app.feature.games

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.delay

@Composable
fun NativeGameScreen(gameCode: String, title: String, onBack: () -> Unit) {
    if (AppGraph.gameRepository == null) {
        GameMessage(title, onBack, "Игра временно недоступна")
        return
    }
    val model: GamePlayViewModel = viewModel(key = gameCode, factory = GamePlayViewModel.factory(gameCode))
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.syncBalance() }
    LaunchedEffect(state.round?.roundId, state.round?.state, state.busy) {
        if (model.spec.code == "aviator" && state.round?.state == "open" && !state.busy) {
            while (true) {
                delay(1000)
                model.refreshAviator()
            }
        }
    }
    GameStage(
        title = title,
        spec = model.spec,
        state = state,
        onBack = onBack,
        onStake = model::setStake,
        onPlay = { options -> model.play(options) },
        onAct = model::act,
    )
}

@Composable
private fun GameMessage(title: String, onBack: () -> Unit, message: String) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg).statusBarsPadding().navigationBarsPadding().padding(20.dp)) {
        Text(title, color = colors.text, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        Text(message, color = colors.text, modifier = Modifier.padding(top = 16.dp))
        Text(
            "Назад",
            color = colors.accent,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp).clickable(onClick = onBack),
        )
    }
}
