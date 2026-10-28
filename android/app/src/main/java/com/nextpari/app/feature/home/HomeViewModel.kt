package com.nextpari.app.feature.home

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.CreationExtras
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
    val liveMatches: List<MatchCardModel> = emptyList(),
    val lineMatches: List<MatchCardModel> = emptyList(),
    val esportsLive: List<MatchCardModel> = emptyList(),
    val esportsLine: List<MatchCardModel> = emptyList(),
    val esportsTournaments: List<EsportsTournament> = emptyList(),
    val esports: List<EsportsDiscipline> = emptyList(),
    val casinoFeatures: List<CasinoFeatureCard> = emptyList(),
    val casinoTournaments: List<CasinoTournament> = emptyList(),
    val casinoCategories: List<CasinoCategoryCard> = emptyList(),
    val loading: Boolean = false,
) {
    val filteredLive: List<MatchCardModel>
        get() = SportsbookFilters.matchesForSport(liveMatches, selectedSportId, excludeEsportsWhenAll = true)
    val filteredLine: List<MatchCardModel>
        get() = SportsbookFilters.matchesForSport(lineMatches, selectedSportId, excludeEsportsWhenAll = true)
    val championships: List<ChampionshipRow>
        get() = ChampionshipsMapper.fromLive(filteredLive, excludeEsports = true)
}

class HomeViewModel(
    repository: HomeCatalogRepository,
    private val savedState: SavedStateHandle = SavedStateHandle(),
) : ViewModel() {
    private val ui = MutableStateFlow(
        HomeUiState(
            mainTabId = savedState.get<String>(TAB_KEY) ?: MainTabsSpec.tabs.first().id,
            selectedSportId = savedState.get<String>(SPORT_KEY) ?: "all",
            sports = repository.sports(),
            promos = repository.promos(),
            liveMatches = repository.liveMatches(),
            lineMatches = repository.lineMatches(),
            esportsLive = repository.esportsLiveMatches(),
            esportsLine = repository.esportsLineMatches(),
            esportsTournaments = repository.esportsTournaments(),
            esports = repository.esportsDisciplines(),
            casinoFeatures = repository.casinoFeatures(),
            casinoTournaments = repository.casinoTournaments(),
            casinoCategories = repository.casinoCategories(),
        ),
    )
    val uiState: StateFlow<HomeUiState> = ui.asStateFlow()

    fun selectTab(id: String) {
        savedState[TAB_KEY] = id
        ui.value = ui.value.copy(mainTabId = id)
    }

    fun selectSport(id: String) {
        savedState[SPORT_KEY] = id
        ui.value = ui.value.copy(selectedSportId = id)
    }

    companion object {
        private const val TAB_KEY = "mainTabId"
        private const val SPORT_KEY = "selectedSportId"

        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                return HomeViewModel(AppGraph.homeCatalogRepository, extras.createSavedStateHandle()) as T
            }
        }
    }
}
