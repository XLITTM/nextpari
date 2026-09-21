package com.nextpari.app.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun WalletScreen(
    viewModel: WalletViewModel = viewModel(factory = WalletViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NpBackground)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text("Кошелёк", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(12.dp))
        NextpariCard {
            Text("Баланс", color = NpTextSecondary)
            Text(
                "${state.snapshot.displayBalance} ${state.snapshot.currency}",
                color = NpText,
                style = androidx.compose.material3.MaterialTheme.typography.headlineMedium,
            )
            Text(state.snapshot.note, color = NpTextMuted)
        }
        Spacer(Modifier.height(12.dp))
        NextpariCard {
            Text("Пополнение", color = NpText)
            Text("Методы депозита будут подключены к существующему Nextpari wallet. Операции сейчас недоступны.", color = NpTextMuted)
        }
        Spacer(Modifier.height(12.dp))
        NextpariCard {
            Text("Вывод", color = NpText)
            Text("Вывод наличных и crypto пойдёт через сервер. Android не дублирует Wallet Ledger.", color = NpTextMuted)
        }
        Spacer(Modifier.height(12.dp))
        Text("История операций", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        state.transactions.forEach { row ->
            NextpariCard {
                Text(row.title, color = NpText)
                Text("${row.amount} · ${row.status}", color = NpTextSecondary)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
