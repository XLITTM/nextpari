package com.nextpari.app.feature.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class HistoryUiState(
    val bets: List<HistoryBetRow>,
    val transactions: List<HistoryTxRow>,
)

class HistoryViewModel(
    repository: HistoryRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(HistoryUiState(repository.bets(), repository.transactions()))
    val uiState: StateFlow<HistoryUiState> = ui.asStateFlow()

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HistoryViewModel(AppGraph.historyRepository) as T
            }
        }
    }
}
