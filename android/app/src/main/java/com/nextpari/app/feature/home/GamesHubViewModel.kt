package com.nextpari.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.storage.PreferencesStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class GamesHubUiState(
    val query: String = "",
    val searchOpen: Boolean = false,
    val category: String = "all",
    val lobby: String = "all",
    val sortAz: Boolean = false,
    val favorites: Set<String> = emptySet(),
    val walletMenu: Boolean = false,
    val games: List<HubGame> = emptyList(),
)

class GamesHubViewModel(
    private val preferences: PreferencesStorage,
) : ViewModel() {
    private val ui = MutableStateFlow(GamesHubUiState())
    val uiState: StateFlow<GamesHubUiState> = ui.asStateFlow()

    init {
        viewModelScope.launch {
            val stored = preferences.getString(FAVORITES_KEY).orEmpty()
            val favorites = stored.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
            ui.value = ui.value.copy(
                favorites = favorites,
                games = GamesCatalog.visibleGames("all", "all", "", favorites, false),
            )
        }
        refresh()
    }

    fun setQuery(value: String) {
        ui.value = ui.value.copy(query = value)
        refresh()
    }

    fun toggleSearch() {
        val open = !ui.value.searchOpen
        ui.value = ui.value.copy(searchOpen = open, query = if (open) ui.value.query else "")
        refresh()
    }

    fun setCategory(id: String) {
        ui.value = ui.value.copy(category = id)
        refresh()
    }

    fun setLobby(id: String) {
        ui.value = ui.value.copy(lobby = id)
        refresh()
    }

    fun toggleSort() {
        ui.value = ui.value.copy(sortAz = !ui.value.sortAz)
        refresh()
    }

    fun toggleWalletMenu() {
        ui.value = ui.value.copy(walletMenu = !ui.value.walletMenu)
    }

    fun toggleFavorite(id: String) {
        val next = ui.value.favorites.toMutableSet()
        if (!next.add(id)) next.remove(id)
        ui.value = ui.value.copy(favorites = next)
        viewModelScope.launch { preferences.putString(FAVORITES_KEY, next.joinToString(",")) }
        refresh()
    }

    private fun refresh() {
        val current = ui.value
        ui.value = current.copy(
            games = GamesCatalog.visibleGames(
                category = current.category,
                lobby = current.lobby,
                query = current.query,
                favorites = current.favorites,
                sortAz = current.sortAz,
            ),
        )
    }

    companion object {
        const val FAVORITES_KEY = "nextpari-game-favorites"
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return GamesHubViewModel(AppGraph.preferencesStorage) as T
            }
        }
    }
}
