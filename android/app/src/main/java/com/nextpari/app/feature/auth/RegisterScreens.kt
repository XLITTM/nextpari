package com.nextpari.app.feature.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.feature.wallets.WalletsCatalog

@Composable
fun RegisterMenuScreen(
    onBack: () -> Unit,
    onEmail: () -> Unit,
    onPhone: () -> Unit,
    onOneClick: () -> Unit,
) {
    AuthScaffold {
        Text("Регистрация", color = Color(0xFF07182F), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(16.dp))
        NextpariCard(onClick = onOneClick) {
            Text("В один клик", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Быстрая регистрация за несколько секунд", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard(onClick = onPhone) {
            Text("По телефону", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Регистрация по номеру мобильного телефона", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard(onClick = onEmail) {
            Text("По Email", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Классическая регистрация через электронную почту", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Text(
            "Уже есть аккаунт? Войти",
            color = Color(0xFF16A34A),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp).clickable(onClick = onBack),
        )
    }
}

@Composable
fun RegisterEmailScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    RegisterFormScreen(
        title = "Регистрация",
        fieldLabel = "Email",
        keyboardType = KeyboardType.Email,
        viewModel = viewModel,
        onBack = onBack,
        onSubmit = { identifier, password, age, currency ->
            viewModel.registerEmail(identifier, password, age, currency)
        },
    )
}

@Composable
fun RegisterPhoneScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    RegisterFormScreen(
        title = "Регистрация по телефону",
        fieldLabel = "Телефон",
        keyboardType = KeyboardType.Phone,
        viewModel = viewModel,
        onBack = onBack,
        onSubmit = { identifier, password, age, currency ->
            viewModel.registerPhone(identifier, password, age, currency)
        },
    )
}

@Composable
fun RegisterOneClickScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var ageConfirmed by rememberSaveable { mutableStateOf(false) }
    var currency by rememberSaveable { mutableStateOf("") }
    AuthScaffold {
        Text("Регистрация в один клик", color = Color(0xFF07182F), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Мы создадим ID игрока и безопасный пароль автоматически.",
            color = Color(0xFF64748B),
        )
        Spacer(Modifier.height(16.dp))
        RegistrationGates(ageConfirmed, { ageConfirmed = it }, currency, { currency = it })
        if (state.registerError != null) {
            Text(state.registerError ?: "", color = Color(0xFFB91C1C), modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(20.dp))
        NextpariButton(
            text = "Создать аккаунт",
            onClick = { viewModel.registerOneClick(ageConfirmed, currency) },
            enabled = !state.loading,
            containerColor = Color(0xFF16A34A),
        )
        Text("Назад", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).clickable(onClick = onBack))
    }
}

