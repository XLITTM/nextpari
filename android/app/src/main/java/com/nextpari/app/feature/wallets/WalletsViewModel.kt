package com.nextpari.app.feature.wallets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class WalletsViewModel(
    private val repository: WalletsRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(loadState())
    val uiState: StateFlow<WalletsUiState> = ui.asStateFlow()

    fun refresh() {
        if (ui.value.busy) {
            publishOwned()
            return
        }
        publishOwned()
        ui.update { it.copy(busy = true) }
        viewModelScope.launch {
            val result = try {
                repository.refresh()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Result.failure(IllegalStateException(error.message ?: WalletsCatalog.REFRESH_FAILED))
            }
            publishOutcome(result, closeMenu = false)
        }
    }

    fun addCurrency(code: String): Boolean = mutate { repository.addWallet(code) }

    fun activate(code: String): Boolean = mutate { repository.setActiveWallet(code) }

    fun consumeNotice() {
        ui.update { it.copy(notice = null) }
    }

    private fun mutate(action: suspend () -> Result<Unit>): Boolean {
        if (ui.value.busy) return false
        val before = ui.value.completedMutations
        ui.update { it.copy(busy = true, notice = null) }
        viewModelScope.launch {
            val result = try {
                action()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Result.failure(IllegalStateException(error.message ?: WalletsCatalog.OPERATION_FAILED))
            }
            publishOutcome(result, closeMenu = result.isSuccess)
        }
        val state = ui.value
        return state.completedMutations > before && state.notice == null
    }

    private fun publishOutcome(result: Result<Unit>, closeMenu: Boolean) {
        val owned = repository.ownedWallets()
        ui.update {
            it.copy(
                owned = owned,
                addable = WalletsCatalog.addable(owned),
                busy = false,
                notice = if (result.isFailure) {
                    result.exceptionOrNull()?.message ?: WalletsCatalog.SESSION_UNAVAILABLE
                } else {
                    null
                },
                completedMutations = if (closeMenu) it.completedMutations + 1 else it.completedMutations,
            )
        }
    }

    private fun publishOwned() {
        val owned = repository.ownedWallets()
        ui.update {
            it.copy(
                owned = owned,
                addable = WalletsCatalog.addable(owned),
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
                return WalletsViewModel(AppGraph.walletsRepository) as T
            }
        }
    }
}
