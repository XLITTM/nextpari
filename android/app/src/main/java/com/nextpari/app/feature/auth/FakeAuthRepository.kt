package com.nextpari.app.feature.auth

import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.session.SessionRepository

/**
 * DEV/mock authentication only. Does not call Nextpari APIs or Supabase.
 * Replace with a real AuthRepository that talks to Nextpari backend later.
 */
class FakeAuthRepository(
    private val sessionRepository: SessionRepository,
) : AuthRepository {
    override suspend fun login(identifier: LoginIdentifier, password: String): ApiResult<AuthSession> {
        val value = when (identifier) {
            is LoginIdentifier.Email -> identifier.value
            is LoginIdentifier.Phone -> identifier.value
            is LoginIdentifier.PlayerId -> identifier.value
        }.trim()
        if (value.isEmpty() || password.isBlank()) {
            return ApiResult.Err(NetworkError.Unknown("Введите логин и пароль"))
        }
        val method = when (identifier) {
            is LoginIdentifier.Email -> "email"
            is LoginIdentifier.Phone -> "phone"
            is LoginIdentifier.PlayerId -> "player_id"
        }
        val session = AuthSession(
            playerPublicId = "DEV001",
            displayName = "Игрок",
            loginMethod = method,
            isAuthenticated = true,
        )
        sessionRepository.setSession(session)
        return ApiResult.Ok(session)
    }

    override suspend fun logout() {
        sessionRepository.clear()
    }
}
