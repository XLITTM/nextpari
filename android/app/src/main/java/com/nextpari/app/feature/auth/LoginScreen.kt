package com.nextpari.app.feature.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.R
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.launch.LaunchWordmark
import com.nextpari.app.feature.launch.NeonPrimaryButton

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onOpenRegister: () -> Unit,
    onForgotPassword: () -> Unit,
    onBack: () -> Unit,
    onToggleTheme: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val focus = LocalFocusManager.current
    val dark = colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg
    BackHandler(onBack = onBack)
    Column(
        Modifier
            .fillMaxSize()
            .background(if (dark) Color(0xFF05080C) else colors.bg)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Назад",
                color = colors.text,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clickable(onClick = onBack)
                    .padding(vertical = 12.dp, horizontal = 4.dp),
            )
            Spacer(Modifier.weight(1f))
            Text(
                if (dark) "Светлая" else "Тёмная",
                color = if (dark) Color(0xFF03ED88) else colors.accent,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .semantics {
                        contentDescription = if (dark) "Включить светлую тему" else "Включить тёмную тему"
                    }
                    .clickable(onClick = onToggleTheme)
                    .padding(vertical = 12.dp, horizontal = 4.dp),
            )
        }
        Box(Modifier.fillMaxWidth().height(if (dark) 292.dp else 44.dp)) {
            if (dark) {
                Image(
                    painter = painterResource(R.drawable.np_login_football_tiger_scene),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.FillWidth,
                    alignment = Alignment.TopCenter,
                )
            }
            Box(Modifier.align(Alignment.TopStart).padding(start = 2.dp, top = 2.dp)) {
                LaunchWordmark(height = 30.dp)
            }
        }
        Column(
            Modifier
                .offset(y = if (dark) (-78).dp else 8.dp)
                .fillMaxWidth()
                .shadow(24.dp, RoundedCornerShape(28.dp), ambientColor = Color(0x6603ED88), spotColor = Color.Black)
                .clip(RoundedCornerShape(28.dp))
                .background(if (dark) Color(0xF20B1214) else colors.surface)
                .border(1.dp, colors.accent.copy(alpha = if (dark) 0.28f else 0.45f), RoundedCornerShape(28.dp))
                .padding(horizontal = 16.dp, vertical = 18.dp),
        ) {
        Text("Авторизация", color = colors.text, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        Text(
            "Войдите в свой аккаунт",
            color = colors.textSecondary,
            fontSize = 15.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )
        LoginModeSwitch(state.mode, viewModel::setMode)
        Spacer(Modifier.height(14.dp))
        ThemedField(
            value = state.identifier,
            onValueChange = viewModel::setIdentifier,
            label = if (state.mode == LoginMode.PHONE) "Номер телефона" else "Email или ID игрока",
            keyboardType = if (state.mode == LoginMode.PHONE) KeyboardType.Phone else KeyboardType.Email,
            imeAction = ImeAction.Next,
            onImeAction = { focus.moveFocus(FocusDirection.Down) },
            leading = {
                Icon(
                    if (state.mode == LoginMode.PHONE) NextpariWebIcons.Phone else NextpariWebIcons.Mail,
                    contentDescription = null,
                    tint = colors.textSecondary,
                )
            },
        )
        Spacer(Modifier.height(12.dp))
        ThemedField(
            value = state.password,
            onValueChange = viewModel::setPassword,
            label = "Пароль",
            keyboardType = KeyboardType.Password,
            password = !state.passwordVisible,
            imeAction = ImeAction.Done,
            onImeAction = { viewModel.login() },
            leading = {
                Icon(NextpariWebIcons.Lock, contentDescription = null, tint = colors.textSecondary)
            },
            trailing = {
                IconButton(onClick = viewModel::togglePasswordVisible) {
                    Icon(
                        imageVector = if (state.passwordVisible) NextpariWebIcons.EyeOff else NextpariWebIcons.Eye,
                        contentDescription = if (state.passwordVisible) "Скрыть пароль" else "Показать пароль",
                        tint = colors.textSecondary,
                    )
                }
            },
        )
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = state.rememberLogin,
                onCheckedChange = viewModel::setRememberLogin,
                colors = CheckboxDefaults.colors(checkedColor = colors.accent, uncheckedColor = colors.textSecondary),
            )
            Text("Запомнить меня", color = colors.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(
                "Забыли пароль?",
                color = colors.textSecondary,
                fontSize = 14.sp,
                modifier = Modifier.clickable(onClick = onForgotPassword),
            )
        }
        if (state.error != null) {
            Text(state.error ?: "", color = colors.danger, modifier = Modifier.padding(top = 12.dp))
        }
        if (state.registerNotice != null) {
            Text(state.registerNotice ?: "", color = colors.success, modifier = Modifier.padding(top = 12.dp))
        }
        if (state.recoveryNotice != null) {
            Text(state.recoveryNotice ?: "", color = colors.textSecondary, modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(16.dp))
        NeonPrimaryButton(
            text = if (state.loading) "Вход…" else "Войти",
            onClick = viewModel::login,
            enabled = !state.loading,
        )
        Text(
            buildAnnotatedString {
                append("Нет аккаунта? ")
                withStyle(SpanStyle(color = colors.accent, fontWeight = FontWeight.Bold)) {
                    append("Зарегистрируйтесь")
                }
            },
            color = colors.textSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenRegister).padding(top = 14.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Text(
            "или",
            color = colors.textMuted,
            fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Row(
            Modifier.fillMaxWidth().padding(top = 10.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
        ) {
            DisabledProvider("Вход через Google недоступен") { GoogleMark() }
            DisabledProvider("Вход через Apple недоступен") { AppleMark() }
            DisabledProvider("Вход через Telegram недоступен") { TelegramMark() }
        }
        Text(
            "Нажимая «Войти», вы соглашаетесь с Правилами и Условиями",
            color = colors.textMuted,
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        }
    }
}

@Composable
private fun DisabledProvider(description: String, mark: @Composable () -> Unit) {
    Box(
        Modifier
            .size(56.dp)
            .semantics { contentDescription = description }
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF1A2428))
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        mark()
    }
}

@Composable
private fun GoogleMark() {
    Text(
        "G",
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        style = TextStyle(
            brush = Brush.linearGradient(
                listOf(Color(0xFF4285F4), Color(0xFFEA4335), Color(0xFFFBBC05), Color(0xFF34A853)),
            ),
        ),
    )
}

@Composable
private fun AppleMark() {
    Canvas(Modifier.size(22.dp)) {
        val w = size.width
        val h = size.height
        val body = Path().apply {
            moveTo(w * 0.52f, h * 0.18f)
            cubicTo(w * 0.78f, h * 0.18f, w * 0.92f, h * 0.38f, w * 0.88f, h * 0.62f)
            cubicTo(w * 0.84f, h * 0.9f, w * 0.68f, h * 0.98f, w * 0.52f, h * 0.98f)
            cubicTo(w * 0.36f, h * 0.98f, w * 0.2f, h * 0.9f, w * 0.16f, h * 0.62f)
            cubicTo(w * 0.12f, h * 0.38f, w * 0.28f, h * 0.18f, w * 0.52f, h * 0.18f)
            close()
        }
        drawPath(body, Color.White)
        drawLine(
            Color.White,
            Offset(w * 0.5f, h * 0.02f),
            Offset(w * 0.66f, h * 0.16f),
            strokeWidth = w * 0.08f,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
private fun TelegramMark() {
    Canvas(Modifier.size(22.dp)) {
        val path = Path().apply {
            moveTo(size.width * 0.06f, size.height * 0.46f)
            lineTo(size.width * 0.94f, size.height * 0.16f)
            lineTo(size.width * 0.72f, size.height * 0.88f)
            lineTo(size.width * 0.46f, size.height * 0.62f)
            lineTo(size.width * 0.78f, size.height * 0.3f)
            lineTo(size.width * 0.34f, size.height * 0.58f)
            close()
        }
        drawPath(path, Color(0xFF2AABEE))
    }
}

@Composable
private fun ThemedField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    password: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = NextpariTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(
            onNext = { onImeAction?.invoke() },
            onDone = { onImeAction?.invoke() },
        ),
        leadingIcon = leading,
        trailingIcon = trailing,
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.text,
            unfocusedTextColor = colors.text,
            focusedBorderColor = colors.accent,
            unfocusedBorderColor = colors.border,
            focusedLabelColor = colors.accent,
            unfocusedLabelColor = colors.textSecondary,
            cursorColor = colors.accent,
            focusedContainerColor = if (colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg) Color(0xFF16232A) else colors.surface,
            unfocusedContainerColor = if (colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg) Color(0xFF16232A) else colors.surface,
        ),
    )
}

@Composable
internal fun AuthScaffold(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(R.drawable.auth_sports_bg),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0x33000000), Color.Transparent, Color(0x59000000)))),
        )
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                Modifier.weight(1f).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.logo),
                    contentDescription = "NextPari",
                    modifier = Modifier
                        .size(72.dp)
                        .shadow(12.dp, RoundedCornerShape(22.dp))
                        .clip(RoundedCornerShape(22.dp)),
                )
                Text(
                    "Ставки на спорт онлайн",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            Column(
                Modifier
                    .padding(horizontal = 16.dp)
                    .navigationBarsPadding()
                    .padding(bottom = 12.dp)
                    .shadow(18.dp, RoundedCornerShape(32.dp))
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color.White)
                    .padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 16.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                content()
            }
        }
    }
}

