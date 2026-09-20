package com.nextpari.app.feature.profile

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun ProfileScreen(
    session: AuthSession,
    onOpenSettings: () -> Unit,
    onLogout: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NpBackground)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text("Профиль", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(12.dp))
        ProfileRow("ID игрока", session.playerPublicId.ifBlank { "DEV001" })
        ProfileRow("Личные данные", "Не заполнены")
        ProfileRow("Email", "hidden@nextpari.dev")
        ProfileRow("Телефон", "+993 ••••••")
        ProfileRow("Верификация", "Не подтверждена")
        ProfileRow("Безопасность", "Двухфакторная защита")
        Spacer(Modifier.height(8.dp))
        NextpariCard(onClick = onOpenSettings) {
            Text("Настройки", color = NpText)
            Text("Тема и служебные параметры", color = NpTextMuted)
        }
        Spacer(Modifier.height(16.dp))
        NextpariButton(text = "Выйти", onClick = onLogout)
    }
}

@Composable
private fun ProfileRow(label: String, value: String) {
    NextpariCard {
        Text(label, color = NpTextSecondary)
        Text(value, color = NpText)
    }
    Spacer(Modifier.height(8.dp))
}
