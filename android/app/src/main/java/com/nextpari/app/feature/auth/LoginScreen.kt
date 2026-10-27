package com.nextpari.app.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onOpenRegister: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val focus = LocalFocusManager.current
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            LaunchWordmark(fontSize = 18, nextColor = colors.text)
            Spacer(Modifier.weight(1f))
            Text("RU", color = colors.textSecondary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Spacer(Modifier.height(18.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(colors.surface.copy(alpha = if (colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg) 0.92f else 1f))
                .padding(horizontal = 16.dp, vertical = 20.dp),
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
        Text(
            if (state.loading) "Вход…" else "Войти",
            color = colors.accentInk,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(if (state.loading) colors.accent.copy(alpha = 0.45f) else colors.accent)
                .clickable(enabled = !state.loading, onClick = viewModel::login)
                .padding(vertical = 16.dp),
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
        Text(
            "Google, Apple и Telegram не подключены",
            color = colors.textSecondary,
            fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
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
            focusedContainerColor = colors.surface,
            unfocusedContainerColor = colors.surface,
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
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.surface).padding(4.dp)) {
        ModeChip("Email / ID", mode == LoginMode.IDENTIFIER, Modifier.weight(1f)) { onChange(LoginMode.IDENTIFIER) }
        ModeChip("Телефон", mode == LoginMode.PHONE, Modifier.weight(1f)) { onChange(LoginMode.PHONE) }
    }
}

@Composable
private fun ModeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .height(44.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 14.sp,
            color = if (selected) colors.accentInk else colors.textSecondary,
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
