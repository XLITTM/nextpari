package com.nextpari.app.feature.launch

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import kotlinx.coroutines.test.runTest
import org.junit.Test

class WelcomePreferencesTest {
    @Test
    fun completionIsRemembered() = runTest {
        val storage = InMemoryPreferencesStorage()
        val preferences = WelcomePreferences(storage)

        assertThat(preferences.isCompleted()).isFalse()
        preferences.markCompleted()
        assertThat(preferences.isCompleted()).isTrue()
        assertThat(WelcomePreferences(storage).isCompleted()).isTrue()
    }
}
