package com.nextpari.app.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class WalletUiState(
    val snapshot: WalletSnapshot,
    val transactions: List<MockTransaction>,
)

class WalletViewModel(
    repository: WalletRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(
        WalletUiState(snapshot = repository.snapshot(), transactions = repository.mockTransactions()),
    )
    val uiState: StateFlow<WalletUiState> = ui.asStateFlow()

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return WalletViewModel(AppGraph.walletRepository) as T
            }
        }
    }
}
