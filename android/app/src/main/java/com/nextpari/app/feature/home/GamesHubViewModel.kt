package com.nextpari.app.feature.home

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
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
    private val savedState: SavedStateHandle = SavedStateHandle(),
) : ViewModel() {
    private val ui = MutableStateFlow(restoredState())
    val uiState: StateFlow<GamesHubUiState> = ui.asStateFlow()

    init {
        viewModelScope.launch {
            val stored = preferences.getString(FAVORITES_KEY).orEmpty()
            val favorites = stored.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
            publish(ui.value.copy(favorites = favorites))
        }
    }

    fun setQuery(value: String) {
        publish(ui.value.copy(query = value))
    }

    fun toggleSearch() {
        val open = !ui.value.searchOpen
        publish(ui.value.copy(searchOpen = open, query = if (open) ui.value.query else ""))
    }

    fun setCategory(id: String) {
        publish(ui.value.copy(category = id))
    }

    fun setLobby(id: String) {
        publish(ui.value.copy(lobby = id))
    }

    fun toggleSort() {
        publish(ui.value.copy(sortAz = !ui.value.sortAz))
    }

    fun toggleWalletMenu() {
        publish(ui.value.copy(walletMenu = !ui.value.walletMenu))
    }

    fun toggleFavorite(id: String) {
        val next = ui.value.favorites.toMutableSet()
        if (!next.add(id)) next.remove(id)
        publish(ui.value.copy(favorites = next))
        viewModelScope.launch { preferences.putString(FAVORITES_KEY, next.joinToString(",")) }
    }

    private fun restoredState(): GamesHubUiState {
        val category = savedState.get<String>(CATEGORY_KEY) ?: "all"
        val lobby = savedState.get<String>(LOBBY_KEY) ?: "all"
        val query = savedState.get<String>(QUERY_KEY).orEmpty()
        val searchOpen = savedState.get<Boolean>(SEARCH_KEY) ?: false
        val sortAz = savedState.get<Boolean>(SORT_KEY) ?: false
        return GamesHubUiState(
            query = query,
            searchOpen = searchOpen,
            category = category,
            lobby = lobby,
            sortAz = sortAz,
            games = GamesCatalog.visibleGames(category, lobby, query, emptySet(), sortAz),
        )
    }

    private fun publish(next: GamesHubUiState) {
        savedState[CATEGORY_KEY] = next.category
        savedState[LOBBY_KEY] = next.lobby
        savedState[QUERY_KEY] = next.query
        savedState[SEARCH_KEY] = next.searchOpen
        savedState[SORT_KEY] = next.sortAz
        ui.value = next.copy(
            games = GamesCatalog.visibleGames(
                category = next.category,
                lobby = next.lobby,
                query = next.query,
                favorites = next.favorites,
                sortAz = next.sortAz,
            ),
        )
    }

    companion object {
        const val FAVORITES_KEY = "nextpari-game-favorites"
        private const val CATEGORY_KEY = "gamesCategory"
        private const val LOBBY_KEY = "gamesLobby"
        private const val QUERY_KEY = "gamesQuery"
        private const val SEARCH_KEY = "gamesSearch"
        private const val SORT_KEY = "gamesSort"

        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                return GamesHubViewModel(AppGraph.preferencesStorage, extras.createSavedStateHandle()) as T
            }
        }
    }
}
