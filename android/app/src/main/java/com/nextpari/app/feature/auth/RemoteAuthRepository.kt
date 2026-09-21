package com.nextpari.app.feature.auth

import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.player.PlayerSessionCoordinator
import com.nextpari.app.core.session.AuthSession

class RemoteAuthRepository(
    private val coordinator: PlayerSessionCoordinator,
) : AuthRepository {
    override suspend fun login(identifier: LoginIdentifier, password: String): ApiResult<AuthSession> {
        return coordinator.login(identifier, password)
    }

    override suspend fun logout() {
        coordinator.logout()
    }
}
