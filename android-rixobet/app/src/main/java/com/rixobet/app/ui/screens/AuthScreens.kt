package com.rixobet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.rixobet.app.domain.Attempt
import com.rixobet.app.domain.FixtureMode
import com.rixobet.app.domain.Fixtures
import com.rixobet.app.domain.LocalPrefs
import com.rixobet.app.domain.ThemeMode
import com.rixobet.app.domain.UserActions
import com.rixobet.app.ui.components.CheckDot
import com.rixobet.app.ui.components.CrownMark
import com.rixobet.app.ui.components.EnvelopeArt
import com.rixobet.app.ui.components.GlowOrb
import com.rixobet.app.ui.components.NeonButton
import com.rixobet.app.ui.components.NeonCard
import com.rixobet.app.ui.components.RixoField
import com.rixobet.app.ui.components.RixoLogo
import com.rixobet.app.ui.components.ScreenTitle
import com.rixobet.app.ui.components.SegmentedTabs
import com.rixobet.app.ui.theme.Gold
import com.rixobet.app.ui.theme.LocalRixoTokens
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(hold: Boolean, onDone: () -> Unit) {
    LaunchedEffect(hold) {
        if (!hold) {
            delay(1400)
            onDone()
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        GlowOrb(Modifier.size(280.dp).align(Alignment.TopCenter), com.rixobet.app.ui.theme.Magenta.copy(alpha = 0.35f))
        GlowOrb(Modifier.size(220.dp).align(Alignment.BottomStart))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            RixoLogo(compact = false)
            Spacer(Modifier.height(36.dp))
            CircularProgressIndicator(color = LocalRixoTokens.current.glow, strokeWidth = 3.dp)
            Spacer(Modifier.height(16.dp))
            Text("Загрузка...", color = LocalRixoTokens.current.muted)
        }
    }
}

@Composable
fun ThemeScreen(selected: ThemeMode, onSelect: (ThemeMode) -> Unit, onContinue: () -> Unit) {
    val tokens = LocalRixoTokens.current
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ScreenTitle("Выберите тему")
        Spacer(Modifier.height(18.dp))
        ThemeChoiceCard(
            title = "Тёмная VIP",
            selected = selected == ThemeMode.DarkVip,
            darkPreview = true,
            onClick = { onSelect(ThemeMode.DarkVip) },
        )
        Spacer(Modifier.height(14.dp))
        ThemeChoiceCard(
            title = "Светлая\n(White Emerald)",
            selected = selected == ThemeMode.WhiteEmerald,
            darkPreview = false,
            onClick = { onSelect(ThemeMode.WhiteEmerald) },
        )
        Spacer(Modifier.height(22.dp))
        NeonButton("Продолжить", onClick = onContinue)
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(4) { index ->
                Box(
                    Modifier
                        .size(if (index == 0) 8.dp else 6.dp)
                        .clip(CircleShape)
                        .background(if (index == 0) tokens.glow else tokens.muted.copy(alpha = 0.4f)),
                )
            }
        }
    }
}

@Composable
private fun ThemeChoiceCard(title: String, selected: Boolean, darkPreview: Boolean, onClick: () -> Unit) {
    NeonCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MiniPhone(darkPreview)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                CrownMark(Modifier.size(28.dp), tint = if (darkPreview) Gold else com.rixobet.app.ui.theme.Emerald)
                Spacer(Modifier.height(6.dp))
                Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp)
            }
            CheckDot(selected)
        }
    }
}

