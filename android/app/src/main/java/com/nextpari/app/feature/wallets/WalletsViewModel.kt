package com.nextpari.app.feature.wallets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class WalletsViewModel(
    private val repository: WalletsRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(loadState())
    val uiState: StateFlow<WalletsUiState> = ui.asStateFlow()

    fun addCurrency(code: String) {
        mutate { repository.addWallet(code) }
    }

    fun activate(code: String) {
        mutate { repository.setActiveWallet(code) }
    }

    fun consumeNotice() {
        ui.update { it.copy(notice = null) }
    }

    private fun mutate(action: () -> Result<Unit>) {
        if (ui.value.busy) return
        ui.update { it.copy(busy = true, notice = null) }
        val result = action()
        ui.update {
            it.copy(
                busy = false,
                notice = result.exceptionOrNull()?.message ?: WalletsCatalog.SESSION_UNAVAILABLE,
            )
        }
    }

    private fun loadState(): WalletsUiState {
        val owned = repository.ownedWallets()
        return WalletsUiState(
            owned = owned,
            addable = WalletsCatalog.addable(owned),
        )
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return WalletsViewModel(FakeWalletsRepository()) as T
            }
        }
    }
}
