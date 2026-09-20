package com.nextpari.app.feature.auth

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted

@Composable
fun RegisterMenuScreen(
    onBack: () -> Unit,
    onEmail: () -> Unit,
    onPhone: () -> Unit,
    onOneClick: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(NpBackground)) {
        NextpariTopBar("Регистрация", Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(Modifier.padding(20.dp)) {
            Text("Выберите способ", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            Text("UI только. Реальные пользователи не создаются.", color = NpTextMuted)
            Spacer(Modifier.height(16.dp))
            NextpariCard(onClick = onEmail) { Text("Email", color = NpText) }
            Spacer(Modifier.height(10.dp))
            NextpariCard(onClick = onPhone) { Text("Телефон", color = NpText) }
            Spacer(Modifier.height(10.dp))
            NextpariCard(onClick = onOneClick) { Text("One-click", color = NpText) }
        }
    }
}

@Composable
fun RegisterEmailScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    RegisterFormScreen(
        title = "Регистрация по email",
        fieldLabel = "Email",
        keyboardType = KeyboardType.Email,
        onBack = onBack,
        onPrepared = onPrepared,
    )
}

@Composable
fun RegisterPhoneScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    RegisterFormScreen(
        title = "Регистрация по телефону",
        fieldLabel = "Телефон",
        keyboardType = KeyboardType.Phone,
        onBack = onBack,
        onPrepared = onPrepared,
    )
}

@Composable
fun RegisterOneClickScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    Column(Modifier.fillMaxSize().background(NpBackground)) {
        NextpariTopBar("One-click", Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(Modifier.padding(20.dp)) {
            Text(
                "Однокликовая регистрация будет подключена к существующему Nextpari backend. Сейчас пользователь не создаётся.",
                color = NpTextMuted,
            )
            Spacer(Modifier.height(20.dp))
            NextpariButton(text = "Продолжить позже", onClick = onPrepared)
        }
    }
}

@Composable
private fun RegisterFormScreen(
    title: String,
    fieldLabel: String,
    keyboardType: KeyboardType,
    onBack: () -> Unit,
    onPrepared: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(NpBackground)) {
        NextpariTopBar(title, Icons.AutoMirrored.Filled.ArrowBack, onBack)
        Column(Modifier.padding(20.dp)) {
            var identifier by rememberSaveable { mutableStateOf("") }
            var password by rememberSaveable { mutableStateOf("") }
            Text("Интерфейс подготовлен. Backend-контракт не выдуман.", color = NpTextMuted)
            Spacer(Modifier.height(16.dp))
            NextpariField(
                value = identifier,
                onValueChange = { identifier = it },
                label = fieldLabel,
                keyboardType = keyboardType,
            )
            Spacer(Modifier.height(12.dp))
            NextpariField(
                value = password,
                onValueChange = { password = it },
                label = "Пароль",
                keyboardType = KeyboardType.Password,
                password = true,
            )
            Spacer(Modifier.height(20.dp))
            NextpariButton(text = "Отправить позже", onClick = onPrepared)
        }
    }
}
