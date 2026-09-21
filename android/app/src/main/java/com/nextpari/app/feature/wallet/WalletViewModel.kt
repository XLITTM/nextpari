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

class WalletViewModel(
    private val repository: WalletRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(initialState())
    val uiState: StateFlow<WalletUiState> = ui.asStateFlow()

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
        viewModelScope.launch { loadDestinations() }
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
        ui.update { it.copy(notice = WalletCatalog.SESSION_UNAVAILABLE, submitting = false) }
    }

    fun requestUsdtQuote(): String = WalletCatalog.SESSION_UNAVAILABLE

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

    private fun loadDestinations() {
        ui.update { it.copy(cashDestinationsLoading = true, cashDestinationsError = "") }
        val rows = repository.payoutDestinations()
        ui.update {
            it.copy(
                cashDestinations = rows,
                cashDestinationsLoaded = true,
                cashDestinationsLoading = false,
                cashDestinationsError = "",
                cashCity = "",
                cashPointId = "",
            )
        }
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
