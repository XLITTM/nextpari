package com.nextpari.app.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val oddsRepository: OddsChangePolicyRepository,
) : ViewModel() {
    private val policy = MutableStateFlow(OddsChangePolicy.INCREASE)
    val oddsPolicy: StateFlow<OddsChangePolicy> = policy.asStateFlow()

    init {
        viewModelScope.launch {
            policy.value = oddsRepository.read()
        }
    }

    fun selectOddsPolicy(next: OddsChangePolicy) {
        if (next == policy.value) return
        policy.value = next
        viewModelScope.launch { oddsRepository.write(next) }
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return SettingsViewModel(OddsChangePolicyRepository(AppGraph.preferencesStorage)) as T
            }
        }
    }
}
