package com.nextpari.app.feature.favorites

import com.nextpari.app.core.storage.PreferencesStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class SportsFavorites(
    val matchIds: Set<String> = emptySet(),
    val leagueIds: Set<String> = emptySet(),
    val sportIds: Set<String> = emptySet(),
)

class SportsFavoritesStore(
    private val preferences: PreferencesStorage,
    private val playerId: () -> String = { "" },
) {
    private val mutex = Mutex()
    private val state = MutableStateFlow(SportsFavorites())
    val favorites: StateFlow<SportsFavorites> = state.asStateFlow()

    suspend fun load() = mutex.withLock {
        val storageKey = key()
        val saved = read(storageKey)
        if (storageKey == key()) state.value = saved
    }

    suspend fun matchIds(owner: String): Set<String> = mutex.withLock { read(key(owner)).matchIds }

    suspend fun toggleMatch(id: String, owner: String): Set<String> =
        toggle(id, key(owner), { it.matchIds }) { current, next -> current.copy(matchIds = next) }.matchIds

    suspend fun toggleLeague(id: String) = toggle(id, key(), { it.leagueIds }) { current, next -> current.copy(leagueIds = next) }

    suspend fun toggleSport(id: String) = toggle(id, key(), { it.sportIds }) { current, next -> current.copy(sportIds = next) }

    private suspend fun toggle(
        id: String,
        storageKey: String,
        readSet: (SportsFavorites) -> Set<String>,
        write: (SportsFavorites, Set<String>) -> SportsFavorites,
    ): SportsFavorites = mutex.withLock {
        val item = id.trim()
        val current = read(storageKey)
        if (item.isEmpty()) return@withLock current
        val source = readSet(current)
        val next = if (item in source) source - item else source + item
        val updated = write(current, next)
        preferences.putString(storageKey, encode(updated))
        if (storageKey == key()) state.value = updated
        updated
    }

    private fun key(owner: String = playerId()): String = "$STORAGE_KEY:${owner.trim().ifBlank { "device" }}"

    private suspend fun read(storageKey: String): SportsFavorites {
        val raw = preferences.getString(storageKey).orEmpty()
        if (raw.isBlank()) return SportsFavorites()
        val parsed = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(raw) as JsonObject }.getOrNull()
            ?: return SportsFavorites()
        return SportsFavorites(
            matchIds = parsed.stringSet("favoriteMatchIds"),
            leagueIds = parsed.stringSet("favoriteLeagueIds"),
            sportIds = parsed.stringSet("favoriteSportIds"),
        )
    }

    private fun encode(value: SportsFavorites): String = buildJsonObject {
        put("favoriteMatchIds", jsonStrings(value.matchIds))
        put("favoriteLeagueIds", jsonStrings(value.leagueIds))
        put("favoriteSportIds", jsonStrings(value.sportIds))
    }.toString()

    private fun jsonStrings(values: Set<String>): JsonArray =
        JsonArray(values.map { kotlinx.serialization.json.JsonPrimitive(it) })

    companion object {
        const val STORAGE_KEY = "nextpari_favorites"
    }
}

private fun JsonObject.stringSet(key: String): Set<String> {
    val array = this[key] as? JsonArray ?: return emptySet()
    return array.mapNotNull { element ->
        (element as? kotlinx.serialization.json.JsonPrimitive)?.content?.trim()?.takeIf { it.isNotEmpty() }
    }.toSet()
}
