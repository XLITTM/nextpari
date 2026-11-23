package com.nextpari.app.feature.casino

import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.storage.PreferencesStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
internal data class CasinoLibrary(
    val favoriteIds: List<String> = emptyList(),
    val recentIds: List<String> = emptyList(),
    val games: List<CasinoDemoGame> = emptyList(),
)

internal object CasinoLibraryStore {
    private const val STORAGE_KEY = "nextpari.casino.library"
    private const val RECENT_LIMIT = 24
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mutex = Mutex()
    private val state = MutableStateFlow(CasinoLibrary())

    @Volatile
    var preferences: () -> PreferencesStorage = { AppGraph.preferencesStorage }

    @Volatile
    var playerId: () -> String = { AppGraph.playerStateStore.me()?.playerPublicId.orEmpty() }

    val library: StateFlow<CasinoLibrary> = state.asStateFlow()

    suspend fun load() = mutex.withLock {
        state.value = read(key())
    }

    fun peek(): CasinoLibrary = state.value

    suspend fun toggleFavorite(game: CasinoDemoGame): CasinoLibrary = mutex.withLock {
        val current = read(key())
        val id = game.id.trim()
        if (id.isEmpty()) return@withLock current
        val favoriteIds = if (id in current.favoriteIds) current.favoriteIds - id else listOf(id) + current.favoriteIds
        persist(current.copy(favoriteIds = favoriteIds, games = rememberGame(current.games, game)))
    }

    suspend fun recordPlayed(game: CasinoDemoGame): CasinoLibrary = mutex.withLock {
        val current = read(key())
        val id = game.id.trim()
        if (id.isEmpty()) return@withLock current
        val recentIds = (listOf(id) + current.recentIds.filter { it != id }).take(RECENT_LIMIT)
        persist(current.copy(recentIds = recentIds, games = rememberGame(current.games, game)))
    }

    fun games(ids: List<String>, catalog: List<CasinoDemoGame> = emptyList()): List<CasinoDemoGame> {
        val known = (state.value.games + catalog).distinctBy(CasinoDemoGame::id).associateBy { it.id }
        return ids.mapNotNull(known::get)
    }

    fun clearMemory() {
        state.value = CasinoLibrary()
    }

    private fun rememberGame(games: List<CasinoDemoGame>, game: CasinoDemoGame): List<CasinoDemoGame> =
        (listOf(game) + games.filter { it.id != game.id }).take(80)

    private suspend fun persist(value: CasinoLibrary): CasinoLibrary {
        preferences().putString(key(), json.encodeToString(value))
        state.value = value
        return value
    }

    private suspend fun read(storageKey: String): CasinoLibrary {
        val raw = preferences().getString(storageKey).orEmpty()
        if (raw.isBlank()) return CasinoLibrary()
        return runCatching { json.decodeFromString<CasinoLibrary>(raw) }.getOrDefault(CasinoLibrary())
    }

    private fun key(): String = "$STORAGE_KEY:${playerId().trim().ifBlank { "device" }}"
}
