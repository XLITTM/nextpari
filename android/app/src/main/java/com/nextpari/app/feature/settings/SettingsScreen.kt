package com.nextpari.app.feature.settings

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Percent
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

private val BrandGreen = Color(0xFF16A34A)
private val ScreenLight = Color(0xFFFFFFFF)
private val ScreenDark = Color(0xFF111827)
private val GroupLight = Color(0xFFF9FAFB)
private val GroupDark = Color(0xFF1E293B)
private val IconGrayLightBg = Color(0xFFF3F4F6)
private val IconGrayLightFg = Color(0xFF374151)
private val IconGrayDarkBg = Color(0xFF1E293B)
private val IconGrayDarkFg = Color(0xFFE5E7EB)
private val BrandIconLightBg = Color(0xFFDCFCE7)
private val BrandIconDarkBg = Color(0x6614532D)
private val BrandIconDarkFg = Color(0xFF4ADE80)
private val LogoutLightBg = Color(0xFFFEF2F2)
private val LogoutDarkBg = Color(0x26EF4444)
private val LogoutFg = Color(0xFFEF4444)
private val LogoutDarkFg = Color(0xFFF87171)

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onLogout: () -> Unit,
    verifiedEmail: String = "",
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory),
) {
    val oddsPolicy by viewModel.oddsPolicy.collectAsStateWithLifecycle()
    var view by rememberSaveable { mutableStateOf("root") }
    var passwordOpen by rememberSaveable { mutableStateOf(false) }
    var emailOpen by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val screenBg = if (dark) ScreenDark else ScreenLight
    BackHandler(enabled = view != "root") { view = "root" }

    if (view == "bet-slip") {
        SettingsPage(title = SettingsCatalog.BET_SLIP_TITLE, dark = dark, screenBg = screenBg, onBack = { view = "root" }) {
            SettingsGroup(title = SettingsCatalog.ODDS_CHANGE_TITLE, dark = dark) {
                SettingsCatalog.oddsPolicies.forEachIndexed { index, item ->
                    if (index > 0) SettingsDivider(dark)
                    RadioRow(
                        label = item.label,
                        hint = item.hint,
                        selected = oddsPolicy.id == item.id,
                        dark = dark,
                        onSelect = { viewModel.selectOddsPolicy(OddsChangePolicy.fromStored(item.id)) },
                    )
                }
            }
            SettingsGroup(title = SettingsCatalog.LATER_TITLE, dark = dark) {
                SettingsCatalog.laterRows.forEachIndexed { index, item ->
                    if (index > 0) SettingsDivider(dark)
                    SoonPlainRow(label = item.label, hint = item.hint, dark = dark)
                }
            }
        }
        return
    }

    Box(Modifier.fillMaxSize().background(screenBg)) {
        SettingsPage(title = SettingsCatalog.TITLE, dark = dark, screenBg = screenBg, onBack = onBack) {
            SettingsGroup(title = "Управление счётом", dark = dark) {
                SettingsRow(
                    icon = NextpariWebIcons.ArrowDownToLine,
                    iconBg = if (dark) BrandIconDarkBg else BrandIconLightBg,
                    iconTint = if (dark) BrandIconDarkFg else BrandGreen,
                    label = "Пополнить",
                    dark = dark,
                    onClick = { onNavigate(Destinations.WALLET) },
                )
                SettingsDivider(dark)
                SettingsRow(
                    icon = NextpariWebIcons.ArrowUpFromLine,
                    iconBg = if (dark) BrandIconDarkBg else BrandIconLightBg,
                    iconTint = if (dark) BrandIconDarkFg else BrandGreen,
                    label = "Вывести",
                    dark = dark,
                    onClick = { onNavigate(Destinations.WALLET) },
                )
            }

            SettingsGroup(title = "Безопасность", dark = dark) {
                EmailStatusRow(verifiedEmail = verifiedEmail, dark = dark)
                SettingsDivider(dark)
                SettingsRow(
                    icon = NextpariWebIcons.Mail,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = SettingsCatalog.emailActionLabel(verifiedEmail),
                    dark = dark,
                    onClick = { emailOpen = true },
                )
                SettingsDivider(dark)
                SettingsRow(
                    icon = NextpariWebIcons.KeyRound,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Сменить пароль",
                    dark = dark,
                    onClick = { passwordOpen = true },
                )
            }

            SettingsGroup(title = "Настройки ставок", dark = dark) {
                SettingsRow(
                    icon = NextpariWebIcons.ClipboardCheck,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Провод ставки",
                    dark = dark,
                    onClick = { view = "bet-slip" },
                )
                SettingsDivider(dark)
                SoonRow(
                    icon = NextpariWebIcons.MousePointerClick,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Ставка в 1 клик",
                    dark = dark,
                )
            }

            SettingsGroup(title = "Настройки приложения", dark = dark) {
                InfoRow(
                    icon = NextpariWebIcons.Percent,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Тип коэффициентов",
                    value = SettingsCatalog.ODDS_FORMAT_VALUE,
                    dark = dark,
                )
                SettingsDivider(dark)
                SoonRow(
                    icon = NextpariWebIcons.Bell,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Push",
                    dark = dark,
                )
                SettingsDivider(dark)
                SoonRow(
                    icon = NextpariWebIcons.Globe,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Выбор языка",
                    dark = dark,
                )
            }

            SettingsGroup(title = "О приложении", dark = dark) {
                SettingsRow(
                    icon = NextpariWebIcons.Share2,
                    iconBg = grayIconBg(dark),
                    iconTint = grayIconFg(dark),
                    label = "Поделиться",
                    dark = dark,
                    onClick = {
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, SettingsCatalog.SHARE_TITLE)
                            putExtra(Intent.EXTRA_TEXT, SettingsCatalog.shareText)
                        }
                        context.startActivity(Intent.createChooser(intent, SettingsCatalog.SHARE_TITLE))
                    },
                )
                SettingsDivider(dark)
                SettingsRow(
                    icon = NextpariWebIcons.LogOut,
                    iconBg = if (dark) LogoutDarkBg else LogoutLightBg,
                    iconTint = if (dark) LogoutDarkFg else LogoutFg,
                    label = "Выйти",
                    labelColor = if (dark) LogoutDarkFg else LogoutFg,
                    hideChevron = true,
                    dark = dark,
                    onClick = onLogout,
                )
            }
        }

        if (passwordOpen) {
            ChangePasswordModal(dark = dark, onClose = { passwordOpen = false })
        }
        if (emailOpen) {
            EmailBindModal(
                dark = dark,
                verifiedEmail = verifiedEmail,
                onClose = { emailOpen = false },
            )
        }
    }
}

