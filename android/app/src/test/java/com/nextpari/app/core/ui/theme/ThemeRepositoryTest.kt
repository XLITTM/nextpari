package com.nextpari.app.core.ui.theme

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import kotlinx.coroutines.test.runTest
import org.junit.Test

class ThemeRepositoryTest {
    @Test
    fun E_themePreferencePersistsWithoutTokens() = runTest {
        val prefs = InMemoryPreferencesStorage()
        val repository = ThemeRepository(prefs)

        assertThat(repository.read()).isNull()
        assertThat(repository.isDark(null)).isFalse()

        repository.write(ThemeRepository.DARK)
        assertThat(repository.read()).isEqualTo("dark")
        assertThat(repository.isDark(repository.read())).isTrue()

        repository.write(ThemeRepository.LIGHT)
        assertThat(repository.read()).isEqualTo("light")
        assertThat(prefs.getString(ThemeRepository.KEY)).isEqualTo("light")
        assertThat(prefs.getString("access_token")).isNull()
        assertThat(prefs.getString("refresh_token")).isNull()
    }
}
