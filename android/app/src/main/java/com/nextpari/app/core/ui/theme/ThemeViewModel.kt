package com.nextpari.app.core.ui.theme

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ThemeViewModel(
    private val repository: ThemeRepository,
) : ViewModel() {
    private val dark = MutableStateFlow(false)
    val darkTheme: StateFlow<Boolean> = dark.asStateFlow()

    init {
        viewModelScope.launch {
            dark.value = repository.isDark(repository.read())
        }
    }

    fun toggle() {
        viewModelScope.launch {
            val next = !dark.value
            dark.value = next
            repository.write(if (next) ThemeRepository.DARK else ThemeRepository.LIGHT)
        }
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return ThemeViewModel(ThemeRepository(AppGraph.preferencesStorage)) as T
            }
        }
    }
}
