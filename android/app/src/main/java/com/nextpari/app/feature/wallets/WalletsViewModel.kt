package com.nextpari.app.feature.wallets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class WalletsViewModel(
    private val repository: WalletsRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(loadState())
    val uiState: StateFlow<WalletsUiState> = ui.asStateFlow()

    fun refresh() {
        val owned = repository.ownedWallets()
        ui.update {
            it.copy(
                owned = owned,
                addable = WalletsCatalog.addable(owned),
                busy = false,
            )
        }
    }

    fun addCurrency(code: String): Boolean = mutate { repository.addWallet(code) }

    fun activate(code: String): Boolean = mutate { repository.setActiveWallet(code) }

    fun consumeNotice() {
        ui.update { it.copy(notice = null) }
    }

    private fun mutate(action: () -> Result<Unit>): Boolean {
        if (ui.value.busy) return false
        ui.update { it.copy(busy = true, notice = null) }
        val result = action()
        if (result.isSuccess) {
            val owned = repository.ownedWallets()
            ui.update {
                it.copy(
                    owned = owned,
                    addable = WalletsCatalog.addable(owned),
                    busy = false,
                    notice = null,
                )
            }
            return true
        }
        ui.update {
            it.copy(
                busy = false,
                notice = result.exceptionOrNull()?.message ?: WalletsCatalog.SESSION_UNAVAILABLE,
            )
        }
        return false
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
                return WalletsViewModel(AppGraph.walletsRepository) as T
            }
        }
    }
}
