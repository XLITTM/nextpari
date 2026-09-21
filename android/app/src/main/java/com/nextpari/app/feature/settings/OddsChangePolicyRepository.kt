package com.nextpari.app.feature.settings

import com.nextpari.app.core.storage.PreferencesStorage

enum class OddsChangePolicy(val id: String) {
    ANY("any"),
    INCREASE("increase"),
    NONE("none");

    companion object {
        val ids: List<String> = entries.map { it.id }

        fun fromStored(value: String?): OddsChangePolicy =
            entries.firstOrNull { it.id == value } ?: INCREASE
    }
}

class OddsChangePolicyRepository(
    private val preferences: PreferencesStorage,
) {
    suspend fun read(): OddsChangePolicy = OddsChangePolicy.fromStored(preferences.getString(KEY))

    suspend fun write(policy: OddsChangePolicy) {
        require(policy.id in OddsChangePolicy.ids)
        preferences.putString(KEY, policy.id)
    }

    companion object {
        const val KEY = "nextpari-odds-change-policy"
    }
}
