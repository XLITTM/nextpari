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
) : ViewModel() {
    private val ui = MutableStateFlow(
        HomeUiState(
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
