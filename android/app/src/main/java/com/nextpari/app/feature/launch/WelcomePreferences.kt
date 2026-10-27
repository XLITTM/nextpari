package com.nextpari.app.feature.launch

import com.nextpari.app.core.storage.PreferencesStorage

/**
 * First-run welcome completion. This is a non-secret flag.
 */
class WelcomePreferences(
    private val storage: PreferencesStorage,
) {
    suspend fun isCompleted(): Boolean = storage.getString(KEY) == DONE

    suspend fun markCompleted() {
        storage.putString(KEY, DONE)
    }

    companion object {
        const val KEY = "nextpari-welcome-completed"
        private const val DONE = "1"
    }
}