@Composable
internal fun LoginModeSwitch(mode: LoginMode, onChange: (LoginMode) -> Unit) {
    val colors = NextpariTheme.colors
    val track = if (colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg) Color(0xFF10181C) else colors.surface
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(track).padding(4.dp)) {
        ModeChip("Email / ID", mode == LoginMode.IDENTIFIER, Modifier.weight(1f)) { onChange(LoginMode.IDENTIFIER) }
        ModeChip("Телефон", mode == LoginMode.PHONE, Modifier.weight(1f)) { onChange(LoginMode.PHONE) }
    }
}

@Composable
private fun ModeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (selected) Brush.horizontalGradient(listOf(Color(0xFF03ED88), Color(0xFF00A86A)))
                else Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent)),
            )
            .clickable(onClick = onClick)
            .height(44.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        Text(
            label,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 14.sp,
            color = if (selected) Color.White else colors.textSecondary,
        )
        Box(
            Modifier
                .padding(top = 4.dp)
                .fillMaxWidth(0.72f)
                .height(2.dp)
                .background(if (selected) Color.White.copy(alpha = 0.85f) else Color.Transparent),
        )
    }
}

@Composable
internal fun NextpariField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    password: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(
            onNext = { onImeAction?.invoke() },
            onDone = { onImeAction?.invoke() },
        ),
        trailingIcon = trailing,
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Color(0xFF07182F),
            unfocusedTextColor = Color(0xFF07182F),
            focusedBorderColor = Color(0xFF16A34A),
            unfocusedBorderColor = Color(0xFFE6EBF2),
            focusedLabelColor = Color(0xFF16A34A),
            unfocusedLabelColor = Color(0xFF64748B),
            cursorColor = Color(0xFF16A34A),
        ),
    )
}
