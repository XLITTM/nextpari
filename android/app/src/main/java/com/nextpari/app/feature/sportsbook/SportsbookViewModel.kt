package com.nextpari.app.feature.sportsbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.nextpari.app.core.AppGraph
import com.nextpari.app.feature.home.HomeCatalogRepository
import com.nextpari.app.feature.home.MatchCardModel

class SportsbookViewModel(
    private val catalog: HomeCatalogRepository,
) : ViewModel() {
    val loading: Boolean = false
    var selectedMode: String = "live"
        private set

    fun rememberMode(mode: String): String {
        selectedMode = if (mode == "line") "line" else "live"
        return selectedMode
    }

    fun live(): List<MatchCardModel> = catalog.liveMatches()
    fun line(): List<MatchCardModel> = catalog.lineMatches()

    fun pool(mode: String): List<MatchCardModel> = SportsbookCatalog.pool(mode, live(), line())

    fun sportRows(tab: String): List<SportListRow> = SportsListCatalog.rows(tab, live(), line())

    fun championships(sport: String, mode: String): List<CountryGroup> =
        CountryGrouping.groupByCountry(pool(mode).filter { it.sport == sport })

    fun leagueMatches(leagueId: String, mode: String): List<MatchCardModel> =
        LeagueMatches.filter(pool(mode), leagueId)

    fun matchById(id: String): MatchCardModel? = catalog.matchById(id)

    fun marketsFor(eventId: String): List<MarketGroup> = catalog.marketsFor(eventId)

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return SportsbookViewModel(AppGraph.homeCatalogRepository) as T
            }
        }
    }
}
