package com.nextpari.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.navigation.MainTabsSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class HomeUiState(
    val mainTabId: String = MainTabsSpec.tabs.first().id,
    val selectedSportId: String = "all",
    val sports: List<HomeSport> = emptyList(),
    val promos: List<HomePromo> = emptyList(),
    val liveTitles: List<String> = emptyList(),
    val lineTitles: List<String> = emptyList(),
    val championships: List<String> = emptyList(),
    val esports: List<EsportsDiscipline> = emptyList(),
    val loading: Boolean = false,
)

class HomeViewModel(
    repository: HomeCatalogRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(
        HomeUiState(
            sports = repository.sports(),
            promos = repository.promos(),
            liveTitles = repository.liveTitles(),
            lineTitles = repository.lineTitles(),
            championships = repository.championships(),
            esports = repository.esportsDisciplines(),
        ),
    )
    val uiState: StateFlow<HomeUiState> = ui.asStateFlow()

    fun selectTab(id: String) {
        ui.value = ui.value.copy(mainTabId = id)
    }

    fun selectSport(id: String) {
        ui.value = ui.value.copy(selectedSportId = id)
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HomeViewModel(AppGraph.homeCatalogRepository) as T
            }
        }
    }
}
