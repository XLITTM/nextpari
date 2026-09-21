package com.nextpari.app.feature.profile

import android.app.DatePickerDialog
import android.widget.Toast
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.settings.AccountSecurity
import com.nextpari.app.feature.settings.AccountSecurityResult
import java.time.LocalDate
import java.util.Calendar

private val BrandGreen = Color(0xFF16A34A)
private val Brand700 = Color(0xFF15803D)

@Composable
fun PersonalDataScreen(
    onBack: () -> Unit,
    viewModel: PersonalDataViewModel = viewModel(factory = PersonalDataViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val context = LocalContext.current
    val screenBg = if (dark) Color(0xFF111827) else Color.White
    val cardBg = if (dark) Color(0xFF1F2937) else Color.White
    val border = if (dark) Color(0xFF374151) else Color(0xFFE5E7EB)
    val fields = state.fields
    val data = state.questionnaire
    val locked = data.identityLocked
    val verified = data.verificationStatus == "VERIFIED"
    val countryOptions = Iso3166Countries.playerOptions.map { it.value to it.label }

    LaunchedEffect(state.notice) {
        val notice = state.notice ?: return@LaunchedEffect
        Toast.makeText(context, notice, Toast.LENGTH_SHORT).show()
        viewModel.consumeNotice()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(screenBg)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp).padding(top = 8.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFD1D5DB), RoundedCornerShape(12.dp))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    NextpariWebIcons.ChevronLeft,
                    contentDescription = "Назад",
                    tint = colors.text,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                PersonalDataCatalog.TITLE,
                color = colors.text,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        Column(Modifier.padding(horizontal = 12.dp)) {
            if (verified) {
                FormCard(cardBg, border) {
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (dark) Color(0x2616A34A) else Color(0xFFF0FDF4))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(NextpariWebIcons.ShieldCheck, contentDescription = null, tint = Brand700, modifier = Modifier.size(14.dp))
                        Text(
                            PersonalDataCatalog.VERIFIED_BADGE,
                            color = Brand700,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                    if (locked) {
                        Text(
                            PersonalDataCatalog.IDENTITY_LOCKED_HELP,
                            color = colors.textMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        if (!data.supportConfigured) {
                            Text(
                                PersonalDataCatalog.SUPPORT_FALLBACK,
                                color = colors.textMuted,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            FormCard(cardBg, border) {
                CardTitle(PersonalDataCatalog.CARD_IDENTITY)
                FieldInput(PersonalDataCatalog.FIELD_FIRST_NAME, fields.firstName, "Иван", dark, locked) { value ->
                    viewModel.update { it.copy(firstName = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_LAST_NAME, fields.lastName, "Иванов", dark, locked) { value ->
                    viewModel.update { it.copy(lastName = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_MIDDLE_NAME, fields.middleName, "Иванович", dark, locked) { value ->
                    viewModel.update { it.copy(middleName = value) }
                }
                DateField(PersonalDataCatalog.FIELD_DOB, fields.dateOfBirth, dark, locked, maxDateToday = true) { value ->
                    viewModel.update { it.copy(dateOfBirth = value) }
                }
                OptionSelect(PersonalDataCatalog.FIELD_CITIZENSHIP, fields.citizenshipCountryCode, countryOptions, dark, locked) { value ->
                    viewModel.update { it.copy(citizenshipCountryCode = value) }
                }
            }
            Spacer(Modifier.height(16.dp))

            FormCard(cardBg, border) {
                CardTitle(PersonalDataCatalog.CARD_ADDRESS)
                OptionSelect(PersonalDataCatalog.FIELD_RESIDENCE_COUNTRY, fields.residenceCountryCode, countryOptions, dark, false) { value ->
                    viewModel.update { it.copy(residenceCountryCode = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_CITY, fields.residenceCity, "Ашхабад", dark, false) { value ->
                    viewModel.update { it.copy(residenceCity = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_ADDRESS, fields.addressLine1, "Улица, дом", dark, false) { value ->
                    viewModel.update { it.copy(addressLine1 = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_ADDRESS2, fields.addressLine2, "Квартира, корпус", dark, false) { value ->
                    viewModel.update { it.copy(addressLine2 = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_POSTAL, fields.postalCode, "744000", dark, false) { value ->
                    viewModel.update { it.copy(postalCode = value) }
                }
            }
            Spacer(Modifier.height(16.dp))

            FormCard(cardBg, border) {
                CardTitle(PersonalDataCatalog.CARD_DOCUMENT)
                OptionSelect(
                    PersonalDataCatalog.FIELD_DOC_TYPE,
                    fields.documentType,
                    PersonalDataCatalog.documentTypes.map { it.value to it.label },
                    dark,
                    locked,
                    searchable = false,
                ) { value ->
                    viewModel.update { it.copy(documentType = value) }
                }
                OptionSelect(PersonalDataCatalog.FIELD_DOC_COUNTRY, fields.documentIssuingCountryCode, countryOptions, dark, locked) { value ->
                    viewModel.update { it.copy(documentIssuingCountryCode = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_DOC_SERIES, fields.documentSeries, "Необязательно", dark, locked) { value ->
                    viewModel.update { it.copy(documentSeries = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_DOC_NUMBER, fields.documentNumber, "Номер", dark, locked) { value ->
                    viewModel.update { it.copy(documentNumber = value) }
                }
                DateField(PersonalDataCatalog.FIELD_ISSUE_DATE, fields.documentIssueDate, dark, locked, maxDateToday = true) { value ->
                    viewModel.update { it.copy(documentIssueDate = value) }
                }
                DateField(PersonalDataCatalog.FIELD_EXPIRY, fields.documentExpiryDate, dark, locked, maxDateToday = false) { value ->
                    viewModel.update { it.copy(documentExpiryDate = value) }
                }
                FieldInput(PersonalDataCatalog.FIELD_ISSUED_BY, fields.documentIssuingAuthority, "Необязательно", dark, locked) { value ->
                    viewModel.update { it.copy(documentIssuingAuthority = value) }
                }
            }
            Spacer(Modifier.height(16.dp))

            FormCard(cardBg, border) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    CardTitle(PersonalDataCatalog.CARD_PHONE, Modifier.weight(1f))
                    if (data.phoneVerified) VerifiedBadge()
                }
                IconValue(NextpariWebIcons.Phone, data.phone, PersonalDataCatalog.PHONE_PLACEHOLDER, dark)
                Text(PersonalDataCatalog.PHONE_HELPER, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(16.dp))

            FormCard(cardBg, border) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    CardTitle(PersonalDataCatalog.CARD_EMAIL, Modifier.weight(1f))
                    if (data.emailVerified && data.email.isNotBlank()) VerifiedBadge()
                }
                IconValue(NextpariWebIcons.Mail, data.email, PersonalDataCatalog.EMAIL_PLACEHOLDER, dark)
                Text(
                    if (data.email.isNotBlank() && data.emailVerified) "${data.email} · Подтверждена ✓" else PersonalDataCatalog.EMAIL_HELPER,
                    color = colors.textMuted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Box(
                    Modifier
                        .padding(top = 12.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (dark) Color.White else Color(0xFF111827))
                        .clickable(onClick = viewModel::openEmail)
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        PersonalDataCatalog.emailActionLabel(data.email, data.emailVerified),
                        color = if (dark) Color(0xFF111827) else Color.White,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(BrandGreen.copy(alpha = if (state.saving) 0.5f else 1f))
                    .clickable(enabled = !state.saving, onClick = viewModel::save)
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(NextpariWebIcons.Save, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Text(
                        if (state.saving) PersonalDataCatalog.SAVING else PersonalDataCatalog.SAVE,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
    }

    if (state.emailOpen) {
        EmailBindDialog(dark = dark, onClose = viewModel::closeEmail)
    }
}

@Composable
private fun FormCard(background: Color, border: Color, content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        content()
    }
}

@Composable
private fun CardTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = modifier.padding(bottom = 12.dp))
}

@Composable
private fun FieldInput(
    label: String,
    value: String,
    placeholder: String,
    dark: Boolean,
    locked: Boolean,
    onChange: (String) -> Unit,
) {
    Column(Modifier.padding(bottom = 12.dp)) {
        FieldLabel(label)
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(fieldBg(dark, locked))
                .border(1.dp, fieldBorder(dark), RoundedCornerShape(12.dp))
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            if (value.isEmpty()) {
                Text(placeholder, color = Color(0xFF9CA3AF), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            BasicTextField(
                value = value,
                onValueChange = { if (!locked) onChange(it) },
                readOnly = locked,
                singleLine = true,
                textStyle = TextStyle(color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                cursorBrush = SolidColor(BrandGreen),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DateField(
    label: String,
    value: String,
    dark: Boolean,
    locked: Boolean,
    maxDateToday: Boolean,
    onChange: (String) -> Unit,
) {
    val context = LocalContext.current
    Column(Modifier.padding(bottom = 12.dp)) {
        FieldLabel(label)
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(fieldBg(dark, locked))
                .border(1.dp, fieldBorder(dark), RoundedCornerShape(12.dp))
                .clickable(enabled = !locked) {
                    val current = PersonalDataCatalog.parseDate(value) ?: LocalDate.now()
                    DatePickerDialog(
                        context,
                        { _, year, month, day ->
                            onChange("%04d-%02d-%02d".format(year, month + 1, day))
                        },
                        current.year,
                        current.monthValue - 1,
                        current.dayOfMonth,
                    ).apply {
                        if (maxDateToday) datePicker.maxDate = Calendar.getInstance().timeInMillis
                    }.show()
                }
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(
                value.ifBlank { "гггг-мм-дд" },
                color = if (value.isBlank()) Color(0xFF9CA3AF) else NextpariTheme.colors.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun OptionSelect(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    dark: Boolean,
    locked: Boolean,
    searchable: Boolean = true,
    onChange: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val selected = options.firstOrNull { it.first == value }?.second ?: value
    val filtered = options.filter { query.isBlank() || it.second.contains(query, ignoreCase = true) || it.first.contains(query, ignoreCase = true) }
    Column(Modifier.padding(bottom = 12.dp)) {
        FieldLabel(label)
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(fieldBg(dark, locked))
                .border(1.dp, fieldBorder(dark), RoundedCornerShape(12.dp))
                .clickable(enabled = !locked) { open = !open; query = "" }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                selected.ifBlank { "Не выбрано" },
                color = NextpariTheme.colors.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Icon(NextpariWebIcons.ChevronDown, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
        }
        if (open && !locked) {
            Column(
                Modifier
                    .padding(top = 4.dp)
                    .fillMaxWidth()
                    .shadow(8.dp, RoundedCornerShape(12.dp))
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, fieldBorder(dark), RoundedCornerShape(12.dp))
                    .background(if (dark) Color(0xFF0F172A) else Color.White)
                    .heightIn(max = 240.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                if (searchable) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(NextpariWebIcons.Search, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
                        Spacer(Modifier.size(8.dp))
                        BasicTextField(
                            value = query,
                            onValueChange = { query = it },
                            singleLine = true,
                            textStyle = TextStyle(color = NextpariTheme.colors.text, fontSize = 14.sp),
                            cursorBrush = SolidColor(BrandGreen),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                if (query.isEmpty()) Text("Поиск…", color = Color(0xFF9CA3AF), fontSize = 14.sp)
                                inner()
                            },
                        )
                    }
                }
                filtered.forEach { (id, optionLabel) ->
                    Text(
                        optionLabel,
                        color = if (id == value) Brand700 else NextpariTheme.colors.text,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onChange(id); open = false; query = "" }
                            .background(if (id == value) if (dark) Color(0x3316A34A) else Color(0xFFF0FDF4) else Color.Transparent)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun IconValue(icon: ImageVector, value: String, placeholder: String, dark: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF374151) else Color(0xFFF3F4F6))
            .border(1.dp, fieldBorder(dark), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
        Text(
            value.ifBlank { placeholder },
            color = if (value.isBlank()) Color(0xFF9CA3AF) else NextpariTheme.colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
private fun VerifiedBadge() {
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0x2616A34A))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(NextpariWebIcons.CheckCircle2, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(12.dp))
        Text(PersonalDataCatalog.VERIFIED, color = BrandGreen, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 4.dp))
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, color = NextpariTheme.colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
}

@Composable
private fun EmailBindDialog(dark: Boolean, onClose: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onClose),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {}
                    .imePadding()
                    .padding(20.dp),
            ) {
                Text("Привязать почту", color = NextpariTheme.colors.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                FieldInput("Email", email, "email@example.com", dark, false) { email = it; error = "" }
                if (error.isNotBlank()) {
                    Text(error, color = Color(0xFFEF4444), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp))
                }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(BrandGreen)
                        .clickable {
                            error = when (val result = AccountSecurity.startEmailBinding(email)) {
                                is AccountSecurityResult.Invalid -> result.message
                                is AccountSecurityResult.Unavailable -> result.message
                            }
                        }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Продолжить", color = Color.White, fontWeight = FontWeight.Bold)
                }
                Text(
                    "Отмена",
                    color = NextpariTheme.colors.textMuted,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp).clickable(onClick = onClose),
                )
            }
        }
    }
}

private fun fieldBg(dark: Boolean, locked: Boolean): Color = when {
    locked && dark -> Color(0xB3374151)
    locked -> Color(0xFFE5E7EB)
    dark -> Color(0xFF374151)
    else -> Color(0xFFF3F4F6)
}

private fun fieldBorder(dark: Boolean): Color = if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB)
