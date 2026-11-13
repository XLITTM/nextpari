package com.nextpari.app.core.player

import com.nextpari.app.core.network.ApiErrorMapper
import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.network.session.WalletResponseScope
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.session.SessionRepository
import com.nextpari.app.feature.auth.LoginIdentifier
import com.nextpari.app.feature.auth.OneClickContinue
import com.nextpari.app.feature.auth.RegistrationCopy
import com.nextpari.app.feature.auth.RegistrationRequest
import com.nextpari.app.feature.auth.RegistrationResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val identityLock = Any()
    private val authRequests = Mutex()
    private var pendingOneClick: PlayerMeSnapshot? = null

    suspend fun login(identifier: LoginIdentifier, password: String): ApiResult<AuthSession> = authRequests.withLock {
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
        return establishSession(method)
    }

    suspend fun register(request: RegistrationRequest): RegistrationResult = authRequests.withLock {
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

    suspend fun continueOneClick(): OneClickContinue = authRequests.withLock {
        if (pendingOneClick == null) return OneClickContinue.NeedLogin(RegistrationCopy.ONE_CLICK_LOGIN)
        return when (val established = establishSession("one_click")) {
            is ApiResult.Ok -> {
                pendingOneClick = null
                OneClickContinue.Entered(established.data)
            }
            is ApiResult.Err -> OneClickContinue.Failed(established.error)
        }
    }

    suspend fun logout() = authRequests.withLock {
        synchronized(identityLock) { store.clear() }
        try {
            api.logout()
        } catch (_: Exception) {
            /* still clear local session */
        } finally {
            clearLocal()
        }
    }

    suspend fun restore(): ApiResult<AuthSession> = authRequests.withLock {
        if (!cookieJar.hasPlayerSessionCookies()) {
            clearLocal()
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        return refreshPlayerState(loginMethod = sessions.session.value.loginMethod.ifBlank { "restore" })
    }

    suspend fun refreshPlayerState(loginMethod: String? = null): ApiResult<AuthSession> {
        val read = store.beginWalletRead()
        if (read.playerId == null && loginMethod == null) return ApiResult.Err(NetworkError.Unauthorized)
        val scope = WalletResponseScope { store.isCurrentWalletRead(read) }
        val response = try {
            api.me(scope)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return ApiResult.Err(ApiErrorMapper.fromThrowable(error))
        }
        if (!store.isCurrentSession(read)) return ApiResult.Err(NetworkError.Unauthorized)
        val body = response.jsonBody(json)
        if (response.isUnauthorized()) {
            onUnauthorized(read)
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        if (!response.isSuccessful) {
            return ApiResult.Err(PlayerJsonMapper.mapAuthError(
                PlayerJsonMapper.errorCode(body), NetworkError.Unknown("Не удалось загрузить профиль"),
            ))
        }
        val snapshot = body?.let(PlayerJsonMapper::snapshotFromBody)
        if (snapshot == null || (read.playerId != null && read.playerId != snapshot.playerPublicId)) {
            onUnauthorized(read)
            return ApiResult.Err(NetworkError.Unauthorized)
        }

        val walletsResponse = secondaryRead { api.wallets(scope) }
        if (walletsResponse?.isUnauthorized() == true) {
            onUnauthorized(read)
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        val wallets = walletsResponse?.takeIf { it.isSuccessful }?.body()
            ?.let { PlayerJsonMapper.walletsFromBody(it, snapshot.playerPublicId) }
        val profileResponse = secondaryRead { api.profile(scope) }
        if (profileResponse?.isUnauthorized() == true) {
            onUnauthorized(read)
            return ApiResult.Err(NetworkError.Unauthorized)
        }
        val profile = profileResponse?.takeIf { it.isSuccessful }?.body()?.let {
            PlayerJsonMapper.profileFromBody(it.obj("profile") ?: it, snapshot.email).toQuestionnaire()
        }
        return synchronized(identityLock) {
            if (!store.hydrate(read, snapshot, profile, wallets)) return@synchronized ApiResult.Err(NetworkError.Unauthorized)
            val session = AuthSession(
                playerPublicId = snapshot.playerPublicId,
                displayName = playerDisplayName(snapshot.profile),
                loginMethod = loginMethod ?: sessions.session.value.loginMethod,
                isAuthenticated = true,
                email = snapshot.email,
            )
            sessions.setSession(session)
            ApiResult.Ok(session)
        }
    }

    private suspend fun establishSession(loginMethod: String): ApiResult<AuthSession> {
        synchronized(identityLock) {
            store.clear()
            sessions.clearImmediate()
        }
        return refreshPlayerState(loginMethod = loginMethod)
    }

    fun onUnauthorized() = clearLocal()

    fun onUnauthorized(read: WalletRead) {
        synchronized(identityLock) {
            if (store.isCurrentWalletRead(read)) clearLocal()
        }
    }

    private suspend fun secondaryRead(call: suspend () -> Response<JsonObject>): Response<JsonObject>? =
        try {
            call()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }

    private fun clearLocal() {
        synchronized(identityLock) {
            pendingOneClick = null
            store.clear()
            cookieJar.clear()
            sessions.clearImmediate()
            onSessionCleared()
        }
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

private fun Response<JsonObject>.isUnauthorized(): Boolean = code() == 401 || code() == 403

private fun Response<JsonObject>.jsonBody(json: Json): JsonObject? {
    body()?.let { return it }
    val raw = errorBody()?.string().orEmpty()
    if (raw.isBlank()) return null
    return runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
}
