package com.nextpari.app.core.ui.theme

import com.nextpari.app.core.storage.PreferencesStorage

class ThemeRepository(
    private val preferences: PreferencesStorage,
) {
    suspend fun read(): String? = preferences.getString(KEY)

    suspend fun write(theme: String) {
        require(theme == LIGHT || theme == DARK)
        preferences.putString(KEY, theme)
    }

    /** Dark VIP Neon unless the player explicitly saved the light theme. */
    fun isDark(stored: String?): Boolean = stored != LIGHT

    companion object {
        const val KEY = "nextpari-theme"
        const val LIGHT = "light"
        const val DARK = "dark"
    }
}
