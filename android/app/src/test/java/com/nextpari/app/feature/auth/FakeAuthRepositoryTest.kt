package com.nextpari.app.feature.auth

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.session.InMemorySessionRepository
import kotlinx.coroutines.test.runTest
import org.junit.Test

class FakeAuthRepositoryTest {
    @Test
    fun loginWithEmailTransitionsToAuthenticatedMockSession() = runTest {
        val sessions = InMemorySessionRepository()
        val repository = FakeAuthRepository(sessions)

        val result = repository.login(LoginIdentifier.Email("player@nextpari.dev"), "password")

        assertThat(result).isInstanceOf(ApiResult.Ok::class.java)
        val session = sessions.session.value
        assertThat(session.isAuthenticated).isTrue()
        assertThat(session.playerPublicId).isEqualTo("DEV001")
        assertThat(session.loginMethod).isEqualTo("email")
    }

    @Test
    fun loginWithPhoneAndPlayerIdAreAcceptedByMock() = runTest {
        val sessions = InMemorySessionRepository()
        val repository = FakeAuthRepository(sessions)

        repository.login(LoginIdentifier.Phone("+99360000000"), "password")
        assertThat(sessions.session.value.loginMethod).isEqualTo("phone")

        repository.login(LoginIdentifier.PlayerId("110790"), "password")
        assertThat(sessions.session.value.loginMethod).isEqualTo("player_id")
        assertThat(sessions.session.value.isAuthenticated).isTrue()
    }

    @Test
    fun emptyCredentialsStayAnonymous() = runTest {
        val sessions = InMemorySessionRepository()
        val repository = FakeAuthRepository(sessions)

        val result = repository.login(LoginIdentifier.Email("  "), "")

        assertThat(result).isInstanceOf(ApiResult.Err::class.java)
        assertThat(sessions.session.value.isAuthenticated).isFalse()
    }

    @Test
    fun H_logoutClearsSession() = runTest {
        val sessions = InMemorySessionRepository()
        val repository = FakeAuthRepository(sessions)
        repository.login(LoginIdentifier.Email("player@nextpari.dev"), "password")

        repository.logout()

        assertThat(sessions.session.value.isAuthenticated).isFalse()
        assertThat(sessions.session.value).isEqualTo(com.nextpari.app.core.session.AuthSession.Anonymous)
    }
}
