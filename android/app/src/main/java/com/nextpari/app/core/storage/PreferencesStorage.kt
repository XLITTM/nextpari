package com.nextpari.app.core.storage

/**
 * Non-sensitive preference keys only (theme, last login method label, etc.).
 *
 * TODO(A001): production access/refresh tokens must use Android Keystore-backed
 * secure storage. Never persist secrets through this DataStore wrapper.
 */
interface PreferencesStorage {
    suspend fun putString(key: String, value: String)
    suspend fun getString(key: String): String?
}

class InMemoryPreferencesStorage : PreferencesStorage {
    private val values = mutableMapOf<String, String>()

    override suspend fun putString(key: String, value: String) {
        values[key] = value
    }

    override suspend fun getString(key: String): String? = values[key]
}
