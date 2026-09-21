package com.nextpari.app.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(NpBackground)) {
        NextpariTopBar("Настройки", Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(Modifier.padding(20.dp)) {
            NextpariCard {
                Text("Тема", color = NpText)
                Text("Тёмная премиум-тема Nextpari (A001).", color = NpTextMuted)
            }
            Spacer(Modifier.height(10.dp))
            NextpariCard {
                Text("Сеть", color = NpText)
                Text("Базовый URL задаётся через BuildConfig. Секреты в приложение не кладутся.", color = NpTextMuted)
            }
            Spacer(Modifier.height(10.dp))
            NextpariCard {
                Text("Хранение сессии", color = NpText)
                Text("Production-токены должны храниться в Android Keystore. DataStore — только для несущных настроек.", color = NpTextMuted)
            }
        }
    }
}
