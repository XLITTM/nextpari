package com.nextpari.app.feature.wallet

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariGlyph
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

private val Brand500 = Color(0xFF22C55E)
private val Brand600 = Color(0xFF16A34A)
private val Brand700 = Color(0xFF15803D)
private val CardDark = Color(0xFF1E293B)
private val ModalDark = Color(0xFF161C28)
private val GreenBtn = Color(0xFF22C55E)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: WalletViewModel = viewModel(factory = WalletViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val context = LocalContext.current
    val screenBg = if (dark) Color(0xFF111827) else Color.White

    LaunchedEffect(state.notice) {
        val message = state.notice ?: return@LaunchedEffect
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        viewModel.consumeNotice()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(screenBg)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 112.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) CardDark else Color.White)
                    .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                NextpariGlyph(
                    imageVector = NextpariIcons.ChevronLeft,
                    contentDescription = "Назад",
                    tint = NextpariIconPalette.Action.Chevron,
                    size = 20.dp,
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(WalletCatalog.TITLE, color = colors.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        BalanceCard(state = state, dark = dark, onDeposit = viewModel::openDeposit, onWithdraw = viewModel::openWithdraw)

        if (state.withdrawalFormOpen) {
            WithdrawFormCard(state = state, dark = dark, viewModel = viewModel)
        }

        Column(Modifier.padding(start = 12.dp, end = 12.dp, top = 20.dp)) {
            Text(WalletCatalog.FINANCIAL_OPS, color = colors.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
            HistorySection(state = state, dark = dark, onTab = viewModel::switchHistoryTab, onCopyPin = { pin ->
                copyText(context, pin)
                Toast.makeText(context, "PIN скопирован", Toast.LENGTH_SHORT).show()
            })
        }
    }

    if (state.depositOpen) {
        DepositModal(
            publicId = state.publicId,
            copied = state.copiedPlayerId,
            quoteTargets = emptyList(),
            onClose = viewModel::closeDeposit,
            onCopyId = {
                val digits = WalletCatalog.digitsId(state.publicId)
                if (digits.isBlank()) {
                    Toast.makeText(context, WalletCatalog.COPY_ID_UNAVAILABLE, Toast.LENGTH_SHORT).show()
                } else {
                    copyText(context, digits)
                    viewModel.markPlayerIdCopied(true)
                }
            },
            onQuote = {
                Toast.makeText(context, viewModel.requestUsdtQuote(), Toast.LENGTH_SHORT).show()
            },
        )
    }

    if (state.restrictionOpen) {
        RestrictionModal(
            dark = dark,
            onAction = {
                viewModel.closeRestriction()
                onNavigate(Destinations.PERSONAL_DATA)
            },
            onClose = viewModel::closeRestriction,
        )
    }
}

@Composable
private fun BalanceCard(
    state: WalletUiState,
    dark: Boolean,
    onDeposit: () -> Unit,
    onWithdraw: () -> Unit,
) {
    Column(
        Modifier
            .padding(horizontal = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Brand500, Brand700)))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(WalletCatalog.AVAILABLE_BALANCE, color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
        Text(
            state.balanceLabel,
            color = Color.White,
            fontSize = 36.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
        )
        if (state.publicId.isNotBlank()) {
            Text(
                "${WalletCatalog.PLAYER_ID_PREFIX}${state.publicId}",
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.6.sp,
                modifier = Modifier.padding(bottom = 16.dp),
            )
        } else {
            Spacer(Modifier.height(16.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PressButton(
                modifier = Modifier.weight(1f),
                background = GreenBtn,
                onClick = onDeposit,
            ) {
                Icon(NextpariIcons.Download, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(WalletCatalog.DEPOSIT, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            PressButton(
                modifier = Modifier.weight(1f),
                background = if (dark) Color(0xFF374151) else Color(0xFF111827),
                onClick = onWithdraw,
            ) {
                Icon(NextpariIcons.Upload, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(WalletCatalog.WITHDRAW, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun PressButton(modifier: Modifier, background: Color, onClick: () -> Unit, content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.98f else 1f, label = "wallet-press")
    Row(
        modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .height(48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(background)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        content()
    }
}

@Composable
private fun WithdrawFormCard(state: WalletUiState, dark: Boolean, viewModel: WalletViewModel) {
    val colors = NextpariTheme.colors
    val cashReady = WalletCatalog.cashReady(
        state.withdrawMethod, state.amount, state.available, state.cashCity, state.cashPointId,
        state.cashDestinations, state.cashDestinationsLoaded, state.cashDestinationsLoading, state.cashDestinationsError,
    )
    val destinationsReady = WalletCatalog.cashDestinationsReady(
        state.cashDestinationsLoaded, state.cashDestinationsLoading, state.cashDestinationsError, state.cashDestinations,
    )
    val cashSubmitDisabled = state.submitting || (state.withdrawMethod == WalletWithdrawMethod.CASH && !cashReady)
    Column(
        Modifier
            .padding(start = 12.dp, end = 12.dp, top = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .background(if (dark) CardDark else Color.White)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(WalletCatalog.WITHDRAW_FORM_TITLE, color = colors.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Box(Modifier.size(32.dp).clickable(onClick = viewModel::closeWithdraw), contentAlignment = Alignment.Center) {
                NextpariGlyph(NextpariIcons.Close, contentDescription = "Закрыть", tint = Color(0xFF9CA3AF), size = 20.dp)
            }
        }
        FieldLabel(WalletCatalog.AMOUNT_LABEL, dark)
        WalletInput(
            value = state.amount,
            onValueChange = viewModel::updateAmount,
            placeholder = if (state.withdrawMethod == WalletWithdrawMethod.CASH) WalletCatalog.minCashLabel() else "0",
            dark = dark,
            keyboardType = KeyboardType.Decimal,
            large = true,
        )
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                WalletCatalog.availableHelper(state.available, state.currency, state.withdrawMethod == WalletWithdrawMethod.CASH),
                color = if (dark) Color(0xFFE5E7EB) else Color(0xFF6B7280),
                fontSize = 12.sp,
                modifier = Modifier.weight(1f),
            )
            Text(
                WalletCatalog.MAX_AMOUNT,
                color = Brand600,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = viewModel::fillMaxAmount),
            )
        }
        FieldLabel(WalletCatalog.METHOD_LABEL, dark)
        val methods = WalletCatalog.methods
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 12.dp)) {
            methods.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    row.forEach { method ->
                        val active = state.withdrawMethod == method
                        Column(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, if (active) Brand600 else if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                                .background(if (active) if (dark) Color(0x2616A34A) else Color(0xFFF0FDF4) else Color.Transparent)
                                .clickable { viewModel.selectWithdrawMethod(method) }
                                .padding(vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(methodIcon(method), contentDescription = null, tint = methodTint(method, active), modifier = Modifier.size(20.dp))
                            Text(method.label, color = if (active) Brand600 else colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        if (state.withdrawMethod != WalletWithdrawMethod.CASH) {
            FieldLabel(state.withdrawMethod.placeholder, dark)
            WalletInput(
                value = state.detail,
                onValueChange = viewModel::updateDetail,
                placeholder = state.withdrawMethod.placeholder,
                dark = dark,
                keyboardType = KeyboardType.Text,
            )
            Spacer(Modifier.height(16.dp))
        } else {
            if (state.cashDestinationsLoading) {
                Text(WalletCatalog.LOADING_CASHIERS, color = colors.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 8.dp))
            }
            if (!state.cashDestinationsLoading && state.cashDestinationsError.isNotBlank()) {
                Text(state.cashDestinationsError, color = Color(0xFFDC2626), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(WalletCatalog.RETRY, color = Brand600, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp).clickable(onClick = viewModel::retryDestinations))
            }
            if (!state.cashDestinationsLoading && state.cashDestinationsError.isBlank() && state.cashDestinationsLoaded && state.cashDestinations.isEmpty()) {
                Text(WalletCatalog.NO_CASHIERS, color = colors.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp))
            }
            if (destinationsReady) {
                val cities = state.cashDestinations.map { it.city }.distinct().sorted()
                val points = state.cashDestinations.filter { it.city == state.cashCity }
                SearchableSelect(
                    label = WalletCatalog.CITY,
                    placeholder = "Выберите город",
                    value = state.cashCity,
                    options = cities.map { it to it },
                    dark = dark,
                    onChange = viewModel::updateDestinationCity,
                )
                Spacer(Modifier.height(12.dp))
                SearchableSelect(
                    label = WalletCatalog.POINT,
                    placeholder = if (state.cashCity.isBlank()) "Сначала выберите город" else "Выберите точку выдачи",
                    value = state.cashPointId,
                    displayValue = points.firstOrNull { it.id == state.cashPointId }?.label,
                    options = points.map { it.id to it.label },
                    dark = dark,
                    enabled = state.cashCity.isNotBlank(),
                    onChange = viewModel::updateDestinationPoint,
                )
            }
            Text(WalletCatalog.CASH_HELPER, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
        }
        val submitBg = if (dark) Color.White else Color(0xFF111827)
        val submitFg = if (dark) Color(0xFF111827) else Color.White
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(submitBg)
                .clickable(enabled = !cashSubmitDisabled, onClick = viewModel::submitWithdraw)
                .padding(vertical = 14.dp)
                .then(if (cashSubmitDisabled) Modifier.graphicsLayer { alpha = 0.5f } else Modifier),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                if (state.withdrawMethod == WalletWithdrawMethod.CASH) NextpariIcons.Payments else NextpariIcons.Upload,
                contentDescription = null,
                tint = submitFg,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(if (state.submitting) "Обработка..." else WalletCatalog.REQUEST_WITHDRAW, color = submitFg, fontWeight = FontWeight.Bold)
        }
        if (state.withdrawMethod == WalletWithdrawMethod.CASH && destinationsReady && !cashReady && !state.submitting) {
            Text(WalletCatalog.CASH_HINT, color = colors.textMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
private fun HistorySection(
    state: WalletUiState,
    dark: Boolean,
    onTab: (WalletHistoryTab) -> Unit,
    onCopyPin: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
            .background(if (dark) CardDark else Color(0xFFF3F4F6))
            .padding(4.dp),
    ) {
        WalletCatalog.historyTabs.forEach { tab ->
            val active = state.historyTab == tab
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (active) if (dark) Color(0xFF374151) else Color.White else Color.Transparent)
                    .clickable { onTab(tab) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(tab.label, color = if (active) Brand600 else colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    if (state.historyTab == WalletHistoryTab.DEPOSITS) {
        Text(WalletCatalog.DEPOSITS_UNAVAILABLE, color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        return
    }
    when {
        state.loading -> Text(WalletCatalog.LOADING_WITHDRAWALS, color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        state.withdrawals.isEmpty() -> Text(WalletCatalog.EMPTY_WITHDRAWALS, color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        else -> state.withdrawals.forEach { item -> WithdrawalCard(item, dark, onCopyPin) }
    }
}

@Composable
private fun WithdrawalCard(model: WithdrawalUiModel, dark: Boolean, onCopyPin: (String) -> Unit) {
    val colors = NextpariTheme.colors
    val badge = statusColors(model.status)
    Column(
        Modifier
            .padding(bottom = 8.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, if (dark) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
            .background(if (dark) CardDark else Color.White)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f).padding(end = 8.dp)) {
                Text(model.methodLabel, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(model.createdAt, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
            }
            Row(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(badge.first)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(statusIcon(model.status), contentDescription = null, tint = badge.second, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(4.dp))
                Text(model.status.label, color = badge.second, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        if (WalletCatalog.showsPin(model) && !model.pinCode.isNullOrBlank()) {
            Row(
                Modifier
                    .padding(top = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, if (dark) Color(0xFF3F3F46) else Color(0xFFE4E4E7), RoundedCornerShape(8.dp))
                    .background(if (dark) Color(0xFF27272A) else Color(0xFFF4F4F5))
                    .clickable { onCopyPin(model.pinCode) }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("PIN: ${model.pinCode}", color = Color(0xFF059669), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(NextpariIcons.Copy, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(14.dp))
            }
            Text(WalletCatalog.PIN_HELPER, color = colors.textMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
        }
        if (WalletCatalog.showsUnderReview(model)) {
            Text(WalletCatalog.UNDER_REVIEW, color = Color(0xFFD97706), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
        }
        Text("− ${WalletCatalog.formatMoney(model.amount)} TMTM", color = Color(0xFFEF4444), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(top = 8.dp))
        WalletCatalog.rejectionCopy(model)?.let { copy ->
            Text(copy, color = Color(0xFFEF4444), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DepositModal(
    publicId: String,
    copied: Boolean,
    quoteTargets: List<UsdtQuoteTarget>,
    onClose: () -> Unit,
    onCopyId: () -> Unit,
    onQuote: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        containerColor = ModalDark,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(WalletCatalog.DEPOSIT_TITLE, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.05f)).clickable(onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    NextpariGlyph(NextpariIcons.Close, contentDescription = "Закрыть", tint = Color.White, size = 16.dp)
                }
            }
            Text(WalletCatalog.DEPOSIT_DESC, color = Color(0xFFCBD5E1), fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 8.dp))
            Row(
                Modifier
                    .padding(top = 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(alpha = 0.3f))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(WalletCatalog.PLAYER_ID_LABEL, color = Color(0xFF64748B), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
                    Text("#${WalletCatalog.playerIdLabel(publicId)}", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                }
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.1f)).clickable(onClick = onCopyId),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(NextpariIcons.Copy, contentDescription = "Скопировать ID игрока", tint = Color(0xFF6EE7B7), modifier = Modifier.size(16.dp))
                }
            }
            if (copied) {
                Text(WalletCatalog.COPIED, color = Color(0xFF34D399), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            }
            Box(Modifier.padding(top = 20.dp).fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.1f)))
            Text(WalletCatalog.USDT_TITLE, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 16.dp))
            Text(WalletCatalog.USDT_HINT, color = Color(0xFF94A3B8), fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
            if (quoteTargets.isEmpty()) {
                Text(WalletCatalog.ADD_CURRENCY_FIRST, color = Color(0xFF94A3B8), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            } else {
                Text(WalletCatalog.GET_QUOTE, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp).clickable(onClick = onQuote))
            }
            Box(
                Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFC89247))
                    .clickable(onClick = onClose)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(WalletCatalog.OPEN_WALLET, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars.union(WindowInsets.ime)))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RestrictionModal(dark: Boolean, onAction: () -> Unit, onClose: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        containerColor = if (dark) Color(0xFF1F2937) else Color.White,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(64.dp).clip(CircleShape).background(if (dark) Color(0x33F59E0B) else Color(0xFFFEF3C7)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(NextpariIcons.Warning, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(32.dp))
            }
            Text(WalletCatalog.RESTRICTION, color = NextpariTheme.colors.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Row(
                Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) Color.White else Color(0xFF111827))
                    .clickable(onClick = onAction)
                    .padding(vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(WalletCatalog.FILL_PROFILE, color = if (dark) Color(0xFF111827) else Color.White, fontWeight = FontWeight.Bold)
                Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = if (dark) Color(0xFF111827) else Color.White, modifier = Modifier.size(20.dp).padding(start = 4.dp))
            }
            Text(
                WalletCatalog.LATER,
                color = if (dark) Color(0xFFD1D5DB) else Color(0xFF6B7280),
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 8.dp).clickable(onClick = onClose),
            )
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars.union(WindowInsets.ime)))
        }
    }
}

@Composable
private fun SearchableSelect(
    label: String,
    placeholder: String,
    value: String,
    options: List<Pair<String, String>>,
    dark: Boolean,
    onChange: (String) -> Unit,
    displayValue: String? = null,
    enabled: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val selected = displayValue ?: options.firstOrNull { it.first == value }?.second.orEmpty()
    val filtered = options.filter { query.isBlank() || it.second.contains(query, ignoreCase = true) }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
            Icon(NextpariIcons.Place, contentDescription = null, tint = NextpariIconPalette.Action.Place, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(4.dp))
            FieldLabel(label, dark)
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(if (!enabled) if (dark) Color(0x99282828) else Color(0xFFF9FAFB) else if (dark) Color(0xFF374151) else Color(0xFFF3F4F6))
                .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                .clickable(enabled = enabled) { open = !open; query = "" }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                selected.ifBlank { placeholder },
                color = if (selected.isBlank()) Color(0xFF9CA3AF) else NextpariTheme.colors.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            NextpariGlyph(
                imageVector = NextpariIcons.ChevronDown,
                contentDescription = null,
                tint = NextpariIconPalette.Action.Chevron,
                size = 16.dp,
            )
        }
        if (open && enabled) {
            Column(
                Modifier
                    .padding(top = 4.dp)
                    .fillMaxWidth()
                    .shadow(8.dp, RoundedCornerShape(12.dp))
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                    .background(if (dark) Color(0xFF0F172A) else Color.White),
            ) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    NextpariGlyph(NextpariIcons.Search, contentDescription = null, tint = NextpariIconPalette.Action.Search, size = 16.dp)
                    Spacer(Modifier.width(8.dp))
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        textStyle = TextStyle(color = NextpariTheme.colors.text, fontSize = 14.sp),
                        cursorBrush = SolidColor(Brand600),
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { inner ->
                            if (query.isEmpty()) Text("Поиск…", color = Color(0xFF9CA3AF), fontSize = 14.sp)
                            inner()
                        },
                    )
                }
                if (filtered.isEmpty()) {
                    Text("Ничего не найдено", color = Color(0xFF6B7280), fontSize = 12.sp, modifier = Modifier.padding(12.dp))
                } else {
                    filtered.forEach { (id, label) ->
                        Text(
                            label,
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
}

@Composable
private fun FieldLabel(text: String, dark: Boolean) {
    Text(text, color = if (dark) Color(0xFFE5E7EB) else Color(0xFF6B7280), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
}

@Composable
private fun WalletInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    dark: Boolean,
    keyboardType: KeyboardType,
    large: Boolean = false,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF374151) else Color(0xFFF3F4F6))
            .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        if (value.isEmpty()) {
            Text(placeholder, color = Color(0xFF9CA3AF), fontSize = if (large) 18.sp else 14.sp, fontWeight = FontWeight.SemiBold)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            textStyle = TextStyle(
                color = NextpariTheme.colors.text,
                fontSize = if (large) 18.sp else 14.sp,
                fontWeight = FontWeight.Bold,
            ),
            cursorBrush = SolidColor(Brand600),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private fun methodIcon(method: WalletWithdrawMethod): ImageVector = when (method) {
    WalletWithdrawMethod.CRYPTO -> NextpariIcons.Bitcoin
    WalletWithdrawMethod.EWALLET -> NextpariIcons.Wallet
    WalletWithdrawMethod.CASH -> NextpariIcons.Payments
}

private fun methodTint(method: WalletWithdrawMethod, active: Boolean): Color {
    val semantic = when (method) {
        WalletWithdrawMethod.CRYPTO -> NextpariIconPalette.Action.Bitcoin
        WalletWithdrawMethod.EWALLET -> NextpariIconPalette.Action.Wallet
        WalletWithdrawMethod.CASH -> NextpariIconPalette.Action.Payments
    }
    return if (active) semantic else semantic.copy(alpha = 0.5f)
}

private fun statusIcon(status: WithdrawalStatus): ImageVector = when (status) {
    WithdrawalStatus.PENDING, WithdrawalStatus.EXPIRED -> NextpariIcons.Schedule
    WithdrawalStatus.APPROVED, WithdrawalStatus.PAID -> NextpariIcons.Check
    WithdrawalStatus.REJECTED, WithdrawalStatus.CANCELLED -> NextpariIcons.Cancel
}

private fun statusColors(status: WithdrawalStatus): Pair<Color, Color> = when (status) {
    WithdrawalStatus.PENDING -> Color(0x33F59E0B) to Color(0xFFF59E0B)
    WithdrawalStatus.APPROVED -> Color(0x333B82F6) to Color(0xFF3B82F6)
    WithdrawalStatus.PAID -> Color(0x3322C55E) to Color(0xFF22C55E)
    WithdrawalStatus.REJECTED -> Color(0x33EF4444) to Color(0xFFEF4444)
    WithdrawalStatus.CANCELLED, WithdrawalStatus.EXPIRED -> Color(0x3364748B) to Color(0xFF94A3B8)
}

private fun copyText(context: Context, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Nextpari", value))
}
