package com.nextpari.app.feature.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.ui.components.EmptyState
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    LaunchedEffect(Unit) { viewModel.refresh() }
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        Text(
            "История",
            color = colors.text,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
        )
        when {
            state.loading -> Text("Загрузка ставок...", color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))
            state.error != null -> Text(state.error.orEmpty(), color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))
            state.bets.isEmpty() -> EmptyState("Ставок пока нет")
            else -> Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                state.bets.forEach { row ->
                    NextpariCard {
                        Text(row.title, color = colors.text)
                        if (row.status.isNotBlank()) Text(row.status, color = colors.textMuted)
                        val money = listOf(row.stake, row.currency).filter { it.isNotBlank() }.joinToString(" ")
                        val odds = if (row.odds.isBlank()) "" else " · ${row.odds}"
                        if (money.isNotBlank() || odds.isNotBlank()) {
                            Text(money + odds, color = colors.text)
                        }
                    }
                    Spacer(Modifier.padding(bottom = 8.dp))
                }
            }
        }
    }
}
