package com.nextpari.app.feature.favorites

import com.nextpari.app.core.storage.PreferencesStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
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
    private val state = MutableStateFlow(SportsFavorites())
    val favorites: StateFlow<SportsFavorites> = state.asStateFlow()

    suspend fun load() {
        state.value = read(key())
    }

    suspend fun toggleLeague(id: String) = toggle(id, { it.leagueIds }) { current, next -> current.copy(leagueIds = next) }

    suspend fun toggleSport(id: String) = toggle(id, { it.sportIds }) { current, next -> current.copy(sportIds = next) }

    private suspend fun toggle(
        id: String,
        readSet: (SportsFavorites) -> Set<String>,
        write: (SportsFavorites, Set<String>) -> SportsFavorites,
    ) {
        val key = id.trim()
        if (key.isEmpty()) return
        val current = read(key())
        val source = readSet(current)
        val next = if (key in source) source - key else source + key
        val updated = write(current, next)
        preferences.putString(key(), encode(updated))
        state.value = updated
    }

    private fun key(): String {
        val id = playerId().trim().ifBlank { "device" }
        return "$STORAGE_KEY:$id"
    }

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
