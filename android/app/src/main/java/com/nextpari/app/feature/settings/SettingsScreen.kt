package com.nextpari.app.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.network.NextpariConfig
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun SettingsScreen(
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar("Настройки", Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(Modifier.padding(20.dp)) {
            NextpariCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Тема", color = colors.text)
                        Text(if (darkTheme) "Тёмная" else "Светлая", color = colors.textMuted)
                    }
                    Switch(
                        checked = darkTheme,
                        onCheckedChange = { onToggleTheme() },
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            NextpariCard {
                Text("Сеть", color = colors.text)
                Text(NextpariConfig.API_BASE_URL, color = colors.textMuted)
                Text("Секреты в приложение не кладутся. A002 не делает authenticated production calls.", color = colors.textMuted)
            }
            Spacer(Modifier.height(10.dp))
            NextpariCard {
                Text("Хранение сессии", color = colors.text)
                Text("Production-токены должны храниться в Android Keystore. DataStore — только для несущных настроек.", color = colors.textMuted)
            }
        }
    }
}