@Composable
fun RegisterOneClickResultScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val playerId = state.oneClickPlayerId.orEmpty()
    val issuedPassword = state.oneClickPassword.orEmpty()
    val clipboard = LocalClipboardManager.current
    var copied by rememberSaveable { mutableStateOf(false) }
    AuthScaffold {
        Text(RegistrationCopy.ONE_CLICK_TITLE, color = Color(0xFF07182F), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text(RegistrationCopy.ONE_CLICK_HINT, color = Color(0xFF64748B))
        Spacer(Modifier.height(16.dp))
        if (playerId.isBlank() || issuedPassword.isBlank()) {
            Text(state.registerError ?: RegistrationCopy.FAILED, color = Color(0xFFB91C1C))
        } else {
            SelectionContainer {
                Text("ID игрока: $playerId", color = Color(0xFF07182F), fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            SelectionContainer {
                Text("Пароль: $issuedPassword", color = Color(0xFF07182F), fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(16.dp))
            NextpariButton(
                text = RegistrationCopy.COPY_ALL,
                onClick = {
                    clipboard.setText(AnnotatedString(RegistrationCopy.copyAll(playerId, issuedPassword)))
                    copied = true
                },
                enabled = !state.loading,
                containerColor = Color(0xFF16A34A),
            )
            if (copied) {
                Text(RegistrationCopy.COPIED, color = Color(0xFF166534), modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(12.dp))
            NextpariButton(
                text = if (state.oneClickCanEnter) "Продолжить" else "Войти по ID",
                onClick = { viewModel.continueOneClick() },
                enabled = !state.loading,
                containerColor = Color(0xFF07182F),
            )
        }
        if (state.registerError != null && playerId.isNotBlank()) {
            Text(state.registerError ?: "", color = Color(0xFFB91C1C), modifier = Modifier.padding(top = 12.dp))
        }
        Text(
            "Назад",
            color = Color(0xFF16A34A),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 16.dp).clickable {
                viewModel.dismissOneClick()
                onBack()
            },
        )
    }
}

@Composable
fun ForgotPasswordScreen(onBack: () -> Unit, onPlaceholder: () -> Unit, viewModel: AuthViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var identifier by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    AuthScaffold {
        Text("Забыли пароль?", color = Color(0xFF07182F), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        when (state.recoveryStep) {
            "code" -> NextpariField(code, { code = it.filter(Char::isDigit).take(6) }, "Код из письма", KeyboardType.Number)
            "password", "done" -> {
                NextpariField(password, { password = it }, "Новый пароль", KeyboardType.Password, password = true)
                Spacer(Modifier.height(12.dp))
                NextpariField(confirm, { confirm = it }, "Повторите пароль", KeyboardType.Password, password = true)
            }
            else -> NextpariField(identifier, { identifier = it }, "Email или ID", KeyboardType.Email)
        }
        if (state.recoveryNotice != null) {
            Text(state.recoveryNotice.orEmpty(), color = Color(0xFF334155), modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(20.dp))
        if (state.recoveryStep != "done") {
            NextpariButton(
                text = if (state.loading) "Отправка..." else "Продолжить",
                onClick = {
                    when (state.recoveryStep) {
                        "code" -> viewModel.verifyRecovery(code)
                        "password" -> viewModel.resetRecovery(password, confirm)
                        else -> viewModel.startRecovery(identifier)
                    }
                },
                enabled = !state.loading,
                containerColor = Color(0xFF16A34A),
            )
        }
        Text(
            "Назад",
            color = Color(0xFF16A34A),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 16.dp).clickable(onClick = if (state.recoveryStep == "done") onPlaceholder else onBack),
        )
    }
}

@Composable
private fun RegisterFormScreen(
    title: String,
    fieldLabel: String,
    keyboardType: KeyboardType,
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onSubmit: (identifier: String, password: String, ageConfirmed: Boolean, currency: String) -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var identifier by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var ageConfirmed by rememberSaveable { mutableStateOf(false) }
    var currency by rememberSaveable { mutableStateOf("") }
    AuthScaffold {
        Text(title, color = Color(0xFF07182F), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text("Укажите данные для регистрации", color = Color(0xFF64748B))
        Spacer(Modifier.height(16.dp))
        NextpariField(identifier, { identifier = it }, fieldLabel, keyboardType)
        Spacer(Modifier.height(12.dp))
        NextpariField(password, { password = it }, "Пароль", KeyboardType.Password, password = true)
        Spacer(Modifier.height(12.dp))
        RegistrationGates(ageConfirmed, { ageConfirmed = it }, currency, { currency = it })
        if (state.registerError != null) {
            Text(state.registerError ?: "", color = Color(0xFFB91C1C), modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(20.dp))
        NextpariButton(
            text = "Зарегистрироваться",
            onClick = { onSubmit(identifier, password, ageConfirmed, currency) },
            enabled = !state.loading,
            containerColor = Color(0xFF16A34A),
        )
        Text("Назад", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).clickable(onClick = onBack))
    }
}

@Composable
private fun RegistrationGates(
    ageConfirmed: Boolean,
    onAge: (Boolean) -> Unit,
    currency: String,
    onCurrency: (String) -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val selected = WalletsCatalog.displayCurrencies.firstOrNull { it.value == currency }?.label
        ?: "Валюта счёта"
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Checkbox(
            checked = ageConfirmed,
            onCheckedChange = onAge,
            colors = CheckboxDefaults.colors(checkedColor = Color(0xFF16A34A), uncheckedColor = Color(0xFF64748B)),
        )
        Text(
            RegistrationCopy.AGE,
            color = Color(0xFF07182F),
            modifier = Modifier.clickable { onAge(!ageConfirmed) },
        )
    }
    Spacer(Modifier.height(8.dp))
    NextpariCard(onClick = { open = !open }) {
        Text(selected, fontWeight = FontWeight.Bold, color = Color(0xFF07182F))
    }
    if (open) {
        WalletsCatalog.displayCurrencies.forEach { option ->
            Text(
                option.label,
                color = Color(0xFF07182F),
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        onCurrency(option.value)
                        open = false
                    }
                    .padding(vertical = 8.dp),
            )
        }
    }
}
