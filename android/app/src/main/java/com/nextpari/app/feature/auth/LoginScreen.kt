package com.nextpari.app.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onOpenRegister: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val focus = LocalFocusManager.current
    AuthScaffold {
        Text("Авторизация", color = Color(0xFF07182F), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.4).sp)
        Spacer(Modifier.height(16.dp))
        LoginModeSwitch(state.mode, viewModel::setMode)
        Spacer(Modifier.height(16.dp))
        NextpariField(
            value = state.identifier,
            onValueChange = viewModel::setIdentifier,
            label = if (state.mode == LoginMode.PHONE) "Номер телефона" else "Email или ID игрока",
            keyboardType = if (state.mode == LoginMode.PHONE) KeyboardType.Phone else KeyboardType.Email,
            imeAction = ImeAction.Next,
            onImeAction = { focus.moveFocus(FocusDirection.Down) },
        )
        Spacer(Modifier.height(12.dp))
        NextpariField(
            value = state.password,
            onValueChange = viewModel::setPassword,
            label = "Пароль",
            keyboardType = KeyboardType.Password,
            password = !state.passwordVisible,
            imeAction = ImeAction.Done,
            onImeAction = { viewModel.login() },
            trailing = {
                IconButton(onClick = viewModel::togglePasswordVisible) {
                    Icon(
                        imageVector = if (state.passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = if (state.passwordVisible) "Скрыть пароль" else "Показать пароль",
                    )
                }
            },
        )
        if (state.error != null) {
            Text(state.error ?: "", color = colors.danger, modifier = Modifier.padding(top = 12.dp))
        }
        if (state.registerNotice != null) {
            Text(state.registerNotice ?: "", color = Color(0xFF166534), modifier = Modifier.padding(top = 12.dp))
        }
        if (state.recoveryNotice != null) {
            Text(state.recoveryNotice ?: "", color = Color(0xFF67819C), modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(16.dp))
        NextpariButton(
            text = if (state.loading) "Вход…" else "Войти",
            onClick = viewModel::login,
            enabled = !state.loading,
            containerColor = Color(0xFF16A34A),
        )
        Text(
            "Забыли пароль?",
            color = Color(0xFF16A34A),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onForgotPassword).padding(top = 12.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Text(
            buildAnnotatedString {
                append("Нет аккаунта? ")
                withStyle(SpanStyle(color = Color(0xFF16A34A), fontWeight = FontWeight.Bold)) {
                    append("Зарегистрируйтесь")
                }
            },
            color = Color(0xFF64748B),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenRegister).padding(top = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
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
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFF4F6FA)).padding(4.dp)) {
        ModeChip("Email / ID", mode == LoginMode.IDENTIFIER, Modifier.weight(1f)) { onChange(LoginMode.IDENTIFIER) }
        ModeChip("Телефон", mode == LoginMode.PHONE, Modifier.weight(1f)) { onChange(LoginMode.PHONE) }
    }
}

@Composable
private fun ModeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) Color.White else Color.Transparent)
            .clickable(onClick = onClick)
            .height(44.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = if (selected) Color(0xFF07182F) else Color(0xFF64748B))
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
