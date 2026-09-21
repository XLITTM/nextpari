package com.nextpari.app.feature.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.ui.components.EmptyState
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().background(NpBackground)) {
        Text(
            "История",
            color = NpText,
            style = androidx.compose.material3.MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(20.dp),
        )
        TabRow(
            selectedTabIndex = tab,
            containerColor = NpBackground,
            contentColor = NpText,
            indicator = { positions ->
                TabRowDefaults.SecondaryIndicator(
                    modifier = Modifier.tabIndicatorOffset(positions[tab]),
                    color = NpAccent,
                )
            },
        ) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Ставки") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Транзакции") })
        }
        if (tab == 0) {
            if (state.bets.isEmpty()) {
                EmptyState("Ставок пока нет")
            } else {
                Column(Modifier.padding(16.dp)) {
                    state.bets.forEach { Text(it.title, color = NpText) }
                }
            }
        } else {
            Column(Modifier.padding(16.dp)) {
                state.transactions.forEach { row ->
                    NextpariCard {
                        Text(row.title, color = NpText)
                        Text(row.amount, color = NpTextSecondary)
                    }
                    androidx.compose.foundation.layout.Spacer(Modifier.padding(bottom = 8.dp))
                }
                Text("Строки mock. Авторитетная история — на сервере.", color = NpTextMuted, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}