@Composable
private fun MiniPhone(dark: Boolean) {
    val bg = if (dark) Color(0xFF140C24) else Color(0xFFF4FFF8)
    val line = if (dark) Color(0xFF6A00FF) else Color(0xFF12C97A)
    Column(
        Modifier
            .size(width = 92.dp, height = 124.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(bg)
            .border(1.dp, line.copy(alpha = 0.7f), RoundedCornerShape(16.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(line.copy(alpha = 0.8f)))
        repeat(3) {
            Box(Modifier.fillMaxWidth().height(16.dp).clip(RoundedCornerShape(6.dp)).background(line.copy(alpha = 0.25f)))
        }
        Box(Modifier.fillMaxWidth().height(18.dp).clip(RoundedCornerShape(8.dp)).background(line))
    }
}

@Composable
fun LoginScreen(
    prefs: LocalPrefs,
    onPrefs: (LocalPrefs) -> Unit,
    onRegister: () -> Unit,
    onGuest: () -> Unit,
    onNotice: (String, String, Boolean) -> Unit,
) {
    var phoneTab by rememberSaveable { mutableStateOf(false) }
    var identifier by rememberSaveable { mutableStateOf(prefs.rememberedIdentifier) }
    var password by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(prefs.rememberedIdentifier.isNotEmpty()) }
    var error by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RixoLogo(compact = true, showTagline = false)
        Spacer(Modifier.height(18.dp))
        SegmentedTabs(
            items = listOf("Вход", "По телефону"),
            selected = if (phoneTab) 1 else 0,
            onSelect = { phoneTab = it == 1 },
        )
        Spacer(Modifier.height(16.dp))
        RixoField(
            value = identifier,
            onValueChange = { identifier = it },
            placeholder = if (phoneTab) "Телефон" else "E-mail или телефон",
            icon = if (phoneTab) Icons.Filled.Phone else Icons.Filled.Email,
        )
        Spacer(Modifier.height(10.dp))
        RixoField(
            value = password,
            onValueChange = { password = it },
            placeholder = "Пароль",
            icon = Icons.Filled.Lock,
            password = true,
        )
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clickable { remember = !remember },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CheckDot(remember)
                Spacer(Modifier.width(8.dp))
                Text("Запомнить меня", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp)
            }
            Spacer(Modifier.weight(1f))
            Text(
                "Забыли пароль",
                color = LocalRixoTokens.current.muted,
                fontSize = 13.sp,
                modifier = Modifier.clickable {
                    val attempt = UserActions.forgotPassword()
                    onNotice("Сервис недоступен", (attempt as Attempt.Unavailable).message, false)
                },
            )
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }
        Spacer(Modifier.height(16.dp))
        NeonButton("Войти") {
            val attempt = UserActions.login(identifier, password)
            onPrefs(
                prefs.copy(rememberedIdentifier = if (remember) identifier.trim().take(120) else ""),
            )
            when (attempt) {
                is Attempt.Invalid -> error = attempt.reason
                is Attempt.Unavailable -> {
                    error = ""
                    onNotice("Сервис недоступен", attempt.message, true)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(LocalRixoTokens.current.muted.copy(alpha = 0.4f)))
            Text("  или  ", color = LocalRixoTokens.current.muted, fontSize = 12.sp)
            Box(Modifier.weight(1f).height(1.dp).background(LocalRixoTokens.current.muted.copy(alpha = 0.4f)))
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("Google", "Telegram", "Apple").forEach { provider ->
                SocialButton(provider) {
                    val attempt = UserActions.social(provider) as Attempt.Unavailable
                    onNotice("Сервис недоступен", attempt.message, false)
                }
            }
        }
        Spacer(Modifier.height(18.dp))
        Row {
            Text("Нет аккаунта? ", color = LocalRixoTokens.current.muted)
            Text(
                "Регистрация",
                color = LocalRixoTokens.current.glow,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onRegister),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Открыть интерфейс без входа",
            color = LocalRixoTokens.current.muted,
            fontSize = 13.sp,
            modifier = Modifier.clickable(onClick = onGuest),
        )
    }
}

@Composable
private fun SocialButton(provider: String, onClick: () -> Unit) {
    val mark = when (provider) {
        "Google" -> "G"
        "Telegram" -> "✈"
        else -> "A"
    }
    val color = when (provider) {
        "Google" -> Color(0xFFEA4335)
        "Telegram" -> Color(0xFF2AABEE)
        else -> Color.White
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(LocalRixoTokens.current.field)
                .border(1.dp, LocalRixoTokens.current.stroke, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Text(mark, color = color, fontWeight = FontWeight.Black, fontSize = 22.sp)
        }
    }
}

