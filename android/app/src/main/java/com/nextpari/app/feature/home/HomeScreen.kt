package com.nextpari.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun HomeScreen(
    session: AuthSession,
    onDeposit: () -> Unit,
    onWithdraw: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NpBackground)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text("Nextpari", color = NpAccent, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)
        Text(
            "Здравствуйте, ${session.displayName.ifBlank { "Игрок" }}",
            color = NpText,
            style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
        )
        Text("ID ${session.playerPublicId.ifBlank { "—" }}", color = NpTextSecondary)
        Spacer(Modifier.height(16.dp))
        NextpariCard {
            Text("Баланс", color = NpTextSecondary)
            Text("— TMTM", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            Text("Значение придёт с сервера. Локальный расчёт запрещён.", color = NpTextMuted)
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            NextpariButton(text = "Пополнить", onClick = onDeposit, modifier = Modifier.weight(1f))
            NextpariButton(text = "Вывести", onClick = onWithdraw, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(16.dp))
        NextpariCard {
            Text("Спорт — скоро", color = NpText)
            Text("Букмекерская линия появится позже. Провайдер не подключён.", color = NpTextMuted)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard {
            Text("Казино — скоро", color = NpText)
            Text("Игры провайдера появятся позже. Интеграция не реализована.", color = NpTextMuted)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard {
            Text("Акции", color = NpText)
            Text("Промоматериалы появятся после подключения бонусной системы.", color = NpTextMuted)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard {
            Text("VIP", color = NpText)
            Text("Статус и кешбэк будут загружены с Nextpari backend.", color = NpTextMuted)
        }
    }
}
