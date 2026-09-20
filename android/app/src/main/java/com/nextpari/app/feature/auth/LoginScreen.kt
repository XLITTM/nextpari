package com.nextpari.app.feature.auth

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpAccentInk
import com.nextpari.app.core.ui.theme.NpBackground
import com.nextpari.app.core.ui.theme.NpDanger
import com.nextpari.app.core.ui.theme.NpSurface
import com.nextpari.app.core.ui.theme.NpText
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onOpenRegister: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NpBackground)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text(text = "Nextpari", color = NpAccent, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)
        Text(text = "Вход в аккаунт", color = NpText, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "DEV/mock: вход только локальный. Production API и Supabase не вызываются.",
            color = NpTextMuted,
        )
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            LoginChip("Email", state.method == LoginMethod.EMAIL) { viewModel.setMethod(LoginMethod.EMAIL) }
            LoginChip("Телефон", state.method == LoginMethod.PHONE) { viewModel.setMethod(LoginMethod.PHONE) }
            LoginChip("ID", state.method == LoginMethod.PLAYER_ID) { viewModel.setMethod(LoginMethod.PLAYER_ID) }
        }
        Spacer(Modifier.height(16.dp))
        val identifierLabel = when (state.method) {
            LoginMethod.EMAIL -> "Email"
            LoginMethod.PHONE -> "Телефон"
            LoginMethod.PLAYER_ID -> "ID игрока"
        }
        NextpariField(
            value = state.identifier,
            onValueChange = viewModel::setIdentifier,
            label = identifierLabel,
            keyboardType = when (state.method) {
                LoginMethod.EMAIL -> KeyboardType.Email
                LoginMethod.PHONE -> KeyboardType.Phone
                LoginMethod.PLAYER_ID -> KeyboardType.Number
            },
        )
        Spacer(Modifier.height(12.dp))
        NextpariField(
            value = state.password,
            onValueChange = viewModel::setPassword,
            label = "Пароль",
            keyboardType = KeyboardType.Password,
            password = true,
        )
        if (state.error != null) {
            Text(text = state.error ?: "", color = NpDanger, modifier = Modifier.padding(top = 12.dp))
        }
        if (state.registerNotice != null) {
            Text(text = state.registerNotice ?: "", color = NpTextSecondary, modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(20.dp))
        NextpariButton(
            text = if (state.loading) "Вход..." else "Войти",
            onClick = viewModel::login,
            enabled = !state.loading,
        )
        TextButton(onClick = onOpenRegister, modifier = Modifier.fillMaxWidth()) {
            Text("Создать аккаунт", color = NpAccent)
        }
    }
}

@Composable
internal fun LoginChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = NpAccent,
            selectedLabelColor = NpAccentInk,
            containerColor = NpSurface,
            labelColor = NpText,
        ),
    )
}

@Composable
internal fun NextpariField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    password: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = NpText,
            unfocusedTextColor = NpText,
            focusedBorderColor = NpAccent,
            unfocusedBorderColor = NpTextMuted,
            focusedLabelColor = NpAccent,
            unfocusedLabelColor = NpTextSecondary,
            cursorColor = NpAccent,
        ),
    )
}
