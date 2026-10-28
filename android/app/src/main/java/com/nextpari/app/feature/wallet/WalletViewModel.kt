package com.nextpari.app.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

class WalletViewModel(
    private val repository: WalletRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(initialState())
    val uiState: StateFlow<WalletUiState> = ui.asStateFlow()
    private var idempotencyKey: String = UUID.randomUUID().toString()
    private var idempotencyFingerprint: String = ""

    init {
        refreshLocal()
    }

    fun openDeposit() {
        ui.update { it.copy(depositOpen = true, withdrawalFormOpen = false, copiedPlayerId = false, notice = null) }
    }

    fun closeDeposit() {
        ui.update { it.copy(depositOpen = false, copiedPlayerId = false) }
    }

    fun openWithdraw() {
        ui.update { it.copy(withdrawalFormOpen = true, restrictionOpen = false, depositOpen = false, notice = null) }
    }

    fun closeWithdraw() {
        ui.update { it.copy(withdrawalFormOpen = false) }
    }

    fun selectWithdrawMethod(method: WalletWithdrawMethod) {
        ui.update {
            it.copy(
                withdrawMethod = method,
                detail = "",
                cashCity = "",
                cashPointId = "",
                notice = null,
            )
        }
    }

    fun updateAmount(value: String) {
        ui.update { it.copy(amount = value.filter { ch -> ch.isDigit() || ch == '.' || ch == ',' }, notice = null) }
    }

    fun fillMaxAmount() {
        val available = ui.value.available ?: return
        ui.update { it.copy(amount = trimAmount(available), notice = null) }
    }

    fun updateDetail(value: String) {
        ui.update { it.copy(detail = value, notice = null) }
    }

    fun updateDestinationCity(city: String) {
        ui.update { it.copy(cashCity = city, cashPointId = "", notice = null) }
    }

    fun updateDestinationPoint(id: String) {
        ui.update { it.copy(cashPointId = id, notice = null) }
    }

    fun switchHistoryTab(tab: WalletHistoryTab) {
        ui.update { it.copy(historyTab = tab) }
    }

    fun closeRestriction() {
        ui.update { it.copy(restrictionOpen = false) }
    }

    fun retryDestinations() {
        refreshFinancials()
    }

    fun refreshFinancials() {
        if (ui.value.loading) return
        ui.update { it.copy(loading = true, cashDestinationsLoading = true, cashDestinationsError = "") }
        viewModelScope.launch {
            val financials = repository.loadFinancials()
            val snapshot = repository.snapshot()
            ui.update {
                it.copy(
                    loading = false,
                    financialsLoaded = true,
                    balanceLabel = WalletCatalog.balanceText(snapshot.displayBalance, snapshot.currency),
                    currency = snapshot.currency,
                    publicId = repository.publicId(),
                    available = repository.availableAmount(),
                    profileComplete = repository.profileComplete(),
                    withdrawals = financials.withdrawals,
                    withdrawalsError = financials.withdrawalsError,
                    cashDestinations = financials.destinations,
                    cashDestinationsLoaded = true,
                    cashDestinationsLoading = false,
                    cashDestinationsError = financials.destinationsError,
                    quoteTargets = financials.quoteTargets,
                )
            }
        }
    }

    fun markPlayerIdCopied(copied: Boolean) {
        ui.update { it.copy(copiedPlayerId = copied) }
    }

    fun consumeNotice() {
        ui.update { it.copy(notice = null) }
    }

    fun submitWithdraw() {
        val state = ui.value
        val localError = WalletActions.validateWithdraw(state)
        if (localError != null) {
            ui.update { it.copy(notice = localError) }
            return
        }
        if (state.withdrawMethod != WalletWithdrawMethod.CASH && !state.profileComplete) {
            ui.update { it.copy(restrictionOpen = true) }
            return
        }
        val amount = withdrawalAmount(state.amount)
        if (amount == null) {
            ui.update { it.copy(notice = WalletCatalog.INVALID_AMOUNT) }
            return
        }
        if (ui.value.submitting) return
        val point = state.cashDestinations.firstOrNull { it.id == state.cashPointId }
        val fingerprint = listOf(
            state.withdrawMethod.id,
            amount.toString(),
            state.detail,
            state.cashCity,
            point?.label.orEmpty(),
            state.cashPointId,
        ).joinToString("|")
        if (fingerprint != idempotencyFingerprint) {
            idempotencyFingerprint = fingerprint
            idempotencyKey = UUID.randomUUID().toString()
        }
        val key = idempotencyKey
        ui.update { it.copy(submitting = true, notice = null) }
        viewModelScope.launch {
            val result = repository.submitWithdrawal(
                WithdrawalSubmission(
                    method = state.withdrawMethod.id,
                    methodLabel = state.withdrawMethod.label,
                    amount = amount,
                    destinationRef = if (state.withdrawMethod == WalletWithdrawMethod.CASH) "" else state.detail,
                    city = state.cashCity,
                    point = point?.label.orEmpty(),
                    payoutDestinationId = if (state.withdrawMethod == WalletWithdrawMethod.CASH) state.cashPointId else "",
                    idempotencyKey = key,
                ),
            )
            result.onSuccess {
                idempotencyFingerprint = ""
                AppGraph.refreshPlayerState()
            }
            val refreshed = if (result.isSuccess) repository.loadFinancials() else null
            ui.update {
                it.copy(
                    submitting = false,
                    notice = result.exceptionOrNull()?.message ?: WalletCatalog.UNDER_REVIEW,
                    withdrawalFormOpen = result.isFailure,
                    withdrawals = refreshed?.withdrawals ?: it.withdrawals,
                    withdrawalsError = refreshed?.withdrawalsError ?: it.withdrawalsError,
                )
            }
        }
    }

    fun requestUsdtQuote(rawAmount: String) {
        val amount = rawAmount.trim()
        if (!amount.matches(Regex("^(?:0|[1-9]\\d{0,17})(?:\\.\\d{1,18})?$")) || !amount.any { it in '1'..'9' }) {
            ui.update { it.copy(quoteNotice = WalletCatalog.INVALID_AMOUNT) }
            return
        }
        val target = ui.value.quoteTargets.firstOrNull { it.currency == ui.value.currency }
            ?: ui.value.quoteTargets.firstOrNull()
        if (target == null) {
            ui.update { it.copy(quoteNotice = WalletCatalog.ADD_CURRENCY_FIRST) }
            return
        }
        viewModelScope.launch {
            val result = repository.quoteUsdt(amount, target.walletId)
            ui.update { it.copy(quoteNotice = result.getOrElse { error -> error.message ?: WalletMessages.QUOTE_FAILED }) }
        }
    }

    private fun refreshLocal() {
        val snapshot = repository.snapshot()
        ui.value = initialState().copy(
            balanceLabel = WalletCatalog.balanceText(snapshot.displayBalance, snapshot.currency),
            currency = snapshot.currency,
            publicId = repository.publicId(),
            available = repository.availableAmount(),
            profileComplete = repository.profileComplete(),
            loading = false,
            withdrawals = repository.withdrawals(),
            depositHistoryAvailable = false,
            cashDestinations = repository.payoutDestinations(),
            cashDestinationsLoaded = true,
            cashDestinationsLoading = false,
            cashDestinationsError = "",
        )
    }

    private fun initialState(): WalletUiState {
        val snapshot = repository.snapshot()
        return WalletUiState(
            balanceLabel = WalletCatalog.balanceText(snapshot.displayBalance, snapshot.currency),
            currency = snapshot.currency,
            publicId = repository.publicId(),
            available = repository.availableAmount(),
            profileComplete = repository.profileComplete(),
            loading = false,
        )
    }

    private fun trimAmount(value: Double): String =
        if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return WalletViewModel(AppGraph.walletRepository) as T
            }
        }
    }
}
