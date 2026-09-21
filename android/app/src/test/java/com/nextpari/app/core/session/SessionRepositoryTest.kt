package com.nextpari.app.core.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class SessionRepositoryTest {
    @Test
    fun setSessionThenClearReturnsAnonymous() = runTest {
        val repository = InMemorySessionRepository()
        assertThat(repository.session.value.isAuthenticated).isFalse()

        repository.setSession(
            AuthSession(
                playerPublicId = "DEV001",
                displayName = "Игрок",
                loginMethod = "email",
                isAuthenticated = true,
            ),
        )
        assertThat(repository.session.value.isAuthenticated).isTrue()

        repository.clear()
        assertThat(repository.session.value).isEqualTo(AuthSession.Anonymous)
        assertThat(repository.session.value.isAuthenticated).isFalse()
    }
}
