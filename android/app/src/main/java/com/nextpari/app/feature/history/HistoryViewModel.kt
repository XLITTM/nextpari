package com.nextpari.app.feature.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HistoryUiState(
    val bets: List<HistoryBetRow> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class HistoryViewModel(
    private val repository: HistoryRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(HistoryUiState())
    val uiState: StateFlow<HistoryUiState> = ui.asStateFlow()

    fun refresh() {
        ui.value = HistoryUiState(loading = true)
        viewModelScope.launch {
            val result = repository.loadBets()
            ui.value = HistoryUiState(
                bets = result.getOrDefault(emptyList()),
                loading = false,
                error = result.exceptionOrNull()?.message,
            )
        }
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HistoryViewModel(AppGraph.historyRepository) as T
            }
        }
    }
}
