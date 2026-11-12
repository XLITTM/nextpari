package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun FootballFeedControl(loading: Boolean, notice: String?, retryable: Boolean, onRefresh: () -> Unit) {
    if (loading || !retryable || notice.isNullOrBlank()) return
    val colors = NextpariTheme.colors
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(notice, color = colors.textSecondary, modifier = Modifier.weight(1f))
        TextButton(onClick = onRefresh) { Text("Повторить") }
    }
}

@Composable
fun SportsCouponScreen(
    state: SportsbookUiState,
    walletId: String?,
    walletCurrency: String?,
    onStake: (String) -> Unit,
    onRemove: (SportsBetSelection) -> Unit,
    onSubmit: () -> Unit,
    onHistory: () -> Unit,
) {
    val colors = NextpariTheme.colors
    val editable = !state.placing && !state.retryRequired
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Купон", color = colors.text, fontWeight = FontWeight.Bold)
        state.acceptedBetId?.let { Text("Ставка принята сервером. Номер: $it", color = colors.text) }
        if (state.selections.isEmpty() && state.acceptedBetId == null) {
            Text("Добавьте коэффициент из матча", color = colors.textSecondary)
        }
        if (state.selections.isNotEmpty()) {
            if (!state.picksCurrent && !state.retryRequired) {
                Text("Обновите коэффициенты и выберите исходы заново", color = colors.textSecondary)
            }
            Text(if (state.selections.size == 1) "Ординар" else "Экспресс", color = colors.textSecondary)
            for (pick in state.selections) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(pick.matchLabel, color = colors.text, fontWeight = FontWeight.Medium)
                        Text("${pick.outcomeName} • ${pick.price}", color = colors.textSecondary)
                    }
                    TextButton(enabled = editable, onClick = { onRemove(pick) }) { Text("Убрать") }
                }
                HorizontalDivider()
            }
            OutlinedTextField(
                value = state.stakeText,
                onValueChange = onStake,
                enabled = editable,
                label = { Text(walletCurrency?.let { "Сумма ($it)" } ?: "Сумма") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (walletId.isNullOrBlank()) Text("Активный кошелёк недоступен", color = colors.textSecondary)
            Button(
                enabled = !state.placing && !walletId.isNullOrBlank() && state.stakeText.isNotBlank() &&
                    (state.picksCurrent || state.retryRequired),
                onClick = onSubmit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(when {
                    state.placing -> "Отправка…"
                    state.retryRequired -> "Повторить отправку"
                    else -> "Сделать ставку"
                })
            }
        }
        state.couponNotice?.let { Text(it, color = colors.textSecondary) }
        if (state.retryRequired || state.acceptedBetId != null) {
            TextButton(onClick = onHistory) { Text("История ставок") }
        }
    }
}
