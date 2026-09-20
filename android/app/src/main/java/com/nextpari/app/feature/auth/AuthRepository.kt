package com.nextpari.app.feature.auth

import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.session.AuthSession

sealed class LoginIdentifier {
    data class Email(val value: String) : LoginIdentifier()
    data class Phone(val value: String) : LoginIdentifier()
    data class PlayerId(val value: String) : LoginIdentifier()
}

interface AuthRepository {
    suspend fun login(identifier: LoginIdentifier, password: String): ApiResult<AuthSession>
    suspend fun logout()
}