@Composable
fun RegisterScreen(
    currency: String,
    onCurrency: (String) -> Unit,
    onEmailStep: (String) -> Unit,
    onNotice: (String, String) -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf(0) }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var accepted by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp),
    ) {
        ScreenTitle("Регистрация")
        Spacer(Modifier.height(16.dp))
        SegmentedTabs(
            items = listOf("E-mail", "Телефон", "В 1 клик"),
            selected = tab,
            onSelect = { tab = it },
        )
        Spacer(Modifier.height(14.dp))
        when (tab) {
            0 -> RixoField(email, { email = it }, "E-mail", Icons.Filled.Email)
            1 -> RixoField(phone, { phone = it }, "Телефон", Icons.Filled.Phone)
        }
        if (tab != 2) {
            Spacer(Modifier.height(10.dp))
            RixoField(password, { password = it }, "Пароль", Icons.Filled.Lock, password = true)
            Spacer(Modifier.height(10.dp))
            RixoField(confirm, { confirm = it }, "Подтвердите пароль", Icons.Filled.Lock, password = true)
        } else {
            Text(
                "Аккаунт не создаётся, пока сервис регистрации не подключён.",
                color = LocalRixoTokens.current.muted,
                fontSize = 13.sp,
            )
        }
        Spacer(Modifier.height(10.dp))
        CurrencyRow(currency, onCurrency)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.Top) {
            CheckDot(accepted, Modifier.clickable { accepted = !accepted })
            Spacer(Modifier.width(8.dp))
            Column {
                Text("Мне 18+ и я принимаю", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp)
                Text(
                    "Правила и Политику конфиденциальности",
                    color = LocalRixoTokens.current.glow,
                    fontSize = 14.sp,
                    modifier = Modifier.clickable {
                        onNotice(
                            "Документ недоступен",
                            "Текст правил будет опубликован вместе с сервисом RIXO BET. Сейчас документ недоступен.",
                        )
                    },
                )
            }
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }
        Spacer(Modifier.height(16.dp))
        NeonButton("Зарегистрироваться") {
            val attempt = when (tab) {
                0 -> UserActions.registerEmail(email.trim(), password, confirm, accepted)
                1 -> UserActions.registerPhone(phone.trim(), password, confirm, accepted)
                else -> UserActions.registerOneClick(accepted)
            }
            when (attempt) {
                is Attempt.Invalid -> error = attempt.reason
                is Attempt.Unavailable -> {
                    error = ""
                    if (tab == 0) onEmailStep(email.trim()) else onNotice("Сервис недоступен", attempt.message)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
fun CurrencyRow(currency: String, onCurrency: (String) -> Unit) {
    val tokens = LocalRixoTokens.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(tokens.field)
            .border(1.dp, tokens.stroke, RoundedCornerShape(14.dp))
            .padding(12.dp),
    ) {
        Text("Валюта", color = tokens.muted, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LocalPrefsRepositoryCurrencies.forEach { code ->
                val active = code == currency
                Text(
                    code,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (active) tokens.glow else Color.Transparent)
                        .clickable { onCurrency(code) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    color = if (active) Color.White else MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

private val LocalPrefsRepositoryCurrencies = com.rixobet.app.domain.LocalPrefsRepository.AllowedCurrencies.toList()

@Composable
fun EmailConfirmScreen(address: String, mode: FixtureMode, onNotice: (String, String) -> Unit) {
    var code by rememberSaveable { mutableStateOf(if (mode == FixtureMode.Demo) Fixtures.sampleCode else "") }
    var error by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(12.dp))
        EnvelopeArt()
        Spacer(Modifier.height(16.dp))
        ScreenTitle("Проверьте почту")
        Spacer(Modifier.height(8.dp))
        Text(
            "Письмо не отправлено. Аккаунт не создан.\nАдрес: $address",
            color = LocalRixoTokens.current.muted,
            textAlign = TextAlign.Center,
            fontSize = 14.sp,
        )
        Spacer(Modifier.height(16.dp))
        CodeBoxes(code) { code = it.filter { ch -> ch.isDigit() }.take(6) }
        if (mode == FixtureMode.Demo) {
            Spacer(Modifier.height(6.dp))
            Text(
                "Пример оформления. Код не отправлялся и не проверяется.",
                color = LocalRixoTokens.current.gold,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
            )
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }
        Spacer(Modifier.height(16.dp))
        Text("Не получили код?", color = LocalRixoTokens.current.muted, fontSize = 13.sp)
        Text(
            "Отправить ещё раз",
            color = LocalRixoTokens.current.glow,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clickable {
                val attempt = UserActions.resendCode() as Attempt.Unavailable
                onNotice("Сервис недоступен", attempt.message)
            },
        )
        Spacer(Modifier.height(20.dp))
        NeonButton("Подтвердить") {
            when (val attempt = UserActions.confirmEmail(code)) {
                is Attempt.Invalid -> error = attempt.reason
                is Attempt.Unavailable -> {
                    error = ""
                    onNotice("Сервис недоступен", attempt.message)
                }
            }
        }
    }
}

@Composable
private fun CodeBoxes(code: String, onChange: (String) -> Unit) {
    BasicTextField(
        value = code,
        onValueChange = onChange,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        cursorBrush = SolidColor(LocalRixoTokens.current.glow),
        decorationBox = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(6) { index ->
                    val char = code.getOrNull(index)?.toString() ?: ""
                    Box(
                        Modifier
                            .size(width = 42.dp, height = 52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(LocalRixoTokens.current.field)
                            .border(1.dp, LocalRixoTokens.current.stroke, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(char, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = MaterialTheme.colorScheme.onBackground)
                    }
                }
            }
        },
    )
}
