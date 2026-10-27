package com.nextpari.app.feature.games

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.delay

@Composable
fun NativeGameScreen(
    gameCode: String,
    title: String,
    onBack: () -> Unit,
) {
    if (AppGraph.gameRepository == null) {
        GameMessage(title, onBack, "Игра временно недоступна")
        return
    }
    val viewModel: GamePlayViewModel = viewModel(
        key = gameCode,
        factory = GamePlayViewModel.factory(gameCode),
    )
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val spec = GameSpecs.forCode(gameCode)
    val round = state.round
    val open = round?.state == "open"
    LaunchedEffect(Unit) { viewModel.syncBalance() }
    LaunchedEffect(round?.roundId, round?.state, state.busy) {
        if (gameCode != GameSpecs.aviator.code || !open || state.busy) return@LaunchedEffect
        while (true) {
            delay(1000)
            viewModel.refreshAviator()
        }
    }
    val colors = NextpariTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text(title, color = colors.text, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        Text("Баланс ${state.balanceLabel}", color = colors.textSecondary, modifier = Modifier.padding(top = 8.dp))
        if (state.blocked) {
            Text(
                state.error ?: "Игра временно недоступна",
                color = colors.text,
                modifier = Modifier.padding(top = 20.dp),
            )
        } else {
            if (!open) {
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = state.stakeText,
                    onValueChange = viewModel::setStake,
                    enabled = !state.busy,
                    label = { Text("Ставка") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Минимум ${spec.minStake}",
                    color = colors.textMuted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Spacer(Modifier.height(16.dp))
                NextpariButton(
                    text = "Играть",
                    onClick = { viewModel.play() },
                    enabled = !state.busy,
                )
            }
            if (round != null) {
                Text(
                    describeRound(gameCode, round),
                    color = colors.text,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
            if (!state.sessionNote.isNullOrBlank()) {
                Text(state.sessionNote ?: "", color = colors.textSecondary, modifier = Modifier.padding(top = 8.dp))
            }
            if (open && round != null) {
                Spacer(Modifier.height(16.dp))
                GameActions(spec, round, state.busy, viewModel::act)
            }
            if (!state.error.isNullOrBlank()) {
                Text(state.error ?: "", color = colors.danger, modifier = Modifier.padding(top = 12.dp))
            }
        }
        Text(
            "Назад",
            color = colors.accent,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp).clickable(onClick = onBack),
        )
    }
}

@Composable
private fun GameActions(
    spec: GameSpec,
    round: PlayerGameRound,
    busy: Boolean,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val allowed = round.allowedActions.intersect(spec.actions)
    if (allowed.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if ("hit" in allowed) NextpariButton(text = "Ещё", onClick = { onAct("hit", emptyMap()) }, enabled = !busy)
        if ("stand" in allowed) NextpariButton(text = "Хватит", onClick = { onAct("stand", emptyMap()) }, enabled = !busy)
        if ("pick" in allowed) {
            repeat(appleColumns(round)) { index ->
                NextpariButton(
                    text = "Яблоко ${index + 1}",
                    onClick = { onAct("pick", mapOf("col" to index.toString())) },
                    enabled = !busy,
                )
            }
        }
        if ("cashout" in allowed) NextpariButton(text = "Забрать", onClick = { onAct("cashout", emptyMap()) }, enabled = !busy)
    }
}

@Composable
private fun GameMessage(title: String, onBack: () -> Unit, message: String) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg).padding(20.dp)) {
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
