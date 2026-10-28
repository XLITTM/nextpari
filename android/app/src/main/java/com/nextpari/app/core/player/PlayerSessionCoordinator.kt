package com.nextpari.app.core.player

import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.session.SessionRepository
import com.nextpari.app.feature.auth.LoginIdentifier
import com.nextpari.app.feature.auth.OneClickContinue
import com.nextpari.app.feature.auth.RegistrationCopy
import com.nextpari.app.feature.auth.RegistrationRequest
import com.nextpari.app.feature.auth.RegistrationResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import retrofit2.Response

class PlayerSessionCoordinator(
    private val api: PlayerApi,
    private val cookieJar: SecureCookieJar,
    private val sessions: SessionRepository,
    private val store: PlayerStateStore,
    private val json: Json,
    private val onSessionCleared: () -> Unit = {},
) {
    private var pendingOneClick: PlayerMeSnapshot? = null

    suspend fun login(identifier: LoginIdentifier, password: String): ApiResult<AuthSession> {
        val value = identifier.raw().trim()
        if (value.isEmpty() || password.isBlank()) {
            return ApiResult.Err(NetworkError.Unknown("Введите логин и пароль"))
        }
        val method = identifier.method()
        val response = runCatching { api.login(identifier.loginBody(password)) }
            .getOrElse { return ApiResult.Err(com.nextpari.app.core.network.ApiErrorMapper.fromThrowable(it)) }
        val body = response.jsonBody(json)
        if (!response.isSuccessful) {
            return ApiResult.Err(PlayerJsonMapper.mapAuthError(PlayerJsonMapper.errorCode(body)))
        }
        return refreshPlayerState(loginMethod = method)
    }

    suspend fun register(request: RegistrationRequest): RegistrationResult {
        RegistrationCopy.clientError(request)?.let { return RegistrationResult.Failed(it) }
        val currency = RegistrationCopy.normalizeCurrency(request.currency)
            ?: return RegistrationResult.Failed(NetworkError.Unknown(RegistrationCopy.CURRENCY))
        val response = runCatching { api.register(request.wireBody(currency)) }
            .getOrElse { return RegistrationResult.Failed(com.nextpari.app.core.network.ApiErrorMapper.fromThrowable(it)) }
        val body = response.jsonBody(json)
        val code = PlayerJsonMapper.errorCode(body)
        if (response.code() == 409 && code == "EMAIL_CONFIRMATION_REQUIRED") {
            pendingOneClick = null
            return RegistrationResult.EmailConfirmationRequired
        }
        if (!response.isSuccessful) {
            return RegistrationResult.Failed(
                PlayerJsonMapper.mapAuthError(code, NetworkError.Unknown(RegistrationCopy.FAILED)),
            )
        }
        val oneClick = body?.obj("oneClick")
        if (request.method == "one_click" || oneClick != null) {
            val playerId = PlayerJsonMapper.parsePublicPlayerId(
                oneClick?.str("playerId").orEmpty().ifBlank { body?.obj("player")?.str("publicId").orEmpty() },
            )
            val issuedPassword = oneClick?.str("password").orEmpty()
            if (playerId.isBlank() || issuedPassword.length < 8) {
                pendingOneClick = null
                return RegistrationResult.Failed(NetworkError.Unknown(RegistrationCopy.FAILED))
            }
            val snapshot = body?.let(PlayerJsonMapper::snapshotFromBody)
            pendingOneClick = snapshot
            return RegistrationResult.OneClickIssued(
                playerId = playerId,
                password = issuedPassword,
                canEnter = snapshot != null,
            )
        }
        pendingOneClick = null
        val snapshot = body?.let(PlayerJsonMapper::snapshotFromBody)
        if (snapshot == null) return RegistrationResult.EmailConfirmationRequired
        return when (val established = establishSession(request.method)) {
            is ApiResult.Ok -> RegistrationResult.Authenticated(established.data)
            is ApiResult.Err -> RegistrationResult.Failed(established.error)
        }
    }

    suspend fun continueOneClick(): OneClickContinue {
        if (pendingOneClick == null) return OneClickContinue.NeedLogin(RegistrationCopy.ONE_CLICK_LOGIN)
        return when (val established = establishSession("one_click")) {
            is ApiResult.Ok -> {
                pendingOneClick = null
                OneClickContinue.Entered(established.data)
            }
            is ApiResult.Err -> OneClickContinue.Failed(established.error)
        }
    }

    suspend fun logout() {
        try {
            api.logout()
        } catch (_: Exception) {
            /* still clear local session */
        } finally {
            clearLocal()
        }
    }

    suspend fun restore(): ApiResult<AuthSession> {
        if (!cookieJar.hasPlayerSessionCookies()) {
            clearLocal()
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        return refreshPlayerState(loginMethod = sessions.session.value.loginMethod.ifBlank { "restore" })
    }

    suspend fun refreshPlayerState(loginMethod: String? = null): ApiResult<AuthSession> {
        val response = runCatching { api.me() }
            .getOrElse { return ApiResult.Err(com.nextpari.app.core.network.ApiErrorMapper.fromThrowable(it)) }
        val body = response.jsonBody(json)
        if (response.code() == 401 || response.code() == 403) {
            clearLocal()
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        if (!response.isSuccessful) {
            return ApiResult.Err(
                PlayerJsonMapper.mapAuthError(
                    PlayerJsonMapper.errorCode(body),
                    NetworkError.Unknown("Не удалось загрузить профиль"),
                ),
            )
        }
        val snapshot = body?.let(PlayerJsonMapper::snapshotFromBody)
            ?: run {
                clearLocal()
                return ApiResult.Err(NetworkError.Unauthorized)
            }
        refreshSecondaryReads()
        return hydrateAuthenticated(snapshot, loginMethod ?: sessions.session.value.loginMethod)
    }

    private suspend fun establishSession(loginMethod: String): ApiResult<AuthSession> {
        return refreshPlayerState(loginMethod = loginMethod)
    }

    fun applyBalanceAfter(balanceAfter: Double, expectedWalletId: String = ""): Boolean =
        store.applyBalanceAfter(balanceAfter, expectedWalletId)

    fun onUnauthorized() {
        clearLocal()
    }

    private suspend fun refreshSecondaryReads() {
        runCatching {
            val walletsResponse = api.wallets()
            val walletsBody = walletsResponse.jsonBody(json)
            if (walletsResponse.isSuccessful) {
                walletsBody?.let(PlayerJsonMapper::walletsFromBody)?.let { rows ->
                    store.applyWallets(mappedWalletsToRows(rows))
                }
            }
        }
        runCatching {
            val profileResponse = api.profile()
            val profileBody = profileResponse.jsonBody(json)
            if (profileResponse.isSuccessful) {
                val nested = profileBody?.obj("profile") ?: profileBody
                val email = store.me()?.email.orEmpty()
                if (nested != null) {
                    store.applyProfile(PlayerJsonMapper.profileFromBody(nested, email).toQuestionnaire())
                }
            }
        }
    }

    private suspend fun hydrateAuthenticated(snapshot: PlayerMeSnapshot, loginMethod: String): ApiResult<AuthSession> {
        store.applyMe(snapshot)
        val session = AuthSession(
            playerPublicId = snapshot.playerPublicId,
            displayName = playerDisplayName(snapshot.profile),
            loginMethod = loginMethod,
            isAuthenticated = true,
            email = snapshot.email,
        )
        sessions.setSession(session)
        return ApiResult.Ok(session)
    }

    private fun clearLocal() {
        pendingOneClick = null
        cookieJar.clear()
        store.clear()
        sessions.clearImmediate()
        onSessionCleared()
    }
}

private fun RegistrationRequest.wireBody(currency: String): JsonObject = when (method) {
    "email" -> buildJsonObject {
        put("method", "email")
        put("email", email.trim())
        put("password", password)
        put("ageConfirmed", true)
        put("currency", currency)
    }
    "phone" -> buildJsonObject {
        put("method", "phone")
        put("phone", RegistrationCopy.compactPhone(phone))
        put("password", password)
        put("ageConfirmed", true)
        put("currency", currency)
    }
    else -> buildJsonObject {
        put("method", "one_click")
        put("ageConfirmed", true)
        put("currency", currency)
    }
}

private fun LoginIdentifier.raw(): String = when (this) {
    is LoginIdentifier.Email -> value
    is LoginIdentifier.Phone -> value
    is LoginIdentifier.PlayerId -> value
}

private fun LoginIdentifier.method(): String = when (this) {
    is LoginIdentifier.Email -> "email"
    is LoginIdentifier.Phone -> "phone"
    is LoginIdentifier.PlayerId -> "player_id"
}

private fun LoginIdentifier.loginBody(password: String): JsonObject = when (this) {
    is LoginIdentifier.Email -> buildJsonObject {
        put("email", value.trim())
        put("password", password)
    }
    is LoginIdentifier.Phone -> buildJsonObject {
        put("mode", "phone")
        put("phone", value.replace(Regex("[\\s()-]"), ""))
        put("password", password)
    }
    is LoginIdentifier.PlayerId -> buildJsonObject {
        put("mode", "identifier")
        put("identifier", value.trim())
        put("password", password)
    }
}

private fun Response<JsonObject>.jsonBody(json: Json): JsonObject? {
    body()?.let { return it }
    val raw = errorBody()?.string().orEmpty()
    if (raw.isBlank()) return null
    return runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
}