@Composable
private fun SettingsPage(
    title: String,
    dark: Boolean,
    screenBg: Color,
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(screenBg)) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(screenBg)
                .border(width = 0.dp, color = Color.Transparent)
                .padding(horizontal = 8.dp)
                .height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    NextpariWebIcons.ChevronLeft,
                    contentDescription = "Назад",
                    tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151),
                    modifier = Modifier.size(24.dp),
                )
            }
            Text(
                title,
                color = colors.text,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(end = 40.dp),
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)),
        )
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 112.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsGroup(title: String, dark: Boolean, content: @Composable () -> Unit) {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(bottom = 24.dp)) {
        Text(
            title,
            color = colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
        )
        Column(
            Modifier
                .fillMaxWidth()
                .shadow(2.dp, RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .background(if (dark) GroupDark else GroupLight),
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsDivider(dark: Boolean) {
    HorizontalDivider(color = if (dark) Color(0xFF374151) else Color(0xFFF3F4F6), thickness = 1.dp)
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    label: String,
    dark: Boolean,
    onClick: () -> Unit,
    labelColor: Color? = null,
    hideChevron: Boolean = false,
) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsIconBox(icon, iconBg, iconTint)
        Spacer(Modifier.width(12.dp))
        Text(
            label,
            color = labelColor ?: colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        if (!hideChevron) {
            Icon(NextpariWebIcons.ChevronRight, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun SoonRow(icon: ImageVector, iconBg: Color, iconTint: Color, label: String, dark: Boolean) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsIconBox(icon, iconBg, iconTint)
        Spacer(Modifier.width(12.dp))
        Text(label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        SoonBadge()
    }
}

@Composable
private fun InfoRow(icon: ImageVector, iconBg: Color, iconTint: Color, label: String, value: String, dark: Boolean) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsIconBox(icon, iconBg, iconTint)
        Spacer(Modifier.width(12.dp))
        Text(label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(value, color = Color(0xFF9CA3AF), fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SoonPlainRow(label: String, hint: String?, dark: Boolean) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            if (!hint.isNullOrBlank()) {
                Text(hint, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }
        SoonBadge()
    }
}

@Composable
private fun EmailStatusRow(verifiedEmail: String, dark: Boolean) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsIconBox(NextpariWebIcons.Mail, grayIconBg(dark), grayIconFg(dark))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text("Электронная почта", color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            if (verifiedEmail.isNotBlank()) {
                Text(
                    verifiedEmail,
                    color = colors.textMuted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    SettingsCatalog.EMAIL_VERIFIED_MARK,
                    color = BrandGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Text(SettingsCatalog.EMAIL_UNBOUND, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun RadioRow(label: String, hint: String, selected: Boolean, dark: Boolean, onSelect: () -> Unit) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clickable(onClick = onSelect)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(20.dp)
                .border(2.dp, if (selected) BrandGreen else if (dark) Color(0xFF6B7280) else Color(0xFFD1D5DB), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(BrandGreen))
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(hint, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun SettingsIconBox(icon: ImageVector, bg: Color, tint: Color) {
    Box(
        Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun SoonBadge() {
    Text(
        SettingsCatalog.SOON.uppercase(),
        color = Color(0xFF9CA3AF),
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.8.sp,
    )
}

@Composable
private fun ChangePasswordModal(dark: Boolean, onClose: () -> Unit) {
    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var showCurrent by rememberSaveable { mutableStateOf(false) }
    var showNew by rememberSaveable { mutableStateOf(false) }
    var showConfirm by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    SettingsSheet(dark = dark, onClose = onClose) {
        SheetHeader(
            icon = NextpariWebIcons.ShieldCheck,
            title = "Сменить пароль",
            subtitle = "Безопасность",
            dark = dark,
        )
        PasswordField("Текущий пароль", current, showCurrent, dark, ImeAction.Next, {
            current = it
            error = ""
        }, { showCurrent = !showCurrent }) { focus.moveFocus(FocusDirection.Down) }
        Spacer(Modifier.height(12.dp))
        PasswordField("Новый пароль", next, showNew, dark, ImeAction.Next, {
            next = it
            error = ""
        }, { showNew = !showNew }) { focus.moveFocus(FocusDirection.Down) }
        Spacer(Modifier.height(12.dp))
        PasswordField("Повторите новый пароль", confirm, showConfirm, dark, ImeAction.Done, {
            confirm = it
            error = ""
        }, { showConfirm = !showConfirm }) {
            focus.clearFocus()
            error = when (val result = AccountSecurity.changePassword(current, next, confirm)) {
                is AccountSecurityResult.Invalid -> result.message
                is AccountSecurityResult.Unavailable -> result.message
            }
        }
        if (error.isNotBlank()) {
            Text(error, color = Color(0xFFEF4444), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
        }
        Box(
            Modifier
                .padding(top = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(BrandGreen)
                .clickable {
                    error = when (val result = AccountSecurity.changePassword(current, next, confirm)) {
                        is AccountSecurityResult.Invalid -> result.message
                        is AccountSecurityResult.Unavailable -> result.message
                    }
                }
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("Сменить пароль", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        Text(
            "Отмена",
            color = if (dark) Color(0xFFD1D5DB) else Color(0xFF6B7280),
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp).clickable(onClick = onClose),
        )
    }
}

@Composable
private fun EmailBindModal(dark: Boolean, verifiedEmail: String, onClose: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var step by rememberSaveable { mutableStateOf("email") }
    var error by rememberSaveable { mutableStateOf("") }
    SettingsSheet(dark = dark, onClose = onClose) {
        SheetHeader(
            icon = NextpariWebIcons.Mail,
            title = if (verifiedEmail.isNotBlank()) SettingsCatalog.CHANGE_EMAIL else SettingsCatalog.BIND_EMAIL,
            subtitle = "Электронная почта",
            dark = dark,
        )
        if (step == "email") {
            SheetFieldLabel("Введите электронную почту", dark)
            SheetTextField(
                value = email,
                onValueChange = {
                    email = it
                    error = ""
                },
                dark = dark,
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Done,
                onDone = {
                    error = when (val result = AccountSecurity.startEmailBinding(email)) {
                        is AccountSecurityResult.Invalid -> result.message
                        is AccountSecurityResult.Unavailable -> result.message
                    }
                },
            )
            if (error.isNotBlank()) {
                Text(error, color = Color(0xFFEF4444), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
            }
            PrimaryButton("Отправить код") {
                error = when (val result = AccountSecurity.startEmailBinding(email)) {
                    is AccountSecurityResult.Invalid -> result.message
                    is AccountSecurityResult.Unavailable -> result.message
                }
            }
        } else {
            Text("На указанный адрес отправлен код", color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            SheetFieldLabel("6-значный код", dark)
            SheetTextField(
                value = code,
                onValueChange = { code = it.filter(Char::isDigit).take(6); error = "" },
                dark = dark,
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
                onDone = {
                    error = when (val result = AccountSecurity.verifyEmailCode(code)) {
                        is AccountSecurityResult.Invalid -> result.message
                        is AccountSecurityResult.Unavailable -> result.message
                    }
                },
            )
            if (error.isNotBlank()) {
                Text(error, color = Color(0xFFEF4444), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
            }
            PrimaryButton("Подтвердить") {
                error = when (val result = AccountSecurity.verifyEmailCode(code)) {
                    is AccountSecurityResult.Invalid -> result.message
                    is AccountSecurityResult.Unavailable -> result.message
                }
            }
        }
        Text(
            "Отмена",
            color = if (dark) Color(0xFFD1D5DB) else Color(0xFF6B7280),
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp).clickable(onClick = onClose),
        )
    }
}

@Composable
private fun SettingsSheet(dark: Boolean, onClose: () -> Unit, content: @Composable () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }, onClick = onClose),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {}
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
            ) {
                content()
            }
        }
    }
}

@Composable
private fun SheetHeader(icon: ImageVector, title: String, subtitle: String, dark: Boolean) {
    val colors = NextpariTheme.colors
    Row(Modifier.padding(bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151), modifier = Modifier.size(20.dp))
        }
        Column(Modifier.padding(start = 12.dp)) {
            Text(title, color = colors.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = colors.textMuted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun PasswordField(
    label: String,
    value: String,
    visible: Boolean,
    dark: Boolean,
    imeAction: ImeAction,
    onValueChange: (String) -> Unit,
    onToggle: () -> Unit,
    onIme: () -> Unit,
) {
    SheetFieldLabel(label, dark)
    Box {
        SheetTextField(
            value = value,
            onValueChange = onValueChange,
            dark = dark,
            keyboardType = KeyboardType.Password,
            imeAction = imeAction,
            onDone = onIme,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailing = true,
        )
        Icon(
            if (visible) NextpariWebIcons.EyeOff else NextpariWebIcons.Eye,
            contentDescription = if (visible) "Скрыть пароль" else "Показать пароль",
            tint = Color(0xFF9CA3AF),
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp)
                .size(16.dp)
                .clickable(onClick = onToggle),
        )
    }
}

@Composable
private fun SheetFieldLabel(label: String, dark: Boolean) {
    Text(
        label,
        color = if (dark) Color(0xFFD1D5DB) else Color(0xFF6B7280),
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 6.dp),
    )
}

@Composable
private fun SheetTextField(
    value: String,
    onValueChange: (String) -> Unit,
    dark: Boolean,
    keyboardType: KeyboardType,
    imeAction: ImeAction,
    onDone: () -> Unit,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: Boolean = false,
) {
    val colors = NextpariTheme.colors
    TextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        visualTransformation = visualTransformation,
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = keyboardType,
            imeAction = imeAction,
        ),
        keyboardActions = KeyboardActions(onNext = { onDone() }, onDone = { onDone() }),
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = if (dark) Color(0xFF374151) else Color(0xFFF3F4F6),
            unfocusedContainerColor = if (dark) Color(0xFF374151) else Color(0xFFF3F4F6),
            focusedTextColor = colors.text,
            unfocusedTextColor = colors.text,
            focusedIndicatorColor = BrandGreen,
            unfocusedIndicatorColor = if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB),
            cursorColor = BrandGreen,
        ),
        trailingIcon = if (trailing) {
            { Spacer(Modifier.width(28.dp)) }
        } else {
            null
        },
    )
}

@Composable
private fun PrimaryButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .padding(top = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrandGreen)
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

private fun grayIconBg(dark: Boolean) = if (dark) IconGrayDarkBg else IconGrayLightBg
private fun grayIconFg(dark: Boolean) = if (dark) IconGrayDarkFg else IconGrayLightFg
